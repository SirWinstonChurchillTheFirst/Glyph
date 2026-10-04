// ANALYSIS layer: pure functions over normalised statistics. No I/O, no UI.

import type { BuildSet, Role, RunePageStat, RuneVariant, Stat, StaticData } from './types'
import { decimal, t } from './i18n'

export const winRate = (stat: { games: number; wins: number }): number =>
  stat.games > 0 ? stat.wins / stat.games : 0

/**
 * 95 % Wilson score interval for a win rate. This is the honest version of a "confidence"
 * number: with few games the range is wide, with many it is narrow.
 */
export function interval(wins: number, games: number): { low: number; high: number } {
  if (games <= 0) return { low: 0, high: 1 }
  const z = 1.96
  const p = wins / games
  const denominator = 1 + (z * z) / games
  const centre = (p + (z * z) / (2 * games)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / denominator
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) }
}

/** True when the interval lies entirely on one side of 50 %. */
export function verdict(wins: number, games: number): 'above' | 'below' | 'open' {
  const { low, high } = interval(wins, games)
  return low > 0.5 ? 'above' : high < 0.5 ? 'below' : 'open'
}

/**
 * Sums statistics from several samples. Each list's sample size is recovered from an entry's
 * games and pick rate, so the merged pick rate is again a share of all games.
 */
function merge<T extends Stat>(lists: T[][], keyOf: (entry: T) => string): T[] {
  const merged = new Map<string, T>()
  let total = 0
  for (const list of lists) {
    const reference = list.find((entry) => entry.pickRate > 0 && entry.games > 0)
    if (!reference) continue
    total += reference.games / reference.pickRate
    for (const entry of list) {
      const existing = merged.get(keyOf(entry))
      if (existing) {
        existing.games += entry.games
        existing.wins += entry.wins
      } else merged.set(keyOf(entry), { ...entry })
    }
  }
  const result = [...merged.values()]
  for (const entry of result) entry.pickRate = total > 0 ? entry.games / total : 0
  return result.sort((a, b) => b.games - a.games)
}

const idsKey = (entry: { ids: number[] }): string => entry.ids.join('-')
const variantKey = (variant: RuneVariant): string => `${variant.perks.join('-')}|${variant.shards.join('-')}`

/** Sums the build statistics of several matchups into one set. */
export function aggregate(sets: BuildSet[], coverage: number): BuildSet {
  const pages = merge(
    sets.map((set) => set.pages),
    (page) => page.key
  ).map((page): RunePageStat => ({
    ...page,
    variants: merge(
      sets.map((set) => set.pages.find((other) => other.key === page.key)?.variants ?? []),
      variantKey
    )
  }))
  const depth = Math.max(0, ...sets.map((set) => set.slots.length))

  return {
    opponentIds: sets.flatMap((set) => set.opponentIds),
    sample: sets.reduce((sum, set) => sum + set.sample, 0),
    coverage,
    pages,
    runeUse: {
      primary: merge(sets.map((set) => set.runeUse.primary), (rune) => String(rune.id)),
      secondary: merge(sets.map((set) => set.runeUse.secondary), (rune) => String(rune.id)),
      shards: [0, 1, 2].map((row) =>
        merge(sets.map((set) => set.runeUse.shards[row] ?? []), (rune) => String(rune.id))
      )
    },
    starters: merge(sets.map((set) => set.starters), idsKey),
    boots: merge(sets.map((set) => set.boots), idsKey),
    cores: merge(sets.map((set) => set.cores), idsKey),
    slots: Array.from({ length: depth }, (_, slot) =>
      merge(sets.map((set) => set.slots[slot] ?? []), idsKey)
    ),
    items: merge(sets.map((set) => set.items), idsKey),
    skills: merge(sets.map((set) => set.skills), (skill) => skill.order.join('')),
    spells: merge(sets.map((set) => set.spells), idsKey),
    lane: null,
    perOpponent: sets.map((set) => ({
      opponentId: set.opponentIds[0],
      pages: set.pages.map(({ key, games, wins }) => ({ key, games, wins }))
    }))
  }
}

// ---------- Team composition ----------

export type Level = 'low' | 'medium' | 'high'

export interface TeamMetric {
  id: string
  label: string
  level: Level
  /** What the level is based on, shown to the user. */
  basis: string
}

export interface TeamAnalysis {
  /** Champions that were recognised and have data. */
  known: number
  ad: string[]
  ap: string[]
  metrics: TeamMetric[]
}

// Riot's subclasses and what they stand for in a draft.
const CLASS_METRICS: [id: string, label: string, classes: string[]][] = [
  ['engage', 'Engage', ['VANGUARD', 'DIVER']],
  ['peel', 'Peel', ['WARDEN', 'ENCHANTER']],
  ['poke', 'Poke', ['ARTILLERY']],
  ['burst', 'Burst', ['BURST', 'ASSASSIN']]
]

const RATING_METRICS: [id: 'toughness' | 'control' | 'mobility', label: string][] = [
  ['toughness', 'Frontline'],
  ['control', 'Crowd Control'],
  ['mobility', t('Mobilität')]
]

export function analyzeTeam(championIds: number[], data: StaticData): TeamAnalysis {
  const champions = championIds.map((id) => data.champions[id]).filter(Boolean)
  const rated = champions.filter((champion) => champion.ratings)
  const metrics: TeamMetric[] = []

  for (const [id, label] of RATING_METRICS) {
    if (rated.length === 0) continue
    const average = rated.reduce((sum, champion) => sum + champion.ratings![id], 0) / rated.length
    metrics.push({
      id,
      label,
      level: average < 1.6 ? 'low' : average < 2.2 ? 'medium' : 'high',
      basis: t`Ø ${decimal(average)} von 3 über ${rated.length} Champions`
    })
  }
  for (const [id, label, classes] of CLASS_METRICS) {
    const matching = champions.filter((champion) => champion.classes.some((name) => classes.includes(name)))
    metrics.push({
      id,
      label,
      level: matching.length === 0 ? 'low' : matching.length === 1 ? 'medium' : 'high',
      basis: matching.length > 0 ? matching.map((champion) => champion.name).join(', ') : t('kein Champion dieser Klasse')
    })
  }

  return {
    known: champions.length,
    ad: champions.filter((champion) => champion.adaptive === 'AD').map((champion) => champion.name),
    ap: champions.filter((champion) => champion.adaptive === 'AP').map((champion) => champion.name),
    metrics
  }
}

/** The enemy most likely to share the player's lane, judged by the positions each champion plays. */
export function laneOpponent(enemyIds: number[], role: Role, data: StaticData): number | null {
  const candidates = enemyIds.filter((id) => data.champions[id]?.positions.includes(role))
  if (candidates.length === 1) return candidates[0]
  return candidates.find((id) => data.champions[id].positions[0] === role) ?? null
}
