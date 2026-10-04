// RECOMMENDATION layer: turns statistics plus the situation into picks with reasons.
// Every reason quotes the numbers it rests on; nothing here is invented or weighted by taste.

import { interval, winRate } from './analysis'
import type { BuildSet, ItemSetStat, RunePageStat, RuneVariant, SkillStat, StaticData } from './types'
import { count, percent, t } from './i18n'

/** What the enemy team brings. Set by the user or derived from the draft. */
export interface Facing {
  ad: boolean
  ap: boolean
  cc: boolean
}

export interface Choice<T> {
  pick: T
  reasons: string[]
  /** The pick differs from the most common one because of `Facing`. */
  adapted: boolean
  /** The most common pick already answers the situation. */
  fits?: boolean
}

export interface Recommendation {
  page: Choice<RunePageStat> & {
    /** How clearly the data favours this page over the next best. */
    strength: 'clear' | 'recommended' | 'thin'
    variant: RuneVariant
  }
  starter: ItemSetStat | null
  boots: Choice<ItemSetStat> | null
  path: Choice<ItemSetStat>[]
  skill: SkillStat | null
  spells: ItemSetStat | null
  /** Deviations from the default build caused by the situation. */
  changes: string[]
  /** Usual picks that already answer the situation, so nothing has to change. */
  covered: string[]
}

/** Pages with fewer games are never recommended over a larger sample. */
const MIN_PAGE_GAMES = 30
/** Below this many games a recommendation is labelled as thin. */
const SOLID_SAMPLE = 300
/** An item must be bought at least this often in its slot to replace the most common one. */
const MIN_ADAPT_SHARE = 0.1
/** Five items plus boots: a full build. */
const PATH_LENGTH = 5
/** A purchase slot with fewer games than this says too little; overall item usage decides instead. */
const MIN_SLOT_GAMES = 20

const FACING_TAGS: [flag: keyof Facing, tag: string, gives: string][] = [
  ['ad', 'Armor', t('Rüstung')],
  ['ap', 'SpellBlock', t('Magieresistenz')],
  ['cc', 'Tenacity', t('Zähigkeit')]
]


function pickPage(set: BuildSet, data: StaticData): Recommendation['page'] | null {
  const mostPlayed = set.pages[0]
  if (!mostPlayed) return null

  const name = (page: RunePageStat): string =>
    `${data.runes[page.keystone]?.name ?? page.keystone} + ${data.styles[page.subStyle]?.name ?? page.subStyle}`
  const low = (page: RunePageStat): number => interval(page.wins, page.games).low

  const viable = set.pages.filter((page) => page.games >= MIN_PAGE_GAMES).sort((a, b) => low(b) - low(a))
  const best = viable[0] ?? mostPlayed
  const next = viable.find((page) => page !== best)

  const reasons: string[] = []
  if (best === mostPlayed) {
    reasons.push(
      t`Meistgespielt: ${percent(best.pickRate)} der Spiele, ${percent(winRate(best))} Winrate bei ${count(best.games)} Spielen.`
    )
  } else {
    reasons.push(
      t`${percent(winRate(best))} Winrate bei ${count(best.games)} Spielen. Selbst am unteren Rand des 95-%-Bereichs (${percent(low(best))}) liegt sie vor der meistgespielten Seite ${name(mostPlayed)} (${percent(low(mostPlayed))}).`,
      t`Wird seltener gespielt: ${percent(best.pickRate)} gegenüber ${percent(mostPlayed.pickRate)}.`
    )
  }
  if (next) {
    reasons.push(t`Nächste Alternative: ${name(next)} mit ${percent(winRate(next))} bei ${count(next.games)} Spielen.`)
  }

  const clear = next !== undefined && low(best) > interval(next.wins, next.games).high
  const strength = clear ? 'clear' : best.games >= SOLID_SAMPLE ? 'recommended' : 'thin'
  if (strength === 'thin') reasons.push(t`Nur ${count(best.games)} Spiele – die Aussage ist entsprechend unsicher.`)

  return { pick: best, variant: best.variants[0], reasons, strength, adapted: false }
}

/** Why an item fits the situation, or null when it has nothing to do with it. */
function situational(
  option: ItemSetStat,
  wanted: (typeof FACING_TAGS)[number][],
  data: StaticData,
  situation: Situation
): { flag: keyof Facing; reason: string } | null {
  const tags = data.items[option.ids[0]]?.tags ?? []
  const match = wanted.find(([, tag]) => tags.includes(tag))
  if (!match) return null
  const [flag, , gives] = match
  return { flag, reason: t`Gibt ${gives}. ${situation[flag]}` }
}

/** One sentence per flag saying where it comes from, e.g. "Gegner mit physischem Schaden: Zed, Jinx." */
export type Situation = Record<keyof Facing, string>

