import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * pi-ai / pi-agent-core / typebox 为 ESM-only（exports 仅有 "import"）。
 * electron-vite 默认把 main 打成 CJS；若 externalize 后用 require() 会报
 * ERR_PACKAGE_PATH_NOT_EXPORTED。从 externalize 列表排除，打进 main bundle。
 */
const piEsmOnly = [
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-ai',
  'typebox'
]

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: piEsmOnly
      })
    ],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
