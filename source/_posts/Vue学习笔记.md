---
title: 浅尝 Vue3 
date: 2026-01-20 20:11:42
updated: 2026-01-20 20:11:42
tags:
  - Vue
  - TypeScript
categories:
  - 前端
keywords: vue, typescript

---
## 一、 CSS 布局与样式技巧

今天遇到的绝大多数布局问题，都可以通过 **Flexbox** 解决。

**1. 常用布局模式**

- **输入框+按钮组合（圆角一体化）：**
    
    - **思路：** 父容器设置 `border`、`border-radius` 和 `overflow: hidden`。内部 `input` 设为 `flex: 1` 且去边框，`button` 去边框。
        
- **左右两端对齐（如列表项、底部结算栏）：**
    
    - **核心：** `display: flex; justify-content: space-between; align-items: center;`
        
    - **场景：** 左边是“文字/全选”，右边是“删除按钮/结算总价”。
        
- **垂直水平居中（如复选框与文字）：**
    
    - **核心：** `display: flex; align-items: center;`
        
    - **注意：** 对于 `label` 标签内部的 `input` 和文字，Flex 布局能完美解决对不齐的问题。
        

**2. 表格 (Table) 样式控制**

- **底部通栏（结算行）：** 必须使用 `<td colspan="6">` 来让单元格横跨所有列，否则会被挤在第一列。
    
- **图片防变形：** 给 `img` 设置固定宽高（如 `60px`）并加上 `object-fit: cover`，防止图片被拉伸或压扁。
    
- **列宽控制失效问题：** 表格默认是“内容优先”。如果单元格内有宽输入框，设置 `width: 20px` 会无效。
    
    - **解法：** 限制内部 `input` 的宽度（如 `width: 50px`），或给 `table` 设置 `table-layout: fixed`。
        

**3. 样式冲突排查（全选按钮换行问题）**

- **现象：** 全选复选框独占一行，文字被挤下去。
    
- **原因：** 全局样式 `td input { width: 100% }` 误伤了复选框。
    
- **修复：** 给复选框单独设置 `width: auto !important` 或指定类名限制宽度。
    

---

## 二、 Vue 3 与 TypeScript 逻辑

**1. Computed (计算属性) 写法**

- **错误写法：** `computed(() => { return { get() {...} } })` —— 导致返回一个对象。
    
- **正确写法 (只读)：** `computed(() => { return 计算结果 })`。
    
- **正确写法 (可读写)：** `computed({ get() {...}, set(val) {...} })` —— 直接传对象，不传箭头函数。
    

**2. TypeScript 报错 "对象可能为未定义" (TS2532)**

- **场景：** 在 `for` 循环中使用下标 `arr[i]` 访问数组。
    
- **解法：** 避免使用下标。改用 `for (const item of arr)` 或 `.reduce()`，TS 能自动推断 item 一定存在。
    

**3. 输入框逻辑限制**

- **禁止负数：** HTML 属性 `min="0"` 只能防微调按钮。
    
- **彻底禁止：** 配合 `@change` 事件：
    
    ```TypeScript
    if (item.count < 1) item.count = 1; // 强制重置
    ```

**4. 语法细节**

- **插值表达式：** `{{ }}` 内字符串必须加引号，如 `{{ isChecked ? '是' : '否' }}`。
    
- **自闭合标签：** `<input>` 是空元素，不能写成 `<input>...</input>`。
    
---

## 三、 工程化与规范

**1. 文件命名规范**

- **Vue 组件：** **PascalCase** (大驼峰)，如 `ShoppingCart.vue`。
    
- **JS/TS 文件：** **camelCase** (小驼峰)，如 `dateUtils.ts`。
    
- **文件夹/资源：** **kebab-case** (短横线)，如 `assets/icon-home.png`。
    

**2. VS Code 效率提升**

- **用户代码片段 (User Snippets)：**
    
    - 通过 `首选项 -> 配置用户代码片段 -> vue.json`。
        
    - 设置 `prefix: "vue3"`，可一键生成包含 `<template>`, `<script setup>`, `<style>` 的标准模板。
        
    - 使用 `${TM_FILENAME_BASE}` 自动填充组件名为文件名。
        

---

## 💡 今天的关键代码 (Flexbox 万能公式)

以后遇到任何**对齐**问题，先想这个公式：

```CSS
.container {
  display: flex;
  justify-content: space-between; /* 左右分开 */
  align-items: center;         /* 垂直居中 */
}
```

