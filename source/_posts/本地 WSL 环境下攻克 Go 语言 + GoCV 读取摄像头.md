---
title: 本地 WSL 环境下攻克 Go 语言 + GoCV 读取摄像头
date: 2026-01-25 18:20:11
updated: 2026-01-25 18:20:11
tags:
  - Golang
  - WSL
categories:
  - 后端技术
  - Golang
  - 云原生
keywords: Golang, WSL, GOCV

---
### 第一阶段：WSL 环境准备 (在 WSL 终端操作)

GoCV 不是纯 Go 库，它必须调用系统的 C++ OpenCV 库。我们需要先在 WSL 里把这些地基打好。

1. 更新源并安装基础编译工具

```Bash
# 确保在 WSL 终端执行
sudo apt update
sudo apt install -y build-essential git sudo
```
2. 安装 Go 语言
3. 安装 OpenCV 系统库 (关键)
	直接使用 Ubuntu 的 `apt` 源安装 OpenCV 开发库（通常是 OpenCV 4.5+，足够用了）。 ^4f9ba7
```BASH

# 安装 OpenCV 开发库及其依赖
sudo apt install -y libopencv-dev
```

4.  GoCV
   **v0.31.0** 是完美支持 OpenCV 4.5.4 的最后一个稳定版本。
   `apt` 安装了旧版 OpenCV (v4.5.4)，我们需要让 GoCV “降级”来适配这个版本，不能直接用最新版 ^6e7395
```bash
   go mod init <模块名>
   go get gocv.io/x/gocv@v0.31.0
```

```go
package main

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"gocv.io/x/gocv"
)

var (
	// 全局变量用于存储最新一帧
	currentFrame []byte
	mutex        sync.Mutex
)

func main() {
	// 1. 打开摄像头 (ID 0 对应 /dev/video0)
	webcam, err := gocv.OpenVideoCapture(0)
	if err != nil {
		log.Fatalf("Error opening webcam: %v", err)
	}
	defer webcam.Close()

	// 2. 设置分辨率 (降低分辨率以提高流畅度)
	webcam.Set(gocv.VideoCaptureFrameWidth, 640)
	webcam.Set(gocv.VideoCaptureFrameHeight, 480)

	// 3. 启动后台协程：负责不断读取摄像头
	go captureStream(webcam)

	// 4. 启动 HTTP 服务：负责把图片发给浏览器
	http.HandleFunc("/", streamHandler)
	
	fmt.Println("Server started at http://localhost:8080")
	fmt.Println("Press Ctrl+C to stop")
	
	// 监听所有网卡，确保 Windows 也能访问
	log.Fatal(http.ListenAndServe("0.0.0.0:8080", nil))
}

// captureStream 不断读取摄像头数据
func captureStream(webcam *gocv.VideoCapture) {
	img := gocv.NewMat()
	defer img.Close()

	for {
		if ok := webcam.Read(&img); !ok {
			fmt.Println("Device closed or cannot read")
			time.Sleep(100 * time.Millisecond)
			continue
		}
		if img.Empty() {
			continue
		}

		// 编码为 .jpg 格式
		// 100 毫秒左右一帧，相当于 10fps
		buf, err := gocv.IMEncode(".jpg", img)
		if err != nil {
			continue
		}

		// 更新全局变量 (加锁防止并发读写冲突)
		mutex.Lock()
		currentFrame = buf.GetBytes()
		mutex.Unlock()
		
		// 必须手动释放 Native 内存，GoCV 特性
		buf.Close() 
		
		// 稍微休眠，避免 CPU 100%
		time.Sleep(50 * time.Millisecond)
	}
}

// streamHandler 处理 HTTP 请求，输出 MJPEG 流
func streamHandler(w http.ResponseWriter, r *http.Request) {
	// MJPEG 标准头
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=frame")

	for {
		mutex.Lock()
		data := currentFrame
		mutex.Unlock()

		if len(data) == 0 {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		// 写入 MJPEG 帧头
		fmt.Fprintf(w, "--frame\r\n")
		fmt.Fprintf(w, "Content-Type: image/jpeg\r\n")
		fmt.Fprintf(w, "Content-Length: %d\r\n\r\n", len(data))
		
		// 写入图片数据
		if _, err := w.Write(data); err != nil {
			break // 客户端断开连接
		}
		
		// 写入帧尾
		fmt.Fprintf(w, "\r\n")
		
		// 控制发送频率
		time.Sleep(100 * time.Millisecond)
	}
}
```

^db9d41

运行程序
```bash
# CGO_ENABLED=1 是必须的，因为我们要链接 C++ 库 
CGO_ENABLED=1 go run main.go
```
运行失败可能是摄像头没有挂载或者opencv的版本不匹配，
```bash
#确认 USB 设备
ls -l /dev/video*
```
如果没有输出，在PowerShell执行
![](wsl%20加入kubeedge.md#^1b6735)