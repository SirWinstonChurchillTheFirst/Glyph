export type Role = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

// ---------- Build data (data/builds.json) — ids only, names live in StaticData ----------

export interface RuneSetup {
  primaryStyle: number
  subStyle: number
  /** Keystone + 3 primary runes (slot order), then 2 secondary runes. */
  perks: number[]
  /** Offense, flex, defense. */
  shards: number[]
}

export interface RoleBuild {
  games: number
  winRate: number
  runes: RuneSetup
  startItems: number[]
  /** Most common first three purchases, boots included. */
  coreItems: number[]
  /** Most picked options for the 4th, 5th and 6th item. */
  lateItems: number[][]
  /** Ability per level, 1–18. */
  skillOrder: string[]
  /** Max order, e.g. "QWE". */
  skillPriority: string
}

export interface ChampionBuilds {
  defaultRole: Role
  roles: Partial<Record<Role, RoleBuild>>
}

export interface BuildData {
  /** Patch the statistics were collected on, e.g. "16.19". */
  patch: string
  source: string
  generatedAt: string
  /** Keyed by numeric champion id. */
  champions: Record<string, ChampionBuilds>
}

// ---------- Static game data (data/static.json), from Data Dragon ----------

export interface StaticData {
  /** Data Dragon version, e.g. "16.19.1". Also used in asset URLs. */
  patch: string
  locale: string
  champions: Record<string, { key: string; name: string }>
  styles: Record<string, { name: string; icon: string }>
  runes: Record<string, { name: string; icon: string }>
  shards: Record<string, { name: string; icon: string }>
  items: Record<string, { name: string; boots?: boolean }>
}

export interface Dataset {
  builds: BuildData
  static: StaticData
}

// ---------- League client state ----------

export type LeagueStatus =
  | 'not-running'
  /** Client process exists but the LCU does not answer yet. */
  | 'starting'
  /** Client process exists but the LCU has not answered for a while. */
  | 'unreachable'
  | 'idle'
  | 'champ-select'

export interface ChampSelectState {
  /** Locked or hovered champion; null until the player picks one. */
  championId: number | null
  role: Role | null
  gameMode: string | null
  mapId: number | null
}

export interface LeagueState {
  status: LeagueStatus
  summonerName?: string
  champSelect?: ChampSelectState
}

// ---------- Rune import ----------

export interface ImportRequest {
  name: string
  runes: RuneSetup
  /** Set after the user confirmed overwriting this page because no slot was free. */
  replacePageId?: number
}

export type ImportResult =
  | { ok: true; pageName: string }
  | {
      ok: false
      code: 'NOT_CONNECTED' | 'NO_FREE_PAGE' | 'INVALID_PAGE' | 'REQUEST_FAILED'
      message: string
      /** With NO_FREE_PAGE: the page that could be overwritten. */
      replaceable?: { id: number; name: string }
    }

export type UpdateResult = { ok: true; dataset: Dataset } | { ok: false; message: string }

/** Exposed to the renderer as `window.api`. The UI never talks to the LCU itself. */
export interface Api {
  getData(): Promise<Dataset>
  /** Returns the newer Data Dragon version if the local data is behind, else null. */
  checkUpdate(): Promise<string | null>
  updateData(): Promise<UpdateResult>
  getState(): Promise<LeagueState>
  onState(listener: (state: LeagueState) => void): () => void
  importRunes(request: ImportRequest): Promise<ImportResult>
  launchLeague(): Promise<{ ok: boolean; message?: string }>
}
