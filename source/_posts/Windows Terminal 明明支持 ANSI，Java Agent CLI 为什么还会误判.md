---
title: Windows Terminal 明明支持 ANSI，Java Agent CLI 为什么还会误判？
date: 2026-08-18 15:00:00
updated: 2026-08-18 15:00:00
categories:
  - Java
tags:
  - Java
  - CLI
  - JLine
  - Windows Terminal
  - 终端兼容性
keywords: Java,Agent CLI,JLine,ANSI,Windows Terminal,PowerShell,native access
description: Windows Terminal 明明支持 ANSI，Java Agent CLI 却仍然回退到 plain 模式。本文从 JLine 原生终端初始化失败入手，拆解 native access 误判、dumb terminal 降级和终端能力探测的正确处理方式。
---

在 Windows Terminal + PowerShell 7 中启动一个 Java Agent CLI 时，我遇到了一个很容易误导排查方向的问题：程序提示终端不支持 ANSI，并将 inline 模式回退到了 plain 模式。

但现场表现并不符合这个结论。彩色 Logo 能正常显示，Windows Terminal 也原生支持 ANSI 转义序列，PowerShell 版本足够新，输出也不是被重定向到文件或管道。

真正的问题不是终端不支持 ANSI，而是 Java CLI 在创建交互式终端时走进了错误的降级路径。

<!-- more -->

## 现象：颜色正常，inline 却被禁用

启动命令很普通：

```powershell
java -jar target/agent-cli-1.0-SNAPSHOT.jar
```

程序随后输出：

```text
终端不支持 ANSI，inline 模式回退到 plain
```

这类提示很容易让人先去检查 Windows 设置。但如果彩色 Banner 已经正常显示，至少可以说明普通 ANSI 输出链路大概率没有问题。

这里要区分两件事：

- 直接向标准输出写 ANSI 字符串；
- 通过 JLine 创建支持光标移动、行内编辑和状态栏的交互式终端。

前者正常，并不代表后者一定初始化成功。

## 排查：环境变量都不是根因

最开始检查了几个常见因素：

- `TERM` 是否为 `dumb`；
- 是否设置了 `NO_COLOR`；
- Windows 控制台是否开启 Virtual Terminal Processing；
- JLine 是否找到 native provider；
- UTF-8 与系统代码页是否冲突。

但实际环境中，`TERM` 和 `NO_COLOR` 都没有解释这个问题。真正的线索来自 JLine 的原生终端创建异常。

打开异常日志后，关键错误是：

```text
UnsupportedOperationException:
Native access is not enabled for current module
```

加入下面的 JVM 参数后，inline 模式立即恢复：

```powershell
java --enable-native-access=ALL-UNNAMED `
  -jar target/agent-cli-1.0-SNAPSHOT.jar
```

这说明 Windows Terminal 的 ANSI 能力没有问题，失败点在 JLine 的 native terminal 初始化。

## 真正原因：JLine 把 native access 状态判断错了

项目当时使用的是 JLine 4.0.0 的 JDK 11 classifier：

```xml
<dependency>
    <groupId>org.jline</groupId>
    <artifactId>jline</artifactId>
    <version>4.0.0</version>
    <classifier>jdk11</classifier>
</dependency>
```

在部分 JDK 21 构建环境中，JDK 已经提供了相关 native-access API，但 native access 的启用和强制检查又处在版本演进阶段。JLine 4.0.0 看到 API 存在、检测结果却返回 `false`，于是误以为 JNI 不可用，最终无法创建原生终端。

整个过程大致是这样的：

```text
Windows Terminal 支持 ANSI
        ↓
JLine native terminal 初始化失败
        ↓
异常被吞掉或转成 dumb terminal
        ↓
应用看到 terminal type=dumb
        ↓
inline 模式被禁用
```

所以，“终端不支持 ANSI”描述的只是最终状态，并不是最初的故障原因。

## 修复一：升级 JLine

首先将 JLine 升级到 4.1.3：

```xml
<dependency>
    <groupId>org.jline</groupId>
    <artifactId>jline</artifactId>
    <version>4.1.3</version>
    <classifier>jdk11</classifier>
</dependency>
```

新版修复了部分 JDK 21 构建环境下的 native-access 判断问题。升级后，可以直接使用普通命令启动：

```powershell
java -jar target/agent-cli-1.0-SNAPSHOT.jar
```

不再需要额外添加：

```text
--enable-native-access=ALL-UNNAMED
```

这类问题的优先修复点应该是终端库版本，而不是修改用户的 Windows 设置。

## 修复二：原生终端优先，失败后再降级

不要一开始就允许 JLine 静默创建 dumb terminal：

```java
TerminalBuilder.builder()
        .system(true)
        .dumb(true)
        .build();
