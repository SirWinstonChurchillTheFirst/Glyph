export type Role = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

// ---------- Static game data (data/static.json) ----------

/** Riot's five champion ratings, 1–3. */
export interface Ratings {
  damage: number
  toughness: number
  control: number
  mobility: number
  utility: number
}

export interface ChampionInfo {
  /** Data Dragon key used in asset URLs, e.g. "MonkeyKing". */
  key: string
  name: string
  /** Name as the statistics source expects it, e.g. "NUNU_WILLUMP". */
  slug: string
  adaptive: 'AD' | 'AP'
  /** Riot subclasses, e.g. VANGUARD, ENCHANTER, ARTILLERY. Empty when unknown. */
  classes: string[]
  ratings: Ratings | null
  positions: Role[]
}

export interface ItemInfo {
  name: string
  gold: number
  /** Data Dragon tags, e.g. Armor, SpellBlock, Tenacity, Boots. */
  tags: string[]
  text: string
}

export interface RuneInfo {
  name: string
  icon: string
  text: string
  style: number
  /** Row inside its tree; 0 is the keystone row. */
  row: number
}

export interface StaticData {
  /** Data Dragon version, e.g. "16.19.1". Also used in asset URLs. */
  patch: string
  champions: Record<string, ChampionInfo>
  styles: Record<string, { name: string; icon: string }>
  runes: Record<string, RuneInfo>
  shards: Record<string, { name: string; icon: string }>
  items: Record<string, ItemInfo>
  /** Summoner spells; `icon` is the file name under the patch's spell images. */
  spells: Record<string, { name: string; icon: string }>
}

// ---------- Statistics (from the statistics source, normalised) ----------

export interface Stat {
  games: number
  wins: number
  /** Share of the games in this sample, 0–1. */
  pickRate: number
}

export interface RuneVariant extends Stat {
  /** Keystone + 3 primary runes, then 2 secondary runes. */
  perks: number[]
  /** Offense, flex, defense. */
  shards: number[]
}

/** A "build" in GLYPH: keystone plus secondary tree, with its concrete variants. */
export interface RunePageStat extends Stat {
  key: string
  keystone: number
  primaryStyle: number
  subStyle: number
  variants: RuneVariant[]
}

export interface ItemSetStat extends Stat {
  ids: number[]
}

export interface RuneUse extends Stat {
  id: number
}

export interface SkillStat extends Stat {
  order: string[]
}

export interface LaneVerdict {
  tip: string | null
  /** Who the source rates as ahead in lane. */
  advantage: 'me' | 'opponent' | 'even' | null
  soloKill: 'me' | 'opponent' | 'even' | null
  playStyle: string | null
}

/** Everything known about how a champion is built, for one matchup or summed over several. */
export interface BuildSet {
  /** One id for a matchup; several when summed over the most played matchups. */
  opponentIds: number[]
  /** Games behind the rune statistics. */
  sample: number
  /** For a sum: share of all the champion's games that the included matchups cover. */
  coverage: number | null
  /**
   * The champion's overall statistics from a single request: one rune page, the most common
   * item combination, few alternatives. Shown first; the detailed sets replace it on demand.
   */
  quick?: boolean
  pages: RunePageStat[]
  runeUse: { primary: RuneUse[]; secondary: RuneUse[]; shards: RuneUse[][] }
  starters: ItemSetStat[]
  boots: ItemSetStat[]
  /** Three-item combinations in purchase order. */
  cores: ItemSetStat[]
  /** Options per purchase slot: index 0 is the first completed item. */
  slots: ItemSetStat[][]
  /** Item usage regardless of slot. */
  items: ItemSetStat[]
  skills: SkillStat[]
  /** Summoner spell pairs; the order inside a pair carries no meaning. */
  spells: ItemSetStat[]
  lane: LaneVerdict | null
  /** For a sum: how each build did against each included opponent. */
  perOpponent: { opponentId: number; pages: { key: string; games: number; wins: number }[] }[]
}

export interface ChampionProfile {
  championId: number
  role: Role
  games: number
  winRate: number
  pickRate: number
  banRate: number
  kda: number
  /** Source tier for this role: 0 is strongest, 5 weakest. */
  tier: number | null
  rank: number | null
  positions: { role: Role; games: number; roleRate: number }[]
  /** Build styles as classified by the source. */
  archetypes: { name: string; games: number; wins: number; share: number }[]
  matchups: { opponentId: number; games: number; wins: number }[]
  /** Win rate by game length; `from` is the bucket's start minute. */
  gameLengths: { from: number; winRate: number }[]
  trend: { patch: string; winRate: number }[]
  patch: string | null
}

// ---------- League client state ----------

export type LeagueStatus = 'not-running' | 'starting' | 'unreachable' | 'idle' | 'champ-select' | 'in-game'

export interface DraftSlot {
  /** Locked or hovered champion; null while unknown. */
  championId: number | null
  role: Role | null
  isMe: boolean
}

export interface ChampSelectState {
  championId: number | null
  role: Role | null
  gameMode: string | null
  myTeam: DraftSlot[]
  theirTeam: DraftSlot[]
}

export interface LeagueState {
  status: LeagueStatus
  summonerName?: string
  /** The draft during champ select; during a game the final teams, so the build stays on screen. */
  champSelect?: ChampSelectState
}

// ---------- Rune import ----------

export interface ImportRequest {
  name: string
  primaryStyle: number
  subStyle: number
  perks: number[]
  shards: number[]
  /** Set after the user confirmed overwriting this page because no slot was free. */
  replacePageId?: number
}

export type ImportResult =
  | { ok: true; pageName: string }
  | {
      ok: false
      code: 'NOT_CONNECTED' | 'NO_FREE_PAGE' | 'INVALID_PAGE' | 'REQUEST_FAILED'
      message: string
      replaceable?: { id: number; name: string }
    }

/** Which key Flash goes on; `auto` keeps whatever the player has now. */
export type FlashKey = 'auto' | 'D' | 'F'

export type SpellResult = { ok: true } | { ok: false; message: string }

export type UpdateResult = { ok: true; data: StaticData } | { ok: false; message: string }

/** Exposed to the renderer as `window.api`. The UI never talks to the LCU or the web itself. */
export interface Api {
  getStatic(): Promise<StaticData>
  /** Passing the lane opponent lets the profile ride along with that matchup's request. */
  getProfile(championId: number, role: Role, opponentId: number | null): Promise<ChampionProfile>
  /**
   * With an opponent: that matchup. Without: `quick` is the overall build from one request,
   * `full` the sum over the champion's most played matchups.
   */
  getBuilds(championId: number, role: Role, opponentId: number | null, depth: 'quick' | 'full'): Promise<BuildSet>
  checkUpdate(): Promise<string | null>
  updateData(): Promise<UpdateResult>
  getState(): Promise<LeagueState>
  onState(listener: (state: LeagueState) => void): () => void
  importRunes(request: ImportRequest): Promise<ImportResult>
  /** Sets the two summoner spells in the running champ select. */
  importSpells(ids: number[], flashKey: FlashKey): Promise<SpellResult>
  launchLeague(): Promise<{ ok: boolean; message?: string }>
}
