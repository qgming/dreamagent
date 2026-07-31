<div align="center">
  <img src="build/icon.svg" alt="DreamAgent Logo" width="112" height="112" />

# 造梦师 DreamAgent

**本地优先的 AI 文章创作工作台**

把故事规划、人物设定、正文创作、项目知识和 AI 协作放进同一个桌面应用。

  <p>
    <img alt="Electron" src="https://img.shields.io/badge/Electron-37-47848F?style=flat-square&logo=electron&logoColor=white" />
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Local First" src="https://img.shields.io/badge/Local--First-Yes-16A34A?style=flat-square" />
  </p>
</div>

---

## 产品定位

DreamAgent 面向小说、剧本和系列内容创作者。它不是一个独立的聊天窗口，而是围绕真实创作项目组织 AI：大纲放在节点中，人物与世界观放在实体中，最终正文放在文章中，AI 则通过项目工具读取和维护这些内容。

| 创作环节 | DreamAgent 提供的能力                               |
| -------- | --------------------------------------------------- |
| 前期规划 | 用树状节点组织主题、卷纲、章纲、场景和待办          |
| 设定管理 | 管理人物、地点、势力、物件和世界观条目              |
| 关系梳理 | 在节点与实体之间建立双向链接，追踪引用关系          |
| 正文创作 | 按文件夹组织文章，在独立编辑区完成内容              |
| AI 协作  | 让 Agent 读取项目上下文、调用创作工具并持续修改项目 |
| 创作复盘 | 查看近期项目、文字产出和 Token 消耗热力图           |

## 核心能力

### 项目化创作

- 每个项目拥有独立的元数据、节点、实体、文章和会话。
- 支持自定义项目库目录，项目内容以本地文件为准。
- 首页集中显示最近项目、文字产出和模型 Token 消耗。
- 节点、实体和文章均有明确状态，便于从想法推进到成稿。

### 节点、实体与双链

- 节点用于大纲、情节、任务和结构规划，支持多级树形组织。
- 实体用于人物、地点、组织、物件和设定，支持多级分类。
- 节点和实体内容可通过 `@` 提及建立双向链接。
- 引用关系与父子结构相互独立，既能看层级，也能追踪关联。
- 删除或移动父级时保留子项，减少结构调整造成的内容损失。

### AI 创作工作区

- 在项目内维护多轮创作会话，支持流式输出和历史会话。
- Agent 可读取、创建、修改和整理节点、实体、文章及文件夹。
- 支持项目上下文、相关链接、待办状态和上下文用量展示。
- 支持重新生成、追问、引导进行中的回复以及中止任务。
- Markdown、代码块、引用、列表等内容可直接渲染。

### 模型、搜索与扩展

- 支持配置多个 OpenAI 兼容模型供应商，并切换默认模型。
- 支持不同思考等级和远程模型列表读取。
- 联网搜索可配置 Tavily、Exa、Serper、Brave 或 SearXNG。
- 内置长篇、短篇、文风优化、连续性审计等创作技能。
- 支持导入自定义技能，也可在应用内创建和维护技能文件。
- 支持配置 MCP Server、发现远程工具并控制单个工具开关。

## 本地优先

- 项目资料、创作正文、会话与应用配置保存在本机。
- API Key 由桌面主进程管理，不暴露给普通网页环境。
- 模型请求只发送到用户主动配置的模型服务。
- Electron 渲染进程启用上下文隔离，通过受控 IPC 使用本地能力。

请注意：启用模型、联网搜索或 MCP 服务后，相应请求会发送给所配置的第三方服务，具体数据策略取决于服务提供方。

## 下载与安装

