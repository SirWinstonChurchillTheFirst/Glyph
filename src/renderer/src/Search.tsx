import { CornerDownLeft, Search as SearchIcon } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { BuildSet, StaticData } from '../../shared/types'
import { pageName } from './lib'
import { ChampionIcon, ItemIcon, RuneIcon, type Detail } from './ui'
import { t } from '../../shared/i18n'

interface Result {
  key: string
  label: string
  kind: string
  icon: React.ReactNode
  run: () => void
}

interface Props {
  data: StaticData
  championId: number | null
  builds: BuildSet | null
  onChampion: (id: number) => void
  onMatchup: (championId: number, opponentId: number) => void
  onDetail: (detail: Detail) => void
  onPage: (key: string) => void
  onClose: () => void
}

const GROUPS = ['Champion', 'Matchup', 'Build', 'Item', 'Rune']
const GROUP_LABELS: Record<string, string> = {
  Champion: t('Champions'),
  Matchup: t('Matchups'),
  Build: t('Builds'),
  Item: t('Items'),
  Rune: t('Runen')
}

const normal = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/** One field for everything: champions, "Bard vs Brand", items, runes and the builds on screen. */
export function Search({ data, championId, builds, onChampion, onMatchup, onDetail, onPage, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const champions = useMemo(
    () => Object.entries(data.champions).map(([id, champion]) => ({ id: Number(id), name: champion.name, key: normal(champion.name) })),
    [data]
  )

  const results = useMemo((): Result[] => {
    const find = (text: string, limit: number) => {
      const needle = normal(text)
      if (!needle) return []
      return champions
        .filter((champion) => champion.key.includes(needle))
        .sort((a, b) => Number(b.key.startsWith(needle)) - Number(a.key.startsWith(needle)) || a.name.localeCompare(b.name))
        .slice(0, limit)
    }
    const out: Result[] = []

    const versus = query.split(/\s+(?:vs\.?|gegen)\s+/i)
    if (versus.length === 2) {
      const [me] = find(versus[0], 1)
      if (me) {
        for (const opponent of find(versus[1], 5)) {
          out.push({
            key: `m-${me.id}-${opponent.id}`,
            label: t`${me.name} gegen ${opponent.name}`,
            kind: 'Matchup',
            icon: <ChampionIcon id={opponent.id} data={data} size={24} />,
            run: () => onMatchup(me.id, opponent.id)
          })
        }
      }
      return out
    }

    const needle = normal(query)
    if (!needle) return out

    for (const champion of find(query, 6)) {
      out.push({
        key: `c-${champion.id}`,
        label: champion.name,
        kind: 'Champion',
        icon: <ChampionIcon id={champion.id} data={data} size={24} />,
        run: () => onChampion(champion.id)
      })
      if (championId !== null && champion.id !== championId) {
        out.push({
          key: `v-${champion.id}`,
          label: t`${data.champions[championId]?.name} gegen ${champion.name}`,
          kind: 'Matchup',
          icon: <ChampionIcon id={champion.id} data={data} size={24} />,
          run: () => onMatchup(championId, champion.id)
        })
      }
    }
    for (const page of builds?.pages ?? []) {
      if (normal(pageName(page, data)).includes(needle)) {
        out.push({
          key: `p-${page.key}`,
          label: pageName(page, data),
          kind: 'Build',
          icon: <RuneIcon id={page.keystone} data={data} size={24} />,
          run: () => onPage(page.key)
        })
      }
    }
    // Items of the current builds first; then anything purchasable.
    const used = new Set((builds?.items ?? []).map((entry) => entry.ids[0]))
    const items = Object.entries(data.items)
      .filter(([, item]) => item.gold > 0 && normal(item.name).includes(needle))
      .map(([id]) => Number(id))
      .sort((a, b) => Number(used.has(b)) - Number(used.has(a)))
    const seen = new Set<string>()
    for (const id of items) {
      // Data Dragon lists some items once per game mode.
      if (seen.has(data.items[id].name)) continue
      seen.add(data.items[id].name)
      if (seen.size > 5) break
      out.push({
        key: `i-${id}`,
        label: data.items[id].name,
        kind: 'Item',
        icon: <ItemIcon id={id} data={data} size={24} />,
        run: () => onDetail({ kind: 'item', id })
      })
    }
    Object.entries(data.runes)
      .filter(([, rune]) => normal(rune.name).includes(needle))
      .slice(0, 4)
      .forEach(([id, rune]) =>
        out.push({
          key: `r-${id}`,
          label: rune.name,
          kind: 'Rune',
          icon: <RuneIcon id={Number(id)} data={data} size={24} />,
          run: () => onDetail({ kind: 'rune', id: Number(id) })
        })
      )
    // Grouped by kind; the sort is stable, so the order inside a group stays.
    return out.sort((a, b) => GROUPS.indexOf(a.kind) - GROUPS.indexOf(b.kind))
  }, [query, champions, data, championId, builds, onChampion, onMatchup, onDetail, onPage])

  useEffect(() => setIndex(0), [query])

  const choose = (result: Result | undefined): void => {
    if (!result) return
    result.run()
    onClose()
  }

  return (
    <div className="absolute inset-0 z-40 flex justify-center bg-ink/75 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className="h-fit w-[580px] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/60"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4">
          <SearchIcon size={16} className="shrink-0 text-mute" />
          <input
            autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            else if (event.key === 'Enter') choose(results[index])
            else if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIndex((value) => Math.min(results.length - 1, value + 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((value) => Math.max(0, value - 1))
            }
          }}
            placeholder={t('Champion, Matchup oder Item suchen …')}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-mute"
          />
          <kbd className="shrink-0 rounded border border-line px-1.5 text-[10px] text-mute">{t('Esc')}</kbd>
        </div>
        {results.length > 0 && (
          <div className="max-h-[420px] overflow-y-auto border-t border-line p-1.5">
            {results.map((result, position) => (
              <Fragment key={result.key}>
                {result.kind !== results[position - 1]?.kind && (
                  <div className="px-2.5 pt-2 pb-1 text-[11px] text-mute">{GROUP_LABELS[result.kind]}</div>
                )}
                <button
                onClick={() => choose(result)}
                onMouseEnter={() => setIndex(position)}
                className={`flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left ${position === index ? 'bg-raised' : ''}`}
              >
                {result.icon}
                <span className="min-w-0 flex-1 truncate">{result.label}</span>
                  {position === index && <CornerDownLeft size={13} className="text-mute" />}
                </button>
              </Fragment>
            ))}
          </div>
        )}
        {query.trim() === '' && (
          <p className="border-t border-line px-4 py-3 text-[12px] text-mute">
            {t('Tipp: „Bard vs Brand“ öffnet direkt das Matchup. Namen sind englisch.')}
          </p>
        )}
        {query.trim() !== '' && results.length === 0 && (
          <p className="border-t border-line px-4 py-3 text-mute">{t('Nichts gefunden. Champion-, Item- und Runennamen sind englisch.')}</p>
        )}
      </div>
    </div>
  )
}
