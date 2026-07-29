# 造梦师 (Dream Agent)

> 包名：`com.qgming.dreamagent`

Electron + React + Tailwind CSS + TypeScript 桌面应用。

## 技术栈

| 技术 | 版本 |
|------|------|
| Electron | 37.x |
| React | 19.x |
| Tailwind CSS | 4.x |
| TypeScript | 5.x |
| electron-vite | 4.x |
| Vite | 7.x |

## 国内镜像

项目已配置 `.npmrc`，自动使用 npmmirror：

- npm 包：`https://registry.npmmirror.com`
- Electron 二进制：`https://npmmirror.com/mirrors/electron/`
- electron-builder 二进制：`https://npmmirror.com/mirrors/electron-builder-binaries/`

## 快速开始

```bash
# 安装依赖（自动走国内镜像）
npm install

# 开发模式（热更新）
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build

# 打包安装包（Windows）
npm run dist:win
```

## 项目结构

```
dreamagent/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # 预加载脚本（IPC 桥接）
│   └── renderer/       # React 渲染进程
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           └── assets/
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 编译产物到 `out/` |
| `npm run typecheck` | 全量 TypeScript 类型检查 |
| `npm run dist` | 构建并打包安装程序 |
| `npm run dist:win` | 仅打包 Windows 安装程序 |
| `npm run preview` | 预览构建产物 |
