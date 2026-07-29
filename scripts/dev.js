#!/usr/bin/env node
/**
 * 开发启动包装脚本
 * 清除 ELECTRON_RUN_AS_NODE，避免 Electron 被当作普通 Node 运行
 */
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')
const path = require('path')

const electronVite = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
)

const child = spawn(electronVite, ['dev'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined
  }
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
