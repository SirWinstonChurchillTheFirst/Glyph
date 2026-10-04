// Builds the dataset from two sources:
//   - Data Dragon (Riot's official static data): champions, runes, items, patch version
//   - u.gg's aggregated ranked statistics: most played runes, items and skill order per role
//
// The u.gg endpoint is public but undocumented. Everything that depends on its format is in
// `parseRole` below, so swapping the statistics source only touches this file.
//
// No runtime imports here: scripts/update-data.ts runs this file directly with Node.

import type {
  BuildData,
  ChampionBuilds,
  Dataset,
  Role,
  RoleBuild,
  StaticData
} from '../../shared/types'

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const UGG = 'https://stats2.u.gg/lol/1.5/overview'
const UGG_REGION = '12' // World
const UGG_RANKS = ['17', '10'] // Emerald+, then Platinum+
const UGG_ROLES: Record<string, Role> = { 1: 'jungle', 2: 'support', 3: 'adc', 4: 'top', 5: 'mid' }

/** A role is listed when it makes up at least this share of a champion's games. */
const MIN_ROLE_SHARE = 0.1
/** A patch is used once the probe champion has this many games on it. */
const MIN_PATCH_GAMES = 2000
const PROBE_CHAMPION = '103'
const CONCURRENCY = 8

// Stat shards are not part of Data Dragon's rune file.
const SHARDS: Record<string, [name: string, icon: string]> = {
  5008: ['Adaptive Force', 'StatModsAdaptiveForceIcon'],
  5005: ['Attack Speed', 'StatModsAttackSpeedIcon'],
  5007: ['Ability Haste', 'StatModsCDRScalingIcon'],
  5010: ['Move Speed', 'StatModsMovementSpeedIcon'],
  5001: ['Health Scaling', 'StatModsHealthScalingIcon'],
  5011: ['Health', 'StatModsHealthPlusIcon'],
  5013: ['Tenacity and Slow Resist', 'StatModsTenacityIcon']
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return (await response.json()) as T
}

interface RuneTree {
  id: number
  name: string
  icon: string
  slots: { runes: { id: number; name: string; icon: string }[] }[]
}

/** Rune id -> owning tree and row, needed to put u.gg's unordered rune list into slot order. */
type RuneIndex = Map<number, { style: number; row: number }>

async function loadStatic(version: string, locale: string) {
  const base = `${DDRAGON}/cdn/${version}/data/${locale}`
  const [champions, trees, items] = await Promise.all([
    getJson<{ data: Record<string, { id: string; key: string; name: string }> }>(`${base}/champion.json`),
    getJson<RuneTree[]>(`${base}/runesReforged.json`),
    getJson<{ data: Record<string, { name: string; tags?: string[] }> }>(`${base}/item.json`)
  ])

  const data: StaticData = {
    patch: version,
    locale,
    champions: {},
    styles: {},
    runes: {},
    shards: {},
    items: {}
  }
  const runeIndex: RuneIndex = new Map()

  for (const champion of Object.values(champions.data)) {
    data.champions[champion.key] = { key: champion.id, name: champion.name }
  }
  for (const tree of trees) {
    data.styles[tree.id] = { name: tree.name, icon: tree.icon }
    tree.slots.forEach((slot, row) => {
      for (const rune of slot.runes) {
        data.runes[rune.id] = { name: rune.name, icon: rune.icon }
        runeIndex.set(rune.id, { style: tree.id, row })
      }
    })
  }
  for (const [id, [name, icon]] of Object.entries(SHARDS)) {
    data.shards[id] = { name, icon: `perk-images/StatMods/${icon}.png` }
  }
  for (const [id, item] of Object.entries(items.data)) {
    data.items[id] = item.tags?.includes('Boots') ? { name: item.name, boots: true } : { name: item.name }
  }
  return { data, runeIndex }
}

const isIds = (value: unknown, length?: number): value is number[] =>
  Array.isArray(value) &&
  value.every((entry) => Number.isFinite(Number(entry))) &&
  (length === undefined || value.length === length)

