import type { Dataset, Role, RoleBuild } from '../../shared/types'

const CDN = 'https://ddragon.leagueoflegends.com/cdn'

export const splashUrl = (key: string): string => `${CDN}/img/champion/splash/${key}_0.jpg`
export const championIconUrl = (patch: string, key: string): string => `${CDN}/${patch}/img/champion/${key}.png`
export const itemIconUrl = (patch: string, id: number): string => `${CDN}/${patch}/img/item/${id}.png`
export const perkIconUrl = (icon: string): string => `${CDN}/img/${icon}`

export const ROLE_LABELS: Record<Role, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  adc: 'ADC',
  support: 'Support'
}

/** Items that should be shown as a full build: core without boots, filled up from the late options. */
export function buildPath(build: RoleBuild, data: Dataset): { core: number[]; boots: number | null } {
  const isBoots = (id: number): boolean => data.static.items[id]?.boots === true
  const core = build.coreItems.filter((id) => !isBoots(id))
  for (const options of build.lateItems) {
    const pick = options.find((id) => !core.includes(id) && !isBoots(id))
    if (pick !== undefined && core.length < 5) core.push(pick)
  }
  return { core, boots: build.coreItems.find(isBoots) ?? null }
}

/** Plain-text rune page, the fallback when the client cannot be reached. */
export function runesAsText(title: string, build: RoleBuild, data: Dataset): string {
  const { styles, runes, shards } = data.static
  const { perks } = build.runes
  const names = (ids: number[]): string => ids.map((id) => runes[id]?.name ?? id).join(', ')
  return [
    `${title} (Patch ${data.builds.patch})`,
    `${styles[build.runes.primaryStyle]?.name}: ${names(perks.slice(0, 4))}`,
    `${styles[build.runes.subStyle]?.name}: ${names(perks.slice(4))}`,
    `Shards: ${build.runes.shards.map((id) => shards[id]?.name ?? id).join(', ')}`
  ].join('\n')
}