#### 代码
##### 记事本
```vue fold
<template>

    <div class="app">

        <div class="header">

            <h1>小黑记事本</h1>

        </div>

  

        <div class="list-container">

            <div class="search-box">

                <input

                    type="text"

                    id="textInput"

                    v-model="newText"

                    placeholder="请输入任务"

                />

                <button @click="addText">添加任务</button>

            </div>

            <div

                class="content-box"

                v-for="(item, index) in textArr"

                :key="index"

            >

                <span class="text-content"

                    >{{ index + 1 }}、{{ item.text }}</span

                >

                <button class="delete-btn" @click="removeText(item.id)">

                    x

                </button>

            </div>

            <div class="stats-bar">

                <span>合计{{ textArr.length }}</span>

                <button class="delete-btn" @click="textArr = []">

                    清空全部

                </button>

            </div>

        </div>

    </div>

</template>

<script lang="ts" setup name="HeiText">

import { ref } from "vue";

  

let textArr = ref([

    { id: 1, text: "学习Vue3基础" },

    { id: 2, text: "学习Vue3进阶" },

    { id: 3, text: "学习Vue3实战" },

    { id: 4, text: "学习Vue3项目" },

]);

let newText = ref("");

function addText() {

    if (newText.value.trim() != "") {

        textArr.value.push({

            id: textArr.value.length + 1,

            text: newText.value,

        });

        newText.value = "";

    }

}

function removeText(id: number) {

    textArr.value = textArr.value.filter((item) => item.id !== id);

}

</script>

<style scoped>

.app {

    width: 400px;

    margin: 20px auto;

    padding: 20px;

    border: 1px solid #ccc;

    border-radius: 8px;

    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    font-family: Arial, sans-serif;

}

.header {

    text-align: center;

    color: chocolate;

}

/* .list-container {

    background-color: silver;

} */

.search-box {

    display: flex;

    align-items: center;

    width: 100%;

    border: 1px solid chocolate;

    overflow: hidden;

    border-radius: 8px;

    margin-bottom: 20px;

}

.search-box input {

    flex: 1;

    border: none;

    outline: none;

    padding: 10px 8px;

    color: chocolate;

    font-style: italic;

}

.search-box button {

    /* flex: 1; */

    border: none;

    background-color: chocolate;

    color: white;

    padding: 10px 20px;

    cursor: pointer;

    white-space: nowrap;

    transition: background-color 0.3s;

}

.search-box button:hover {

    opacity: 0.8;

}

.content-box {

    display: flex;

    justify-content: space-between;

    align-items: center;

    padding: 8px 12px;

    border-bottom: 1px solid #eee;

}

.delete-btn {

    border: none;

    background: transparent;

    color: silver;

    font-size: 24px;

    /* line-height: 1; */

    cursor: pointer;

    /* align-items: right; */

}

.delete-btn:hover {

    opacity: 0.8;

    color: red;

}

  

.stats-bar {

    display: flex; /* 开启 Flex 布局 */

    justify-content: space-between; /* 关键：两端对齐（左边一个，右边一个） */

    align-items: center; /* 垂直居中 */

    padding: 10px 0; /* 增加一点上下间距，好看一些 */

    border-top: 1px solid #eee; /* 可选：加个顶边框，和上面的列表区分开 */

}

</style>
```

##### 购物车

