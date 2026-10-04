import { useMemo } from 'react'
import type { BuildSet, RunePageStat, RuneVariant, StaticData } from '../../shared/types'
import { percent } from './lib'
import { RuneIcon, type Detail } from './ui'
import { t } from '../../shared/i18n'

/** Tree id -> rows of rune ids, as laid out in the client. */
export function useTrees(data: StaticData): Map<number, number[][]> {
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
      <RuneIcon id={variant.perks[0]} data={data} size={46} onOpen={onOpen} />
      {variant.perks.slice(1, 4).map((id) => (
        <RuneIcon key={id} id={id} data={data} size={30} onOpen={onOpen} />
      ))}
      <span className="mx-1 h-8 w-px bg-line" />
      {variant.perks.slice(4).map((id) => (
        <RuneIcon key={id} id={id} data={data} size={30} onOpen={onOpen} />
      ))}
      <span className="mx-1 h-8 w-px bg-line" />
      {variant.shards.map((id, index) => (
        <RuneIcon key={index} id={id} data={data} size={24} />
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
      <div className="mb-2 text-xs text-mute">{data.styles[style]?.name}</div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-3">
            {row.map((id) => (
              <div key={id} className="w-10 text-center">
                <RuneIcon id={id} data={data} size={index === 0 && rows.length === 4 ? 36 : 28} dim={!chosen.includes(id)} onOpen={onOpen} />
                <div className={`display text-xs ${chosen.includes(id) ? 'text-bone' : 'text-mute/60'}`}>
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
        <div className="mb-2 text-xs text-mute">{t('Shards')}</div>
        <div className="space-y-2">
          {variant.shards.map((chosen, row) => {
            const options = usage.shards[row]?.length ? usage.shards[row] : [{ id: chosen, pickRate: 0 }]
            return (
              <div key={row} className="flex gap-3">
                {options.map((option) => (
                  <div key={option.id} className="w-10 text-center">
                    <RuneIcon id={option.id} data={data} size={22} dim={option.id !== chosen} />
                    <div className={`display text-xs ${option.id === chosen ? 'text-bone' : 'text-mute/60'}`}>
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

// The options of the three shard rows, in the client's order.
const SHARD_ROWS = [
  [5008, 5005, 5007],
  [5008, 5010, 5001],
  [5011, 5013, 5001]
]

/**
 * A build's own mark: the route its runes take through the two trees, drawn as one line.
 * Every rune sits where it sits in the client, so two builds only share a sigil if they share
 * every rune. The faint dots are the runes not taken; the grid at the bottom right is the shards.
 */
export function Sigil({
  page,
  variant,
  data,
  size = 148
}: {
  page: RunePageStat
  variant: RuneVariant
  data: StaticData
  size?: number
}) {
  const trees = useTrees(data)
  const small = size < 80

  // Primary tree on the left, secondary on the right, each row spread across its width.
  const place = (rows: number[][], left: number, width: number, top: number, step: number) =>
    rows.flatMap((row, index) =>
      row.map((id, column) => ({ id, x: left + ((column + 0.5) / row.length) * width, y: top + index * step }))
    )
  const nodes = [
    ...place(trees.get(page.primaryStyle) ?? [], 8, 52, 12, 22),
    ...place((trees.get(page.subStyle) ?? []).slice(1), 64, 30, 14, 18)
  ]
  const route = variant.perks
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is (typeof nodes)[number] => node !== undefined)
  if (route.length < 2) return null

  const line = route.map((node, index) => `${index === 0 ? 'M' : 'L'}${node.x.toFixed(1)} ${node.y.toFixed(1)}`).join(' ')
  const end = route[route.length - 1]

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={variant.perks.map((id) => data.runes[id]?.name).join(', ')}>
      {!small &&
        nodes.map((node) => <circle key={node.id} cx={node.x} cy={node.y} r="1.1" className="fill-mute" opacity="0.45" />)}
      <path
        // Redrawn whenever the build changes.
        key={variant.perks.join('-')}
        d={line}
        pathLength={1}
        fill="none"
        className="sigil-line stroke-gold"
        strokeWidth={small ? 4.5 : 2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={route[0].x} cy={route[0].y} r={small ? 6 : 5} fill="none" className="stroke-gold" strokeWidth={small ? 3.5 : 2} />
      <circle cx={end.x} cy={end.y} r={small ? 4.5 : 2.8} className="fill-gold" />
      {!small &&
        SHARD_ROWS.map((options, row) =>
          options.map((id, column) => {
            // The same shard can appear in two rows, so the row decides which one is meant.
            const chosen = variant.shards[row] === id
            return (
              <circle
                key={`${row}-${column}`}
                cx={70 + column * 9}
                cy={74 + row * 8}
                r={chosen ? 2.4 : 1.1}
                className={chosen ? 'fill-gold' : 'fill-mute'}
                opacity={chosen ? 1 : 0.45}
              />
            )
          })
        )}
    </svg>
  )
}
