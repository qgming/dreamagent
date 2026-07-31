import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * 单元测试配置：纯 Node 环境，不需要 Electron。
 * 使用内存 SessionRepo 与 fake provider，不依赖真实 API key。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true
  }
})