```

这种写法会让真正的初始化异常消失，应用最后只能看到一个 `dumb` 终端。

更合理的方式是先强制尝试原生终端，失败后才明确降级：

```java
try {
    return TerminalBuilder.builder()
            .system(true)
            .dumb(false)
            .build();
} catch (IOException | RuntimeException nativeFailure) {
    log.warn("无法创建原生交互终端，回退到 dumb terminal", nativeFailure);

    return TerminalBuilder.builder()
            .system(true)
            .dumb(true)
            .build();
}
```

第一次失败的异常应该保留下来。这样在用户遇到问题时，日志可以明确区分：是 native provider 初始化失败，还是当前环境本来就不具备交互式终端能力。

## 修复三：不要让 `TERM=dumb` 二次否定真实探测结果

有些实现会在 JLine 创建终端之后，再直接读取环境变量：

```java
if ("dumb".equalsIgnoreCase(System.getenv("TERM"))) {
    return false;
}
```

这在 Windows 上并不可靠。IDE、CI、Agent Harness 或父进程都可能遗留一个并不准确的 `TERM=dumb`。如果 JLine 已经成功创建了 Windows 原生终端，就应该优先以 `Terminal` 实例的结果为准。

例如：

```java
static boolean supportsAnsi(Terminal terminal) {
    if (terminal == null) {
        return false;
    }

    String type = terminal.getType();
    return type == null || !"dumb".equalsIgnoreCase(type);
}
```

重点不是完全忽略环境变量，而是不要让一次粗粒度的环境变量判断覆盖已经完成的终端探测。

## `NO_COLOR` 不等于“不支持 ANSI”

`NO_COLOR` 的语义应该是关闭颜色样式，而不是关闭整个 ANSI 交互能力。

两者应当分开处理：

```text
NO_COLOR       → 关闭颜色样式
dumb terminal  → 关闭 ANSI 交互布局
```

即使关闭颜色，inline 模式仍然可能需要：

- 光标移动；
- 行内编辑；
- 底部状态栏；
- `printAbove`；
- 其他终端布局能力。

如果把 `NO_COLOR` 直接等同于“终端不支持 ANSI”，就会无意中禁用一整套交互功能。

## 回退提示应该描述真实原因

原来的提示：

```text
终端不支持 ANSI
```

信息过于笼统，容易把初始化失败伪装成用户环境问题。

更好的提示应该区分至少两种情况：

```text
无法创建原生交互终端，inline 模式回退到 plain:
UnsupportedOperationException: Native access is not enabled...
```

以及：

```text
当前为 dumb 终端，inline 模式回退到 plain
```

前者表示终端初始化失败，后者才表示当前终端确实只能提供有限能力。

## 额外处理：统一 JLine 的 UTF-8 编码

Windows PowerShell、IDE 内置终端和 Java 进程之间还可能存在编码探测不一致的问题。即使终端能力已经恢复，中文输入仍可能在进入 `LineReader` 之前变成问号。

因此可以显式统一 JLine 三条流的编码：

```java
TerminalBuilder.builder()
        .encoding(StandardCharsets.UTF_8)
        .stdinEncoding(StandardCharsets.UTF_8)
        .stdoutEncoding(StandardCharsets.UTF_8)
        .stderrEncoding(StandardCharsets.UTF_8);
```

这不能替代终端能力探测，但能减少 Windows 不同宿主环境之间的编码差异。

## 验证：普通启动命令即可恢复完整交互

修复后，我对终端相关功能进行了验证：

- 终端相关测试 35 项全部通过；
- TUI smoke 测试 107 项全部通过；
- Windows Terminal + PowerShell 使用普通 `java -jar` 启动；
- 彩色 Banner 正常显示；
- `*` 行内输入提示正常；
- 底部状态栏正常；
- 不再出现“不支持 ANSI”的误导性提示；
- 不需要修改电脑设置；
- 不需要额外添加 native-access JVM 参数。

## 这次问题带来的几个经验

1. 能显示颜色，不代表 native terminal 一定创建成功。普通 ANSI 输出和 JLine 交互式终端是两条不同链路。
2. “终端不支持 ANSI”可能只是降级结果，真正原因可能藏在被吞掉的 native provider 异常里。
3. 不要重复探测终端能力。JLine 已经创建出 `Terminal` 后，应优先相信它的最终结果。
4. `TERM=dumb` 在 Windows 上不一定可信，IDE、CI、Agent Harness 或父进程都可能提供错误值。
5. `NO_COLOR` 只应该影响颜色，不应该顺手禁用整个 inline 交互系统。
6. 遇到 JDK 兼容问题时，先检查终端库版本和 native access 相关异常，再考虑修改系统配置。

一句话总结：Windows Terminal 并没有突然失去 ANSI 能力，真正的问题是旧版 JLine 在部分 JDK 21 构建环境下误判了 native access。升级依赖、保留真实异常，并以 JLine 创建出的 `Terminal` 作为能力判断依据，才是更可靠的修复方式。
