import { useMemo } from 'react'
import type { BuildSet, RunePageStat, RuneVariant, StaticData } from '../../shared/types'
import { percent } from './lib'
import { RuneIcon, type Detail } from './ui'
import { t } from '../../shared/i18n'

/** Tree id -> rows of rune ids, as laid out in the client. */
function useTrees(data: StaticData): Map<number, number[][]> {
  return useMemo(() => {
    const trees = new Map<number, number[][]>()
    for (const [id, rune] of Object.entries(data.runes)) {
      const rows = trees.get(rune.style) ?? []
      ;(rows[rune.row] ??= []).push(Number(id))
      trees.set(rune.style, rows)
    }
    return trees
  }, [data])
}

/** The chosen runes only, in one line. */
export function RuneLine({
  variant,
  data,
  onOpen
}: {
  variant: RuneVariant
  data: StaticData
  onOpen?: (detail: Detail) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <RuneIcon id={variant.perks[0]} data={data} size={40} onOpen={onOpen} />
      {variant.perks.slice(1, 4).map((id) => (
        <RuneIcon key={id} id={id} data={data} size={26} onOpen={onOpen} />
      ))}
      <span className="mx-1.5 h-6 w-px bg-line" />
      {variant.perks.slice(4).map((id) => (
        <RuneIcon key={id} id={id} data={data} size={26} onOpen={onOpen} />
      ))}
      <span className="mx-1.5 h-6 w-px bg-line" />
      {variant.shards.map((id, index) => (
        <RuneIcon key={index} id={id} data={data} size={20} />
      ))}
    </div>
  )
}

/** The full tree with every option; the chosen runes are lit, each with its usage in the sample. */
export function RuneTree({
  page,
  variant,
  usage,
  data,
  onOpen
}: {
  page: RunePageStat
  variant: RuneVariant
  usage: BuildSet['runeUse']
  data: StaticData
  onOpen: (detail: Detail) => void
}) {
  const trees = useTrees(data)
  const share = (list: { id: number; pickRate: number }[], id: number): string => {
    const use = list.find((entry) => entry.id === id)
    return use ? percent(use.pickRate, 0) : '–'
  }

  const tree = (style: number, rows: number[][], chosen: number[], list: BuildSet['runeUse']['primary']) => (
    <div>
      <div className="mb-2 text-[12px] text-mute">{data.styles[style]?.name}</div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-3">
            {row.map((id) => (
              <div key={id} className="w-10 text-center">
                <RuneIcon id={id} data={data} size={index === 0 && rows.length === 4 ? 36 : 28} dim={!chosen.includes(id)} onOpen={onOpen} />
                <div className={`display text-[11px] ${chosen.includes(id) ? 'text-bone' : 'text-mute/60'}`}>
                  {share(list, id)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  const primaryRows = trees.get(page.primaryStyle) ?? []
  const secondaryRows = (trees.get(page.subStyle) ?? []).slice(1)

  return (
    <div className="flex flex-wrap gap-x-10 gap-y-5">
      {tree(page.primaryStyle, primaryRows, variant.perks.slice(0, 4), usage.primary)}
      {tree(page.subStyle, secondaryRows, variant.perks.slice(4), usage.secondary)}
      <div>
        <div className="mb-2 text-[12px] text-mute">{t('Shards')}</div>
        <div className="space-y-2">
          {variant.shards.map((chosen, row) => {
            const options = usage.shards[row]?.length ? usage.shards[row] : [{ id: chosen, pickRate: 0 }]
            return (
              <div key={row} className="flex gap-3">
                {options.map((option) => (
                  <div key={option.id} className="w-10 text-center">
                    <RuneIcon id={option.id} data={data} size={22} dim={option.id !== chosen} />
                    <div className={`display text-[11px] ${option.id === chosen ? 'text-bone' : 'text-mute/60'}`}>
                      {option.pickRate ? percent(option.pickRate, 0) : '–'}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
