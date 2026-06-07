import { contextBridge, ipcRenderer } from 'electron'

export type MigrationPhase =
  | 'idle'
  | 'validating'
  | 'checking-tools'
  | 'creating-database'
  | 'dumping'
  | 'restoring'
  | 'done'
  | 'error'
  | 'cancelled'

export interface MigrationRequest {
  sourceUrl: string
  destinationAdminUrl: string
  targetDatabase?: string
  dropExisting: boolean
}

export interface TestConnectionResult {
  ok: boolean
  serverVersion?: string
  database?: string
  message: string
}

export interface PreloadApi {
  start(request: MigrationRequest): Promise<void>
  cancel(): Promise<void>
  test(connectionString: string): Promise<TestConnectionResult>
  onLog(callback: (line: string) => void): () => void
  onPhase(callback: (phase: MigrationPhase) => void): () => void
}

const api: PreloadApi = {
  start: (request) => ipcRenderer.invoke('migration:start', request),
  cancel: () => ipcRenderer.invoke('migration:cancel'),
  test: (connectionString) => ipcRenderer.invoke('migration:test', connectionString),
  onLog: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, line: string): void => callback(line)
    ipcRenderer.on('migration:log', listener)
    return () => ipcRenderer.off('migration:log', listener)
  },
  onPhase: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, phase: MigrationPhase): void => callback(phase)
    ipcRenderer.on('migration:phase', listener)
    return () => ipcRenderer.off('migration:phase', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