```vue fold 
<template>

    <div class="shopping-cart-container">

        <div class="header">

            <img

                src="https://pic.616pic.com/bg_w1180/00/04/88/oLrUhPYlo4.jpg"

                alt="header image"

            />

        </div>

        <div class="shopping-cart">

            购物车

            <div>

                <table>

                    <thead>

                        <tr>

                            <th>选中</th>

                            <th>图片</th>

                            <th>单价</th>

                            <th style="width: 80px">个数</th>

                            <th>小计</th>

                            <th>操作</th>

                        </tr>

                    </thead>

                    <tbody>

                        <tr v-for="item in list" :key="item.id">

                            <td>

                                <input

                                    type="checkbox"

                                    v-model="item.isChecked"

                                />

                            </td>

                            <td>

                                <img :src="item.icon" />

                            </td>

                            <td>{{ item.price }}</td>

                            <td>

                                <input

                                    type="number"

                                    v-model="item.count"

                                    min="0"

                                    @change="handleCount(item)"

                                />

                            </td>

                            <td>{{ item.price * item.count }}</td>

                            <td>

                                <button @click="removeItem(item.id)">

                                    删除

                                </button>

                            </td>

                        </tr>

                        <tr>

                            <td colspan="6">

                                <div class="table-bottom">

                                    <label>

                                        <input

                                            type="checkbox"

                                            v-model="isAllChecked"

                                        />

                                        {{

                                            isAllChecked === true

                                                ? "全不选"

                                                : "全选"

                                        }}

                                    </label>

                                    <span>

                                        总价：{{ totalPrice }}

                                        <button @click="checkout">结算</button>

                                    </span>

                                </div>

                            </td>

                        </tr>

                    </tbody>

                </table>

            </div>

        </div>

    </div>

</template>

<script lang="ts" setup name="ShoppingCart">

import { computed, ref } from "vue";

  

let list = ref([

    {

        id: 1,

        icon: "https://i.pinimg.com/originals/d7/5e/dc/d75edcc856d92ee4ad5189a5ec32eb93.jpg",

        price: 100,

        count: 2,

        isChecked: true,

    },

    {

        id: 2,

        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRy0k07TdzazOeGFmZ3GRowRW23BZ3-oXzJqZllEikzZpk4DXJTg63P0BA&s",

        price: 200,

        count: 1,

        isChecked: false,

    },

    {

        id: 3,

        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-Yty1hSTKMkvY3E6nYqKwmH3NpYZ3fhPBn4PRVo-Jh-CztwwqkDconHA&s",

        price: 300,

        count: 3,

        isChecked: true,

    },

]);

let isAllChecked = computed({

    get() {

        // 列表里每一项都选中，全选按钮才选中

        return (

            list.value.length > 0 && list.value.every((item) => item.isChecked)

        );

    },

    set(val) {

        // 点击全选按钮时，把列表所有项设为对应状态

        list.value.forEach((item) => (item.isChecked = val));

    },

});

let totalPrice = computed(() => {

    let arr = list.value.filter((item) => item.isChecked);

    let sum = 0;

    for (const item of arr) {

        sum += item.price * item.count;

    }

    return sum;

});

  

function removeItem(id: number) {

    list.value = list.value.filter((item) => item.id !== id);

}

  

// 限制数量不能小于 1

function handleCount(item: any) {

    // 1. 如果小于 1 (包括 0 和负数)，强制变为 1

    if (item.count < 0) {

        item.count = 0;

        // alert("商品数量不能少于 1 件");

    }

    item.count = Math.floor(item.count);

}

function checkout() {

    alert(`总价为${totalPrice.value}，感谢您的购买！`);

}

</script>

<style scoped>

.shopping-cart-container {

    max-width: 1000px; /* 限制最大宽度，防止在大屏上太宽 */

    width: 90%; /* 在手机上保持左右留有空隙 */

    margin: 50px auto; /* 关键代码：上下 50px，左右自动居中 */

    border: 4px solid #ccc;

}

.header {

    text-align: center; /* 让图片在容器内居中 */

    overflow: hidden;

    margin-bottom: 20px;

}

.header img {

    width: 100%;

}

.shopping-cart table {

    text-align: center;

}

  

table {

    width: 100%;

    border-collapse: collapse; /* 去掉单元格间的间隙 */

    /* border: 4px solid red; */

}

/* 针对表格内的图片设置样式 */

tbody td img {

    width: 60px; /* 1. 强制限制宽度 */

    height: 60px; /* 2. 强制限制高度，保持正方形 */

    object-fit: cover; /* 3. 关键属性：保持比例填充，防止图片被压扁或拉伸 */

    border-radius: 4px; /* 4. 可选：加个小圆角，看起来更精致 */

    display: block; /* 5. 去除图片底部的默认间隙 */

    margin: 0 auto; /* 6. 让图片在单元格内居中 */

}

th,

td {

    /* border: 4px solid red; */

    padding: 12px;

    text-align: center;

    border-bottom: 1px solid #eee;

}

td input {

    width: 100%;

    box-sizing: border-box; /* 包含边框在内 */

}

.table-bottom {

    /* border: 2px solid black; */

    width: 100%;

    display: flex;

    justify-content: space-between;

    align-items: center;

    padding: 10px 20px; /* 加点内边距 */

    box-sizing: border-box;

    cursor: pointer;

}

.table-bottom label {

    display: flex;

    align-items: center;

    cursor: pointer;

}

.table-bottom input {

    width: auto !important; /* 覆盖掉 td input 的 100% 设置 */

    margin-right: 5px;

}

</style>
```