function pickItem(
  options: ItemSetStat[],
  label: string,
  open: Set<keyof Facing>,
  data: StaticData,
  situation: Situation,
  /** The slot is only known as part of the most common combination, not by its own options. */
  fromCombination = false
): Choice<ItemSetStat> | null {
  const usual = options[0]
  if (!usual) return null
  const itemName = (option: ItemSetStat): string => data.items[option.ids[0]]?.name ?? `Item ${option.ids[0]}`
  const usage = (option: ItemSetStat): string =>
    t`${percent(option.pickRate)} der Spiele, ${percent(winRate(option))} Winrate bei ${count(option.games)} Spielen`
  const wanted = FACING_TAGS.filter(([flag]) => open.has(flag))
  const usualReason = fromCombination
    ? t`Teil der meistgekauften Dreier-Kombination. Insgesamt gekauft in ${usage(usual)}.`
    : t`${label} am häufigsten gekauft: ${usage(usual)}.`

  // The usual pick may already answer the situation.
  const usualFit = situational(usual, wanted, data, situation)
  if (usualFit) {
    open.delete(usualFit.flag)
    return {
      pick: usual,
      adapted: false,
      fits: true,
      reasons: [usualReason, usualFit.reason]
    }
  }

  for (const option of options) {
    if (option.pickRate < MIN_ADAPT_SHARE) break
    const fit = situational(option, wanted, data, situation)
    if (!fit) continue
    // Not at the price of a clearly worse result: skip options whose whole range lies below the usual pick's.
    if (interval(option.wins, option.games).high < interval(usual.wins, usual.games).low) continue
    open.delete(fit.flag)
    return {
      pick: option,
      adapted: true,
      reasons: [
        fit.reason,
        t`${label} in ${usage(option)}.`,
        t`Ohne diese Situation wäre es ${itemName(usual)} (${percent(usual.pickRate)}).`
      ]
    }
  }
  return { pick: usual, adapted: false, reasons: [usualReason] }
}

export function recommend(
  set: BuildSet,
  facing: Facing,
  data: StaticData,
  situation: Situation
): Recommendation | null {
  const page = pickPage(set, data)
  if (!page) return null

  const active = (): Set<keyof Facing> =>
    new Set((Object.keys(facing) as (keyof Facing)[]).filter((flag) => facing[flag]))
  const isBoots = (option: ItemSetStat): boolean => data.items[option.ids[0]]?.tags.includes('Boots') ?? false
  const itemName = (id: number): string => data.items[id]?.name ?? `Item ${id}`
  const changes: string[] = []

  const boots = pickItem(set.boots, t('Als Stiefel'), active(), data, situation)
  if (boots?.adapted) changes.push(t`Stiefel: ${itemName(boots.pick.ids[0])} statt ${itemName(set.boots[0].ids[0])}`)

  // Each situation flag changes at most one item, in the earliest slot that offers a fitting one.
  const open = active()
  const path: Choice<ItemSetStat>[] = []
  const taken = new Set<number>()
  for (const [index, slot] of set.slots.slice(0, PATH_LENGTH).entries()) {
    const options = slot.filter((option) => !taken.has(option.ids[0]) && !isBoots(option))
    // Late slots are reached in few games; below the threshold the rest is filled from overall usage.
    if (!options[0] || options[0].games < MIN_SLOT_GAMES) break
    const choice = pickItem(options, t`Als ${index + 1}. Item`, open, data, situation, set.quick === true && index < 3)
    if (!choice) break
    taken.add(choice.pick.ids[0])
    path.push(choice)
    if (choice.adapted) {
      changes.push(t`${index + 1}. Item: ${itemName(choice.pick.ids[0])} statt ${itemName(options[0].ids[0])}`)
    }
  }

  // Complete the build with the most bought items that are not in it yet.
  for (const option of set.items) {
    if (path.length >= PATH_LENGTH) break
    if (option.ids.length !== 1 || taken.has(option.ids[0]) || isBoots(option)) continue
    // Support and jungle starter upgrades appear in the usage list but are not a purchase of their own.
    if ((data.items[option.ids[0]]?.gold ?? 0) < 1600) continue
    taken.add(option.ids[0])
    path.push({
      pick: option,
      adapted: false,
      reasons: [
        t`Für diesen Kauf-Slot gibt es zu wenige Spiele. Unter den übrigen Items am häufigsten gekauft: ${percent(option.pickRate)} der Spiele, ${percent(winRate(option))} Winrate bei ${count(option.games)} Spielen.`
      ]
    })
  }

  const covered = [...path, ...(boots ? [boots] : [])]
    .filter((choice) => choice.fits)
    .map((choice) => `${itemName(choice.pick.ids[0])}: ${choice.reasons[1]}`)

  return {
    page,
    starter: set.starters[0] ?? null,
    boots,
    path,
    skill: set.skills[0] ?? null,
    spells: set.spells.find((pair) => pair.ids.length === 2) ?? null,
    changes,
    covered
  }
}
