// DATA layer: champion statistics from OP.GG's public MCP endpoint (JSON-RPC over HTTP).
// Responses are normalised into the app's own types here, so nothing else depends on the
// source's format. Results are cached in memory and on disk.

import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { aggregate } from '../../shared/analysis'
import type {
  BuildSet,
  ChampionProfile,
  ItemSetStat,
  LaneVerdict,
  Role,
  Stat,
  StaticData
} from '../../shared/types'

const ENDPOINT = 'https://mcp-api.op.gg/mcp'
const CACHE_TTL = 24 * 60 * 60 * 1000
const MAX_PARALLEL = 6
/** The summed view covers this many of the champion's most played matchups. */
const AGGREGATE_MATCHUPS = 6

const ROLES: Record<string, Role> = { TOP: 'top', JUNGLE: 'jungle', MID: 'mid', ADC: 'adc', SUPPORT: 'support' }

// ---------- Transport ----------

let sessionId: string | null = null
let ready: Promise<void> | null = null
let requestId = 0

async function rpc(method: string, params: unknown): Promise<{ result?: any; error?: { message: string } }> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(25000)
  })
  sessionId = response.headers.get('mcp-session-id') ?? sessionId
  if (!response.ok) throw new Error(`OP.GG antwortet mit Status ${response.status}.`)
  const text = await response.text()
  // The endpoint may answer as a server-sent event stream; the payload is its last data line.
  const payload = text.includes('data:')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .pop()!
    : text
  return JSON.parse(payload)
}

function connect(): Promise<void> {
  ready ??= rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'glyph', version: app.getVersion() }
  }).then(
    () => undefined,
    (error) => {
      ready = null
      throw error
    }
  )
  return ready
}

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const attempt = async (): Promise<any> => {
    await connect()
    const response = await rpc('tools/call', { name, arguments: args })
    if (response.error) throw new Error(response.error.message)
    const text = (response.result?.content ?? []).map((part: { text?: string }) => part.text ?? '').join('')
    if (response.result?.isError) throw new Error(text || 'OP.GG hat die Anfrage abgelehnt.')
    return JSON.parse(text)
  }
  try {
    return await attempt()
  } catch {
    // Sessions expire; one fresh attempt covers that.
    ready = null
    sessionId = null
    return attempt()
  }
}

let running = 0
const waiting: (() => void)[] = []

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  try {
    return await task()
  } finally {
    running--
    waiting.shift()?.()
  }
}

// ---------- Cache ----------

const memory = new Map<string, Promise<unknown>>()
const cacheFile = (key: string): string => path.join(app.getPath('userData'), 'stats-cache', `${key}.json`)

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = memory.get(key)
  if (existing) return existing as Promise<T>

  const promise = (async () => {
    try {
      const stored = JSON.parse(await readFile(cacheFile(key), 'utf8')) as { at: number; value: T }
      if (Date.now() - stored.at < CACHE_TTL) return stored.value
    } catch {
      // Not cached yet.
    }
    const value = await load()
    void mkdir(path.dirname(cacheFile(key)), { recursive: true })
      .then(() => writeFile(cacheFile(key), JSON.stringify({ at: Date.now(), value })))
      .catch(() => {})
    return value
  })()
  memory.set(key, promise)
  // A failed request must not stick; the next call tries again.
  promise.catch(() => memory.delete(key))
  setTimeout(() => memory.delete(key), CACHE_TTL).unref()
  return promise
}

// ---------- Normalisation ----------

const stat = (raw: any): Stat => ({
  games: Number(raw?.play) || 0,
  wins: Number(raw?.win) || 0,
  pickRate: Number(raw?.pick_rate) || 0
})
const ids = (raw: unknown): number[] => (Array.isArray(raw) ? raw.map(Number) : [])
const sets = (raw: unknown): ItemSetStat[] =>
  (Array.isArray(raw) ? raw : []).map((entry) => ({ ...stat(entry), ids: ids(entry.ids) }))
const uses = (raw: any): (Stat & { id: number })[] =>
  (Array.isArray(raw?.runes) ? raw.runes : []).map((entry: any) => ({ ...stat(entry), id: Number(entry.id) }))

interface Guide {
  profile: ChampionProfile
  /** Null when the source has no data for this pairing. */
  builds: BuildSet | null
}

