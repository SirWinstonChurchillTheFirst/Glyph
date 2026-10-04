import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface LcuCredentials {
  port: number
  password: string
}

export interface Discovery {
  /** The client process (or its lockfile) exists. */
  running: boolean
  credentials: LcuCredentials | null
}

const RIOT_INSTALLS = path.join(
  process.env.ProgramData ?? 'C:\\ProgramData',
  'Riot Games',
  'RiotClientInstalls.json'
)
const DEFAULT_LEAGUE_DIR = 'C:\\Riot Games\\League of Legends'
const PROCESS_SCAN_INTERVAL = 5000

interface RiotInstalls {
  rc_live?: string
  rc_default?: string
  associated_client?: Record<string, string>
}

async function readRiotInstalls(): Promise<RiotInstalls> {
  try {
    return JSON.parse(await readFile(RIOT_INSTALLS, 'utf8')) as RiotInstalls
  } catch {
    return {}
  }
}

export async function findRiotClient(): Promise<string | null> {
  const installs = await readRiotInstalls()
  return installs.rc_live ?? installs.rc_default ?? null
}

let leagueDirs: string[] | null = null

async function getLeagueDirs(): Promise<string[]> {
  if (leagueDirs) return leagueDirs
  const installs = await readRiotInstalls()
  const found = Object.keys(installs.associated_client ?? {}).filter((dir) => /league/i.test(dir))
  // Only cache once the Riot metadata was readable, so a later install is still picked up.
  if (found.length > 0) leagueDirs = found
  return [...found, DEFAULT_LEAGUE_DIR]
}

/** Lockfile format: `LeagueClient:<pid>:<port>:<password>:https` */
async function fromLockfile(file: string): Promise<LcuCredentials | null> {
  try {
    const [, , port, password] = (await readFile(file, 'utf8')).split(':')
    return port && password ? { port: Number(port), password } : null
  } catch {
    return null
  }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 5000 }, (error, stdout) =>
      resolve(error ? '' : stdout)
    )
  })
}

/** Fallback for installs the Riot metadata does not list: read the client's command line. */
async function fromProcess(): Promise<Discovery> {
  if (process.platform !== 'win32') return { running: false, credentials: null }
  const tasks = await run('tasklist', ['/FI', 'IMAGENAME eq LeagueClientUx.exe', '/FO', 'CSV', '/NH'])
  if (!tasks.includes('LeagueClientUx.exe')) return { running: false, credentials: null }

  const commandLine = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter "Name='LeagueClientUx.exe'").CommandLine`
  ])
  const port = /--app-port=(\d+)/.exec(commandLine)?.[1]
  const password = /--remoting-auth-token=([\w-]+)/.exec(commandLine)?.[1]
  return {
    running: true,
    credentials: port && password ? { port: Number(port), password } : null
  }
}

let lastScan = 0
let lastScanResult: Discovery = { running: false, credentials: null }

export async function discoverClient(): Promise<Discovery> {
  const override = process.env.LCU_LOCKFILE
  const files = override
    ? [override]
    : (await getLeagueDirs()).map((dir) => path.join(dir, 'lockfile'))
  for (const file of files) {
    const credentials = await fromLockfile(file)
    if (credentials) return { running: true, credentials }
  }
  if (override) return { running: false, credentials: null }

  // Spawning processes is the expensive path, so it runs rarely.
  if (Date.now() - lastScan >= PROCESS_SCAN_INTERVAL) {
    lastScan = Date.now()
    lastScanResult = await fromProcess()
  }
  return lastScanResult
}
