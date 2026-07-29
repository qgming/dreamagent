import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

/** 是否为开发环境 */
const isDev = !app.isPackaged

/**
 * 创建无边框主窗口
 */
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    // 无边框：使用自定义 TitleBar
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    title: '造梦师',
    backgroundColor: '#121212',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 最大化状态变化时通知渲染进程
  const notifyMaximized = (): void => {
    mainWindow.webContents.send('window:maximized-change', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', notifyMaximized)
  mainWindow.on('unmaximize', notifyMaximized)
  mainWindow.on('resize', notifyMaximized)

  // 外部链接用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境：F12 打开/关闭 DevTools
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools()
        } else {
          mainWindow.webContents.openDevTools({ mode: 'undocked' })
        }
      }
    })
  }

  // 开发环境加载热更新服务，生产环境加载打包后的 HTML
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * 注册窗口控制相关 IPC
 */
function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return win.isMaximized()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle('window:set-title', (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(String(title || '造梦师'))
  })
}

// 应用准备就绪
app.whenReady().then(() => {
  // 设置 Windows 应用用户模型 ID（对应包名）
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.qgming.dreamagent')
  }

  // IPC：获取应用版本 / 名称
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getName', () => app.getName())

  // 窗口控制 IPC
  registerWindowIpc()

  createWindow()

  // macOS：点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 除 macOS 外，关闭所有窗口时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
