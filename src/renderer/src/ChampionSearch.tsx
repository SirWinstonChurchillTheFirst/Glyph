import { useMemo, useState } from 'react'
import type { Dataset } from '../../shared/types'
import { championIconUrl } from './lib'

/** Manual champion pick: test mode, and a way to look something up outside of champ select. */
export function ChampionSearch({ data, onPick }: { data: Dataset; onPick: (id: number) => void }) {
  const [query, setQuery] = useState('')

  const champions = useMemo(
    () =>
      Object.entries(data.static.champions)
        .map(([id, champion]) => ({ id: Number(id), ...champion }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  )
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? champions.filter((champion) => champion.name.toLowerCase().includes(needle)).slice(0, 6)
    : []

  return (
    <div className="w-full max-w-64">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && matches[0]) onPick(matches[0].id)
        }}
        placeholder="Champion manuell wählen"
        className="h-9 w-full rounded-md border border-line bg-panel px-3 text-sm outline-none placeholder:text-dim focus:border-dim"
      />
      <div className="mt-1 text-left">
        {matches.map((champion) => (
          <button
            key={champion.id}
            onClick={() => onPick(champion.id)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-panel"
          >
            <img src={championIconUrl(data.static.patch, champion.key)} alt="" className="size-6 rounded-sm" />
            {champion.name}
          </button>
        ))}
      </div>
    </div>
  )
}
