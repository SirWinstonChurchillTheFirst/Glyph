import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import path from 'node:path'
import { setLanguage, type Language } from '../shared/i18n'
import type { FlashKey, ImportRequest, Role } from '../shared/types'
import { getBuilds, getProfile, warmUp } from './data/opgg'
import { checkUpdate, getStatic, updateStatic } from './data/store'
import { LeagueService } from './league/LeagueService'
import { LeagueWatcher } from './league/watcher'

const BACKGROUND = '#14121c'
/** Height of the header in CSS pixels; the native window buttons are centred in it. */
const HEADER_HEIGHT = 48

let window: BrowserWindow | null = null

const league = new LeagueService()
const watcher = new LeagueWatcher(league, (state) => window?.webContents.send('league:state', state))

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1040,
    minHeight: 640,
    backgroundColor: BACKGROUND,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BACKGROUND, symbolColor: '#efedf6', height: HEADER_HEIGHT },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  // Large windows scale the interface up instead of leaving it small in a corner.
  const fitZoom = (): void => {
    if (!window) return
    const [width] = window.getContentSize()
    const zoom = width >= 2300 ? 1.5 : width >= 1800 ? 1.25 : width >= 1500 ? 1.1 : 1
    window.webContents.setZoomFactor(zoom)
    // The buttons are drawn by the system in real pixels, so they have to grow with the header.
    window.setTitleBarOverlay({ color: BACKGROUND, symbolColor: '#efedf6', height: Math.round(HEADER_HEIGHT * zoom) })
  }
  window.on('resize', fitZoom)
  window.webContents.on('did-finish-load', fitZoom)
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

    ipcMain.handle('data:static', () => getStatic())
    ipcMain.handle('data:check-update', () => checkUpdate())
    ipcMain.handle('data:update', () => updateStatic())
    ipcMain.handle('stats:profile', async (_event, championId: number, role: Role, opponentId: number | null) =>
      getProfile(await getStatic(), championId, role, opponentId)
    )
    ipcMain.handle(
      'stats:builds',
      async (_event, championId: number, role: Role, opponentId: number | null, depth: 'quick' | 'full') =>
        getBuilds(await getStatic(), championId, role, opponentId, depth)
    )
    ipcMain.handle('league:state', () => watcher.state)
    ipcMain.handle('league:import-runes', (_event, request: ImportRequest) => league.importRunes(request))
    ipcMain.handle('league:import-spells', (_event, ids: number[], flashKey: FlashKey) =>
      league.importSpells(ids, flashKey)
    )
    ipcMain.handle('league:launch', () => league.launchLeague())
    ipcMain.handle('app:language', (_event, language: Language) => setLanguage(language === 'en' ? 'en' : 'de'))

    createWindow()
    watcher.start()
    warmUp()
  })

  app.on('window-all-closed', () => {
    watcher.stop()
    app.quit()
  })
}
