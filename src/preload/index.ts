import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, LeagueState } from '../shared/types'

const api: Api = {
  getData: () => ipcRenderer.invoke('data:get'),
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
