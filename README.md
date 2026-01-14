# BananaMall

<div align="center">

**让灵感落地，让回忆有形**

AI-powered e-commerce detail page generator built with Tauri v2 + React + TypeScript.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.9-blue.svg)](https://tauri.app/)

</div>

---

## 项目概述

**BananaMall** 是一个 AI 驱动的电商详情页生成工具，由 [MatrixInspire（灵矩绘境）](https://mxinspire.com) 开发。

### 核心功能

- 📸 **智能产品分析**：上传产品白底图，AI 自动分析产品特征
- ✍️ **文案自动生成**：根据平台和风格生成专业的产品文案
- 🎨 **图片批量生成**：自动生成主图和详情页图片，支持自定义数量
- 📱 **移动端预览**：内置手机模拟器，实时预览效果
- 📝 **详情页生成**：自动生成包含 5 大核心模块的详情页内容
- 💾 **历史记录**：保存生成历史，支持重新编辑
- 📤 **一键导出**：导出图片和文案，支持自定义路径
- 🌐 **多平台支持**：支持 Amazon、淘宝、京东等平台风格
- 🎯 **多语言支持**：支持中文和英文

### 使用案例

<img width="48%" height="920" alt="screenshot-20260113-162754" src="https://github.com/user-attachments/assets/533e72e3-571e-4127-8096-7247d824a285"  style="display: inline-block; margin-right: 10px;" />
<img width="48%" height="1805" alt="screenshot-20260113-162832" src="https://github.com/user-attachments/assets/bbd02fda-d975-45a9-b46e-545f29f04eed" style="display: inline-block;"/>
<img width="2823" height="1844" alt="screenshot-20260113-163433" src="https://github.com/user-attachments/assets/c38e08ee-6722-447e-b640-ed6f72cdbb12" />

<img width="32%" height="953" alt="screenshot-20260113-163226" src="https://github.com/user-attachments/assets/1fde85eb-d7de-4744-b7a4-1381c8b49a96" style="display: inline-block; margin-right: 10px;" />
<img width="32%" height="948" alt="screenshot-20260113-163214" src="https://github.com/user-attachments/assets/92157fcf-9279-4468-b5ef-d2ea367beee7" style="display: inline-block; margin-right: 10px;" />
<img width="32%" height="983" alt="screenshot-20260113-163330" src="https://github.com/user-attachments/assets/6094d3be-53ab-44ee-ba5d-a66df6df384c" style="display: inline-block;" />

#### 优秀案例
##### NanoBanana

<img width="32%" height="1878" alt="screenshot-20260113-141724" src="https://github.com/user-attachments/assets/9e8184ce-43ab-42b6-aedd-617a0146ac67" style="display: inline-block; margin-right: 10px;"/>
<img width="32%" height="1847" alt="screenshot-20260113-153957" src="https://github.com/user-attachments/assets/0934f527-b125-4562-93fa-00db9c322dcf" style="display: inline-block; margin-right: 10px;"/>
<img width="32%" height="1024" alt="detail-0-regenerated-2026-01-13T09-32-26-571Z" src="https://github.com/user-attachments/assets/357c86e6-2c7a-48b8-9202-59c9acb8a5f9" style="display: inline-block;" />

#### NanoBanana PRO
<img src="https://github.com/user-attachments/assets/1dbf70c6-4c46-4627-b44a-07f344823332" alt="2026-01-13T08-34-43-105Z_1_main_main-0" style="display: inline-block;" />
<img src="https://github.com/user-attachments/assets/2e15b8e4-87f9-43e6-a6e2-d8d2081c7583" alt="2026-01-13T08-34-43-105Z_2_main_main-1" style="display: inline-block;" />
<img src="https://github.com/user-attachments/assets/8cb543f3-59b9-4dbc-bbe8-bd920b0e9c08" alt="2026-01-13T08-34-43-105Z_3_main_main-2" style="display: inline-block;" />







### 技术栈

- **前端**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + Shadcn/UI
- **桌面框架**: Tauri v2
- **状态管理**: Zustand
- **AI 模型**: Google Gemini (支持多种模型)

## 🚀 快速开始

### 环境要求

- **Node.js**: 18+
- **npm**: 9+
- **Rust**: latest stable version
- **系统依赖**: [Tauri prerequisites](https://tauri.app/v2/guides/getting-started/prerequisites)

### 安装步骤

1. **克隆仓库**

```bash
git clone https://github.com/ziguishian/banana-mall.git
cd banana-mall
```

2. **安装依赖**

```bash
npm install
```

3. **配置 API Key**

首次运行需要在设置页面配置 Google Gemini API Key：

- 获取 API Key: https://makersuite.google.com/app/apikey
- 在应用设置页面输入 API Key
- API Key 会安全地存储在本地

4. **启动服务**

```bash
npm run dev
```

## 📁 项目结构

```
banana-mall/
├── src/
│   ├── components/     # React 组件
│   │   └── ui/        # Shadcn/UI 组件
│   ├── lib/           # 工具函数和 API
│   │   ├── api.ts     # Gemini API 封装
│   │   ├── api-detail.ts  # 详情页生成逻辑
│   │   ├── export.ts  # 导出功能
│   │   └── i18n.ts    # 国际化
│   ├── pages/         # 页面组件
│   │   ├── UploadPage.tsx      # 上传页面
│   │   ├── ConfigPage.tsx      # 配置页面
│   │   ├── GeneratingPage.tsx  # 生成中页面
│   │   ├── EditorPage.tsx      # 编辑页面
│   │   ├── HistoryPage.tsx     # 历史记录
│   │   └── SettingsPage.tsx    # 设置页面
│   ├── stores/        # Zustand 状态管理
│   ├── hooks/         # 自定义 Hooks
│   ├── App.tsx        # 主应用组件
│   └── main.tsx       # 入口文件
├── src-tauri/         # Tauri 后端 (Rust)
│   ├── src/
│   │   └── main.rs    # Rust 入口
│   └── tauri.conf.json # Tauri 配置
└── public/            # 静态资源
```

## ⚙️ 配置说明

### API 配置

应用支持自定义 API 端点，可在设置页面配置：

- **API Key**: Google Gemini API Key（必需）
- **Base URL**: API 代理地址（可选，默认使用代理）

### 数据存储

使用 `tauri-plugin-store` 进行本地持久化存储：

- API 密钥（加密存储）
- 用户偏好设置
- 生成历史记录
- 应用配置

## 🎨 设计系统

- **配色方案**: Zinc（支持明暗主题）
- **字体**: Inter 字体系列
- **设计风格**: Vercel/Next.js 极简风格
- **组件库**: Shadcn/UI

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 开发规范

- 使用 TypeScript 进行类型检查
- 遵循 ESLint 代码规范
- 提交前运行 `npm run build` 确保构建通过
- 保持代码注释清晰

## 🐛 问题反馈

如遇到问题，请在 [GitHub Issues](https://github.com/yourusername/banana-mall/issues) 提交。

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。

## 🙏 致谢

- [Tauri](https://tauri.app/) - 桌面应用框架
- [Shadcn/UI](https://ui.shadcn.com/) - 组件库
- [Google Gemini](https://deepmind.google/technologies/gemini/) - AI 模型

---

<div align="center">

**Made with ❤️ by [MatrixInspire](https://mxinspire.com)**

让灵感落地，让回忆有形

</div>