前往 [GitHub Releases](https://github.com/qgming/dreamagent/releases) 下载最新版本。

| 平台                | 发布产物             |
| ------------------- | -------------------- |
| Windows x64         | NSIS 安装程序 `.exe` |
| macOS Apple Silicon | 磁盘镜像 `.dmg`      |
| Linux x64           | `.AppImage`、`.deb`  |

应用启动后会定期检查 GitHub Releases。也可以打开「设置 -> 关于」手动检查；发现版本后可在应用内下载，并在下载完成后重启安装。

> 当前发布包未配置商业代码签名。Windows SmartScreen 或 macOS Gatekeeper 可能在首次运行时显示来源提示。

## 本地开发

### 环境要求

- Node.js 20+
- npm 10+
- Windows、macOS 或 Linux 桌面环境

### 启动项目

```bash
npm install
npm run dev
```

项目的 `.npmrc` 已配置 npm、Electron 和 electron-builder 国内镜像。需要使用官方源时，请在本机 npm 配置或环境变量中覆盖。

### 常用命令

| 命令                 | 说明                               |
| -------------------- | ---------------------------------- |
| `npm run dev`        | 启动 Electron 开发环境与热更新     |
| `npm run typecheck`  | 检查主进程、preload 和渲染进程类型 |
| `npm run build`      | 类型检查并构建到 `out/`            |
| `npm run preview`    | 运行构建后的应用                   |
| `npm run dist`       | 构建当前平台安装包                 |
| `npm run dist:win`   | 构建 Windows 安装包                |
| `npm run dist:mac`   | 构建 macOS 安装包                  |
| `npm run dist:linux` | 构建 Linux 安装包                  |

## 首次配置

1. 启动 DreamAgent，打开「设置 -> 模型」。
2. 添加模型供应商，填写 Base URL 和 API Key。
3. 读取或手动添加模型，并设置默认模型与思考等级。
4. 按需配置联网搜索、技能和 MCP Server。
5. 返回首页创建项目，从节点、实体或创作工作区开始。

## 项目结构

```text
dreamagent/
├── .github/workflows/       # GitHub Actions 云端发布
├── build/                   # 应用图标与打包资源
├── changelogs/              # 各版本 GitHub Release 更新日志
├── resources/skills/        # 随应用分发的内置技能
├── scripts/                 # 开发与资源维护脚本
├── src/
│   ├── main/                # Electron 主进程、服务和 IPC
│   ├── preload/             # 安全的渲染进程 API 桥接
│   ├── renderer/            # React 页面、组件和状态管理
│   └── shared/              # 主进程与渲染进程共享类型
├── electron-builder.yml     # 跨平台安装包与更新源配置
├── electron.vite.config.ts  # Electron Vite 构建配置
└── package.json
```

## 发布版本

项目通过 GitHub Actions 构建并发布 Windows、macOS 和 Linux 安装包。发布前需要同时更新版本号和版本日志：

```bash
# 例如发布 0.2.0
npm version 0.2.0 --no-git-tag-version
# 新建 changelogs/v0.2.0.md

git add package.json package-lock.json changelogs/v0.2.0.md
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

推送 `v*.*.*` 标签后，`.github/workflows/release.yml` 会：

1. 校验标签与 `package.json` 版本完全一致。
2. 在 GitHub 托管的 Windows、macOS 和 Linux 环境并行构建。
3. 上传安装包、blockmap 和 `latest*.yml` 更新元数据。
4. 读取 `changelogs/vX.Y.Z.md` 并创建 GitHub Release。

也可以在 GitHub Actions 页面手动运行 Release 工作流并输入版本标签。工作流使用仓库自带的 `GITHUB_TOKEN`，不需要额外配置发布 Token。

### 自动更新约束

- 不要删除 Release 中的 `latest*.yml` 或 `.blockmap` 文件。
- Release 必须是公开且非草稿状态，客户端才能读取。
- `package.json`、Git 标签和更新日志文件名必须使用同一个版本。
- macOS 正式分发建议配置 Developer ID 签名与公证。

## 参与贡献

欢迎提交 Issue 和 Pull Request。适合贡献的方向包括创作工具、内置技能、模型兼容、MCP 集成、编辑体验以及跨平台发布。

## 许可证

项目以 MIT License 发布。
