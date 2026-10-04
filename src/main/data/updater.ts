// Builds data/static.json from two open sources:
//   - Data Dragon (Riot): champions, runes, items, patch version, images
//   - Meraki Analytics (open project mirroring Riot's client data): champion subclasses,
//     the five 1–3 ratings, damage type and lane positions
//
// No runtime imports here: scripts/update-data.ts runs this file directly with Node.

import type { ChampionInfo, Role, StaticData } from '../../shared/types'

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const MERAKI = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json'

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

const POSITIONS: Record<string, Role> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'mid',
  BOTTOM: 'adc',
  SUPPORT: 'support'
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return (await response.json()) as T
}

const plain = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** "Nunu & Willump" -> "NUNU_WILLUMP", "Kai'Sa" -> "KAISA" */
const slug = (name: string): string =>
  name
    .toUpperCase()
    .replace(/['.]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

interface DdChampion {
  id: string
  key: string
  name: string
  info: { attack: number; magic: number }
}

interface MerakiChampion {
  id: number
  adaptiveType?: string
  roles?: string[]
  positions?: string[]
  attributeRatings?: Record<string, number>
}

interface RuneTree {
  id: number
  name: string
  icon: string
  slots: { runes: { id: number; name: string; icon: string; shortDesc: string }[] }[]
}

export async function latestVersion(): Promise<string> {
  return (await getJson<string[]>(`${DDRAGON}/api/versions.json`))[0]
}

export async function buildStatic(): Promise<StaticData> {
  const version = await latestVersion()
  const base = `${DDRAGON}/cdn/${version}/data/en_US`
  const [champions, trees, items, spells, meraki] = await Promise.all([
    getJson<{ data: Record<string, DdChampion> }>(`${base}/champion.json`),
    getJson<RuneTree[]>(`${base}/runesReforged.json`),
    getJson<{
      data: Record<string, { name: string; description: string; tags?: string[]; gold?: { total: number } }>
    }>(`${base}/item.json`),
    getJson<{ data: Record<string, { key: string; name: string; image: { full: string } }> }>(`${base}/summoner.json`),
    // Optional: without it the team analysis has less to work with, the rest is unaffected.
    getJson<Record<string, MerakiChampion>>(MERAKI).catch(() => ({}) as Record<string, MerakiChampion>)
  ])

  const data: StaticData = { patch: version, champions: {}, styles: {}, runes: {}, shards: {}, items: {}, spells: {} }
  const merakiById = new Map(Object.values(meraki).map((champion) => [String(champion.id), champion]))

  for (const champion of Object.values(champions.data)) {
    const extra = merakiById.get(champion.key)
    const ratings = extra?.attributeRatings
    const info: ChampionInfo = {
      key: champion.id,
      name: champion.name,
      slug: slug(champion.name),
      adaptive: extra?.adaptiveType
        ? extra.adaptiveType === 'MAGIC_DAMAGE'
          ? 'AP'
          : 'AD'
        : champion.info.magic > champion.info.attack
          ? 'AP'
          : 'AD',
      classes: extra?.roles ?? [],
      ratings: ratings
        ? {
            damage: ratings.damage,
            toughness: ratings.toughness,
            control: ratings.control,
            mobility: ratings.mobility,
            utility: ratings.utility
          }
        : null,
      positions: (extra?.positions ?? []).map((position) => POSITIONS[position]).filter(Boolean)
    }
    data.champions[champion.key] = info
  }
  for (const tree of trees) {
    data.styles[tree.id] = { name: tree.name, icon: tree.icon }
    tree.slots.forEach((slot, row) => {
      for (const rune of slot.runes) {
        data.runes[rune.id] = { name: rune.name, icon: rune.icon, text: plain(rune.shortDesc), style: tree.id, row }
      }
    })
  }
  for (const [id, [name, icon]] of Object.entries(SHARDS)) {
    data.shards[id] = { name, icon: `perk-images/StatMods/${icon}.png` }
  }
  for (const [id, item] of Object.entries(items.data)) {
    data.items[id] = {
      name: item.name,
      gold: item.gold?.total ?? 0,
      tags: item.tags ?? [],
      text: plain(item.description)
    }
  }
  for (const spell of Object.values(spells.data)) {
    data.spells[spell.key] = { name: spell.name, icon: spell.image.full }
  }
  return data
}
