<div align="center">

# MxPage

**AI 原生商品图文工作台**
面向电商详情页、小红书图文、批量商品页面生成与本地私有化部署。

<p>
  <a href="https://github.com/ziguishian/MxPage/stargazers">
    <img src="https://img.shields.io/github/stars/ziguishian/MxPage?style=flat-square&logo=github&color=111111" alt="GitHub stars" />
  </a>
  <a href="https://github.com/ziguishian/MxPage/network/members">
    <img src="https://img.shields.io/github/forks/ziguishian/MxPage?style=flat-square&logo=github&color=111111" alt="GitHub forks" />
  </a>
  <a href="https://github.com/ziguishian/MxPage/issues">
    <img src="https://img.shields.io/github/issues/ziguishian/MxPage?style=flat-square&logo=github&color=111111" alt="GitHub issues" />
  </a>
  <a href="https://github.com/ziguishian/MxPage/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ziguishian/MxPage?style=flat-square&color=111111" alt="License" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/OpenAI--Compatible-111111?style=flat-square&logo=openai&logoColor=white" alt="OpenAI Compatible" />
  <img src="https://img.shields.io/badge/gpt--image--2-Image%20Generation-111111?style=flat-square" alt="gpt-image-2" />
</p>

<p>
  <a href="#快速开始">快速开始</a> ·
  <a href="#核心功能">核心功能</a> ·
  <a href="#私有化部署">私有化部署</a> ·
  <a href="#star-history">Star History</a>
</p>

</div>

---

## 介绍

**MxPage** 是由 **灵矩绘境** 出品并维护的 AI 商品图文工作台。

它可以帮助你围绕商品图片快速完成：

* 电商详情页生成
* 小红书图文生成
* 商品图片分析与页面规划
* 多商品批量内容生产
* 图片生成、编辑与翻译
* OpenAI-compatible Provider 接入
* 本地部署与私有网关接入

适合电商运营、设计师、内容创作者、独立开发者，以及需要批量生成商品视觉内容的团队使用。

---

## 预览

<img width="3840" height="2126" alt="MxPage Preview 1" src="https://github.com/user-attachments/assets/68f49a9f-875f-4397-ade6-426df6337134" />

<img width="3840" height="2126" alt="MxPage Preview 2" src="https://github.com/user-attachments/assets/95ff74e2-4b32-4f48-9d40-e1b26da1dcfa" />

<img width="3840" height="2029" alt="MxPage Preview 3" src="https://github.com/user-attachments/assets/aadadb16-ed6e-4eab-8003-288b687339f6" />

---

## 核心功能

### 商品详情页生成

* 支持商品图片上传
* 自动分析商品卖点、视觉风格与页面结构
* 生成结构化详情页规划
* 支持图片生成、图片编辑与成品图输出
* 支持详情页图片语言转换

### 小红书图文工作流

内置四步式小红书图文生成流程：

1. 内容规划
2. Prompt 审核
3. 图片生成
4. 图片编辑

每一次生成前都会经过 **Visual Prompt Agent**，让图像生成更稳定、更贴近目标风格。

### 批量商品内容生产

* 支持多张商品图批量创建
* 适合 SKU 较多的电商场景
* 长任务通过后台任务执行，避免请求超时
* 前端实时轮询任务进度

### Provider 配置

* 支持 OpenAI-compatible 模型服务
* 支持用户在浏览器本地配置 API Key 与 baseURL
* API Key 默认仅保存在浏览器 `localStorage`
* 请求时才发送到服务端，不写入服务端数据库
* 支持服务端锁定 `baseURL`，适合团队或私有化部署

### 图片生成与编辑

* 优先支持 `gpt-image-2`
* 支持图片生成
* 支持图片编辑
* 支持详情页图像翻译
* 模型发现对图片端点采用被动策略，不主动消耗图片生成额度

### API 使用监控

* 显示 API 调用状态
* 展示最终请求端点
* 折叠展示重试细节
* 更容易排查网关、Provider、模型配置问题

---

## 技术栈

| 模块          | 技术                        |
| ----------- | ------------------------- |
| Web 应用      | Next.js                   |
| 桌面端         | Electron                  |
| 数据库         | SQLite / Prisma           |
| AI Provider | OpenAI-compatible API     |
| 图片模型        | gpt-image-2               |
| 任务机制        | Background Task + Polling |
| 打包          | electron-builder          |

---

## 快速开始

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

启动后，打开 Next.js 在终端中输出的本地地址即可。

---

## 环境变量

在项目根目录创建 `.env` 文件：

