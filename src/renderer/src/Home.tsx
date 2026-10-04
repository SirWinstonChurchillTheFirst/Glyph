import { Gamepad2, Loader2, Search, Swords, Wand2, Package } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LeagueStatus, StaticData } from '../../shared/types'
import { ChampionIcon, Mark } from './ui'

interface Props {
  status: LeagueStatus
  data: StaticData
  /** Champions opened before, newest first. */
  recent: number[]
  launch: { busy: boolean; message?: string }
  onLaunch: () => void
  onSearch: () => void
  onChampion: (id: number) => void
}

const FEATURES: [icon: ReactNode, title: string, text: string][] = [
  [<Wand2 size={15} />, 'Runen', 'Empfohlene Seite mit einem Klick im Client'],
  [<Package size={15} />, 'Items', 'Kaufpfad, angepasst an das gegnerische Team'],
  [<Swords size={15} />, 'Matchup', 'Winrate und Einschätzung für deine Lane']
]

function SearchLink({ onSearch }: { onSearch: () => void }) {
  return (
    <button
      onClick={onSearch}
      className="card flex h-10 items-center gap-2 px-4 text-mute hover:text-bone"
    >
      <Search size={14} />
      Champion oder Matchup öffnen
    </button>
  )
}

/** What the app shows while no champion is open. One calm card per state, never an error screen. */
export function Home({ status, data, recent, launch, onLaunch, onSearch, onChampion }: Props) {
  let title: string
  let text: string
  let actions: ReactNode

  if (status === 'idle') {
    title = 'Bereit für dein nächstes Spiel'
    text = 'League ist verbunden. Sobald ein Champion Select beginnt, erscheint die Analyse von selbst.'
    actions = <SearchLink onSearch={onSearch} />
  } else if (status === 'champ-select') {
    title = 'Champion Select läuft'
    text = 'Wähle einen Champion – Runen, Items und Matchup erscheinen sofort.'
    actions = null
  } else if (status === 'starting') {
    title = 'League startet'
    text = 'Glyph verbindet sich, sobald der Client bereit ist.'
    actions = (
      <span className="flex h-10 items-center gap-2 text-mute">
        <Loader2 size={15} className="spin" />
        Verbinde …
      </span>
    )
  } else if (status === 'unreachable') {
    title = 'Der Client antwortet nicht'
    text = 'League läuft, reagiert aber nicht. Glyph versucht es weiter – falls es so bleibt, starte den Client neu.'
    actions = <SearchLink onSearch={onSearch} />
  } else {
    title = 'Bereit?'
    text = 'League of Legends ist gerade nicht geöffnet.'
    actions = (
      <>
        <button onClick={onLaunch} disabled={launch.busy} className="primary h-10 px-5">
          {launch.busy ? <Loader2 size={15} className="spin" /> : <Gamepad2 size={16} />}
          {launch.busy ? 'League wird gestartet …' : 'League starten'}
        </button>
        <SearchLink onSearch={onSearch} />
      </>
    )
  }

  return (
    // A faint light from above keeps the page from reading as an empty window.
    <div className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,rgb(214_173_98/0.06),transparent)]">
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center gap-4 px-8 py-8">
        <section className="card flex flex-col items-center px-10 py-10 text-center">
          <Mark size={72} />
          <h1 className="display mt-5 text-[26px] leading-tight">{title}</h1>
          <p className="mt-2 max-w-[420px] text-mute">{text}</p>
          {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
          {launch.message && status === 'not-running' && <p className="mt-3 text-[12px] text-down">{launch.message}</p>}
        </section>

        <div className="grid grid-cols-3 gap-3">
          {FEATURES.map(([icon, name, description]) => (
            <div key={name} className="card px-4 py-3">
              <div className="flex items-center gap-2 text-bone">
                <span className="text-gold">{icon}</span>
                {name}
              </div>
              <p className="mt-1 text-[12px] text-mute">{description}</p>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="mr-1 text-[12px] text-mute">Zuletzt geöffnet</span>
            {recent.map((id) => (
              <button
                key={id}
                onClick={() => onChampion(id)}
                title={data.champions[id]?.name}
                className="rounded-md p-0.5 ring-line transition-shadow hover:ring-2"
              >
                <ChampionIcon id={id} data={data} size={32} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
