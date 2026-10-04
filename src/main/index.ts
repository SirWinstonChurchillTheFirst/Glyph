import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import path from 'node:path'
import type { ImportRequest } from '../shared/types'
import { checkUpdate, getDataset, updateDataset } from './data/store'
import { LeagueService } from './league/LeagueService'
import { LeagueWatcher } from './league/watcher'

const BACKGROUND = '#0b0d10'

let window: BrowserWindow | null = null

const league = new LeagueService()
const watcher = new LeagueWatcher(league, (state) => window?.webContents.send('league:state', state))

function createWindow(): void {
  window = new BrowserWindow({
    width: 460,
    height: 880,
    minWidth: 400,
    minHeight: 560,
    backgroundColor: BACKGROUND,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BACKGROUND, symbolColor: '#8a919c', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  window.removeMenu()
  window.once('ready-to-show', () => window?.show())
  window.on('closed', () => (window = null))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })

  void app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark'

    ipcMain.handle('data:get', () => getDataset())
    ipcMain.handle('data:check-update', () => checkUpdate())
    ipcMain.handle('data:update', () => updateDataset())
    ipcMain.handle('league:state', () => watcher.state)
    ipcMain.handle('league:import-runes', (_event, request: ImportRequest) => league.importRunes(request))
    ipcMain.handle('league:launch', () => league.launchLeague())

    createWindow()
    watcher.start()
  })

  app.on('window-all-closed', () => {
    watcher.stop()
    app.quit()
  })
}
