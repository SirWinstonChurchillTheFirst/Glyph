import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, LeagueState } from '../shared/types'

const api: Api = {
  getStatic: () => ipcRenderer.invoke('data:static'),
  getProfile: (championId, role) => ipcRenderer.invoke('stats:profile', championId, role),
  getBuilds: (championId, role, opponentId) => ipcRenderer.invoke('stats:builds', championId, role, opponentId),
  checkUpdate: () => ipcRenderer.invoke('data:check-update'),
  updateData: () => ipcRenderer.invoke('data:update'),
  getState: () => ipcRenderer.invoke('league:state'),
  onState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: LeagueState): void => listener(state)
    ipcRenderer.on('league:state', handler)
    return () => ipcRenderer.removeListener('league:state', handler)
  },
  importRunes: (request) => ipcRenderer.invoke('league:import-runes', request),
  launchLeague: () => ipcRenderer.invoke('league:launch')
}

contextBridge.exposeInMainWorld('api', api)