function parseGuide(raw: any, championId: number, role: Role, opponentId: number): Guide {
  const data = raw?.data
  if (!data?.summary) throw new Error('OP.GG hat für diesen Champion keine Daten geliefert.')

  const positions: any[] = data.summary.positions ?? []
  const position = positions.find((entry) => ROLES[entry.name] === role)
  const stats = position?.stats ?? data.summary.average_stats ?? {}
  const trend: any[] = data.trends?.win ?? []

  const profile: ChampionProfile = {
    championId,
    role,
    games: Number(stats.play) || 0,
    winRate: Number(stats.win_rate) || 0,
    pickRate: Number(stats.pick_rate) || 0,
    banRate: Number(stats.ban_rate) || 0,
    kda: Number(stats.kda) || 0,
    tier: stats.tier_data?.tier ?? null,
    rank: stats.tier_data?.rank ?? null,
    positions: positions
      .filter((entry) => ROLES[entry.name])
      .map((entry) => ({
        role: ROLES[entry.name],
        games: Number(entry.stats?.play) || 0,
        roleRate: Number(entry.stats?.role_rate) || 0
      })),
    archetypes: (position?.roles ?? []).map((entry: any) => ({
      name: String(entry.name),
      games: Number(entry.stats?.play) || 0,
      wins: Number(entry.stats?.win) || 0,
      share: Number(entry.stats?.role_rate) || 0
    })),
    matchups: (data.counters ?? []).map((entry: any) => ({
      opponentId: Number(entry.champion_id),
      games: Number(entry.play) || 0,
      wins: Number(entry.win) || 0
    })),
    gameLengths: (data.game_lengths ?? []).map((entry: any) => ({
      from: Number(entry.game_length) || 0,
      winRate: Number(entry.rate) || 0
    })),
    trend: trend.map((entry) => ({ patch: String(entry.version), winRate: Number(entry.rate) || 0 })).reverse(),
    patch: trend[0]?.version ?? null
  }

  const pages: BuildSet['pages'] = (data.rune_pages ?? []).map((page: any) => ({
    ...stat(page),
    key: `${page.id}-${page.secondary_page_id}`,
    keystone: Number(page.id),
    primaryStyle: Number(page.primary_page_id),
    subStyle: Number(page.secondary_page_id),
    variants: (page.builds ?? []).map((variant: any) => ({
      ...stat(variant),
      perks: [...ids(variant.primary_rune_ids), ...ids(variant.secondary_rune_ids)],
      shards: ids(variant.stat_mod_ids)
    }))
  }))
  if (pages.length === 0) return { profile, builds: null }

  const side = (name: unknown): LaneVerdict['advantage'] =>
    typeof name !== 'string'
      ? null
      : name === raw.my_champion
        ? 'me'
        : name === raw.opponent_champion
          ? 'opponent'
          : name.toUpperCase() === 'EVEN'
            ? 'even'
            : null

  const builds: BuildSet = {
    opponentIds: [opponentId],
    sample: pages[0].pickRate > 0 ? Math.round(pages[0].games / pages[0].pickRate) : pages[0].games,
    coverage: null,
    pages,
    runeUse: {
      primary: uses(data.single_runes?.primary_page),
      secondary: uses(data.single_runes?.secondary_page),
      shards: ['stat_mod_one', 'stat_mod_two', 'stat_mod_three'].map((row) => uses(data.single_runes?.[row]))
    },
    starters: sets(data.starter_items),
    boots: sets(data.boots),
    cores: sets(data.core_items),
    slots: [...(data.single_items ?? [])]
      .sort((a: any, b: any) => a.depth - b.depth)
      .map((slot: any) => sets(slot.items)),
    items: sets(data.last_items),
    skills: (data.skills ?? []).map((entry: any) => ({ ...stat(entry), order: entry.order ?? [] })),
    lane: {
      tip: data.opponent_champion_tip || null,
      advantage: side(data.lane_advantage_champion),
      soloKill: side(data.lane_solo_kill_advantage_champion),
      playStyle: data.recommended_play_style || null
    },
    perOpponent: []
  }
  return { profile, builds }
}

// ---------- Public API ----------

function guide(data: StaticData, championId: number, role: Role, opponentId: number): Promise<Guide> {
  const me = data.champions[championId]
  const opponent = data.champions[opponentId]
  if (!me || !opponent) return Promise.reject(new Error('Unbekannter Champion.'))
  return cached(`guide-${championId}-${role}-${opponentId}`, () =>
    limited(async () =>
      parseGuide(
        await callTool('lol_get_lane_matchup_guide', {
          position: role,
          my_champion: me.slug,
          opponent_champion: opponent.slug
        }),
        championId,
        role,
        opponentId
      )
    )
  )
}

/** Opponent-independent statistics. Asking for the mirror matchup returns exactly those. */
export async function getProfile(data: StaticData, championId: number, role: Role): Promise<ChampionProfile> {
  return (await guide(data, championId, role, championId)).profile
}

export async function getBuilds(
  data: StaticData,
  championId: number,
  role: Role,
  opponentId: number | null
): Promise<BuildSet> {
  if (opponentId !== null) {
    const { builds } = await guide(data, championId, role, opponentId)
    if (!builds) throw new Error('Für dieses Matchup liegen keine Build-Daten vor.')
    return builds
  }

  return cached(`aggregate-${championId}-${role}`, async () => {
    const { matchups } = await getProfile(data, championId, role)
    const top = [...matchups].sort((a, b) => b.games - a.games).slice(0, AGGREGATE_MATCHUPS)
    const guides = await Promise.all(
      top.map((matchup) => guide(data, championId, role, matchup.opponentId).catch(() => null))
    )
    const builds = guides.map((entry) => entry?.builds).filter((entry): entry is BuildSet => !!entry)
    if (builds.length === 0) throw new Error('Für diesen Champion liegen in dieser Rolle keine Build-Daten vor.')

    const all = matchups.reduce((sum, matchup) => sum + matchup.games, 0)
    const covered = top
      .filter((matchup) => builds.some((set) => set.opponentIds[0] === matchup.opponentId))
      .reduce((sum, matchup) => sum + matchup.games, 0)
    return aggregate(builds, all > 0 ? covered / all : 0)
  })
}