/**
 * One role entry of a u.gg overview file. Positional format:
 *   [0] runes   [games, wins, primaryStyle, subStyle, perkIds[6]]
 *   [2] start   [games, wins, itemIds]
 *   [3] core    [games, wins, itemIds]
 *   [4] skills  [games, wins, order[18], priority]
 *   [5] late    per slot (4th, 5th, 6th item): [itemId, wins, games][]
 *   [6] total   [wins, games]
 *   [8] shards  [games, wins, shardIds[3]]
 * Returns null when the entry does not look like that.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRole(entry: any, runeIndex: RuneIndex): RoleBuild | null {
  const [runes, , start, core, skills, late, total, , shards] = entry ?? []
  const [wins, games] = total ?? []
  if (!games || !isIds(runes?.[4], 6) || !isIds(shards?.[2], 3)) return null
  if (!isIds(start?.[2]) || !isIds(core?.[2]) || !Array.isArray(skills?.[2])) return null

  const primaryStyle = Number(runes[2])
  const subStyle = Number(runes[3])
  const inSlotOrder = (style: number): number[] =>
    (runes[4] as number[])
      .filter((id) => runeIndex.get(id)?.style === style)
      .sort((a, b) => runeIndex.get(a)!.row - runeIndex.get(b)!.row)
  const primary = inSlotOrder(primaryStyle)
  const secondary = inSlotOrder(subStyle)
  if (primary.length !== 4 || secondary.length !== 2) return null

  const lateItems = (Array.isArray(late) ? late.slice(0, 3) : [])
    .filter((slot): slot is number[][] => Array.isArray(slot) && slot.length > 0)
    .map((slot) =>
      [...slot]
        .sort((a, b) => b[2] - a[2])
        .slice(0, 2)
        .map((option) => option[0])
    )

  return {
    games,
    winRate: Math.round((wins / games) * 1000) / 1000,
    runes: {
      primaryStyle,
      subStyle,
      perks: [...primary, ...secondary],
      shards: (shards[2] as unknown[]).map(Number)
    },
    startItems: start[2],
    coreItems: core[2],
    lateItems,
    skillOrder: skills[2],
    skillPriority: typeof skills[3] === 'string' ? skills[3] : ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseChampion(file: any, runeIndex: RuneIndex): ChampionBuilds | null {
  const region = file?.[UGG_REGION]
  for (const rank of UGG_RANKS) {
    const parsed: [Role, RoleBuild][] = []
    for (const [key, role] of Object.entries(UGG_ROLES)) {
      const build = parseRole(region?.[rank]?.[key]?.[0], runeIndex)
      if (build) parsed.push([role, build])
    }
    if (parsed.length === 0) continue

    parsed.sort((a, b) => b[1].games - a[1].games)
    const total = parsed.reduce((sum, [, build]) => sum + build.games, 0)
    const kept = parsed.filter(([, build], index) => index === 0 || build.games / total >= MIN_ROLE_SHARE)
    return { defaultRole: kept[0][0], roles: Object.fromEntries(kept) }
  }
  return null
}

const uggUrl = (patch: string, championId: string): string =>
  `${UGG}/${patch.replace('.', '_')}/ranked_solo_5x5/${championId}/1.5.0.json`

/** Newest patch that already has a meaningful number of games (the first days of a patch do not). */
async function pickStatsPatch(versions: string[], runeIndex: RuneIndex): Promise<string> {
  const patches = [...new Set(versions.map((version) => version.split('.').slice(0, 2).join('.')))]
  for (const patch of patches.slice(0, 3)) {
    try {
      const probe = parseChampion(await getJson(uggUrl(patch, PROBE_CHAMPION)), runeIndex)
      const games = Object.values(probe?.roles ?? {}).reduce((sum, build) => sum + build.games, 0)
      if (games >= MIN_PATCH_GAMES) return patch
    } catch {
      // No data for this patch yet.
    }
  }
  throw new Error('Keine Build-Statistiken für die letzten Patches gefunden.')
}

export async function latestVersion(): Promise<string> {
  return (await getJson<string[]>(`${DDRAGON}/api/versions.json`))[0]
}

export async function buildDataset(
  options: { locale?: string; onProgress?: (done: number, total: number) => void } = {}
): Promise<Dataset> {
  const versions = await getJson<string[]>(`${DDRAGON}/api/versions.json`)
  const { data, runeIndex } = await loadStatic(versions[0], options.locale ?? 'en_US')
  const patch = await pickStatsPatch(versions, runeIndex)

  const builds: BuildData = {
    patch,
    source: 'u.gg · Ranked Solo · Emerald+ · World',
    generatedAt: new Date().toISOString(),
    champions: {}
  }

  const queue = Object.keys(data.champions)
  const total = queue.length
  let done = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
        try {
          const champion = parseChampion(await getJson(uggUrl(patch, id)), runeIndex)
          if (champion) builds.champions[id] = champion
        } catch {
          // A champion without statistics is simply left out; the UI says so.
        }
        options.onProgress?.(++done, total)
      }
    })
  )

  if (Object.keys(builds.champions).length < total / 2) {
    throw new Error('Die Statistikquelle hat für zu viele Champions keine Daten geliefert.')
  }
  return { builds, static: data }
}