```env
DATABASE_URL="file:./dev.db"
APP_SECRET="replace-with-your-own-long-secret"
STORAGE_ROOT="./storage"
APP_RUNTIME="web"
NEXT_PUBLIC_APP_NAME="MxPage"

# 可选：设置后，服务端 Provider 请求会忽略 UI 中填写的 baseURL
LOCK_BASE_URL="https://your-private-openai-compatible-gateway/v1"

# 兼容旧版本环境变量
# FORCED_API_BASE="https://your-private-openai-compatible-gateway/v1"
# FORCED_API_BASE_URL="https://your-private-openai-compatible-gateway/v1"
```

---

## Provider 配置说明

MxPage 支持 OpenAI-compatible 模型服务。

普通模式下，每个浏览器用户都可以在设置页中配置自己的：

* API Key
* baseURL
* 文本模型
* 图片模型

API Key 默认只保存在浏览器本地的 `localStorage` 中，并且只在当前请求中发送到服务端。

---

## 私有化部署

如果你希望在团队内部使用统一网关，可以在服务端设置：

```env
LOCK_BASE_URL="https://your-private-openai-compatible-gateway/v1"
```

启用后：

* 后端会始终使用该 `baseURL`
* UI 中填写的 baseURL 不会生效
* 设置页会显示锁定通道提示
* 适合企业内部网关、代理服务、本地模型服务等场景

---

## 默认模型策略

### 文本规划与分析

优先使用成本更友好的 GPT 系列模型，例如：

* `gpt-5-mini`
* `gpt-5-nano`
* `gpt-4.1-mini`
* `gpt-4o-mini`

### 图片生成与编辑

优先使用：

* `gpt-image-2`

图片端点的模型发现采用被动策略，不会主动消耗图片生成额度。

---

## 长任务机制

为了避免长时间 HTTP 请求导致网关超时，MxPage 将复杂流程放入后台任务执行。

当前支持长任务的场景包括：

* 批量商品页面创建
* 小红书图文生成
* 完整详情页语言转换
* QA 类工作流扩展

执行流程：

```txt
前端发起任务
   ↓
服务端返回 taskId
   ↓
前端轮询 /api/tasks/:taskId
   ↓
页面展示增量进度
   ↓
任务完成后展示最终结果
```

这样可以减少网关超时问题，也能避免生成中的图片因为浏览器请求中断而丢失。

---

## 常用脚本

```bash
npm run dev
npm run build
npm run start
npm run dist:mac
npm run dist:win
npm run dist:green
```

| 命令                   | 说明             |
| -------------------- | -------------- |
| `npm run dev`        | 启动开发环境         |
| `npm run build`      | 构建生产版本         |
| `npm run start`      | 启动生产服务         |
| `npm run dist:mac`   | 打包 macOS ARM64 桌面端（DMG、ZIP） |
| `npm run dist:win`   | 打包 Windows 桌面端 |
| `npm run dist:green` | 打包绿色版桌面端       |

---

## 桌面端应用

MxPage 的 Electron 桌面端复用同一套 Next.js 应用。

桌面端运行数据会存储在系统应用数据目录中，macOS 与 Windows 打包均通过 `electron-builder` 配置。

---

## 项目结构

```txt
MxPage
├── app                 # Next.js 应用
├── components          # UI 组件
├── lib                 # 通用逻辑
├── prisma              # Prisma schema 与迁移
├── public              # 静态资源
├── storage             # 本地存储目录
├── electron            # Electron 相关配置
└── package.json
```

---

## 适合谁使用

* 电商运营：快速生成商品详情页与种草图
* 小红书创作者：围绕商品生成图文内容
* 设计师：快速做视觉方向探索
* 独立开发者：本地部署 AI 商品图文工作台
* 团队用户：通过私有网关统一管理模型调用

---

## Star History

<a href="https://www.star-history.com/#ziguishian/ai-product-page-generator&date">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://api.star-history.com/chart?repos=ziguishian/ai-product-page-generator&type=date&theme=dark&legend=top-left"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://api.star-history.com/chart?repos=ziguishian/ai-product-page-generator&type=date&legend=top-left"
    />
    <img
      alt="Star History Chart"
      src="https://api.star-history.com/chart?repos=ziguishian/ai-product-page-generator&type=date&legend=top-left"
    />
  </picture>
</a>

## 欢迎交流

如果你对 MxPage、AI 商品图文生成、电商详情页自动化、小红书图文工作流或本地私有化部署感兴趣，欢迎交流。

<img width="888" height="1131" alt="交流二维码" src="https://github.com/user-attachments/assets/028cfd0b-a813-4655-9b49-aa9ab6619c7d" />

---

## 品牌信息

| 项目         | 信息                             |
| ---------- | ------------------------------ |
| 产品名        | MxPage                         |
| 出品方        | 灵矩绘境                           |
| Publisher  | MatrixInspire                  |
| Maintainer | 灵矩绘境                           |
| Copyright  | Copyright © 2026 灵矩绘境 · MxPage |

---

<div align="center">

**MxPage · 让商品图文生成更快、更稳、更适合真实电商场景。**

</div>
