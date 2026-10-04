import { X } from 'lucide-react'
import type { ChampionInfo, ChampionProfile, Role } from '../../shared/types'
import { ROLE_LABELS, count, percent, splashUrl } from './lib'
import { Figure } from './ui'

export const TABS = [
  ['decision', 'Entscheidung'],
  ['builds', 'Builds'],
  ['items', 'Items'],
  ['matchups', 'Matchups']
] as const
export type Tab = (typeof TABS)[number][0]

interface Props {
  champion: ChampionInfo
  opponentName?: string
  roles: Role[]
  role: Role
  onRole: (role: Role) => void
  stats: ChampionProfile | null
  /** e.g. "ARAM: Daten aus Ranked Solo" */
  note?: string
  /** Only for a manually opened champion. */
  onClose?: () => void
  tab: Tab
  onTab: (tab: Tab) => void
}

/** Who is being analysed, in which role, against whom, and how the champion is doing overall. */
export function ChampionHeader({ champion, opponentName, roles, role, onRole, stats, note, onClose, tab, onTab }: Props) {
  return (
    <header className="relative shrink-0 overflow-hidden border-b border-line">
      <img
        src={splashUrl(champion.key)}
        alt=""
        className="absolute inset-y-0 right-0 h-full w-2/3 object-cover object-[50%_18%] opacity-60"
      />
      <div className="absolute inset-0 bg-linear-to-r from-ink via-ink/85 to-ink/10" />

      <div className="relative flex items-end justify-between gap-6 px-6 pt-4 pb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="display text-[38px] leading-none">{champion.name}</h1>
            {opponentName && <span className="display text-[18px] text-mute">gegen {opponentName}</span>}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            {roles.map((option) => (
              <button
                key={option}
                onClick={() => onRole(option)}
                className={`rounded-full px-3 py-0.5 text-[12px] transition-colors ${
                  option === role ? 'bg-bone text-ink' : 'text-mute hover:text-bone'
                }`}
              >
                {ROLE_LABELS[option]}
              </button>
            ))}
            {note && <span className="ml-2 text-[11px] text-mute">{note}</span>}
            {onClose && (
              <button
                onClick={onClose}
                className="ml-2 flex items-center gap-1 text-[11px] text-mute transition-colors hover:text-bone"
              >
                <X size={12} />
                Schließen
              </button>
            )}
          </div>
        </div>

        {stats && stats.games > 0 && (
          <div className="flex gap-7 rounded-lg border border-white/5 bg-ink/70 px-4 py-2.5 backdrop-blur-sm">
            <Figure label="Winrate" value={percent(stats.winRate)} hint={`${count(stats.games)} Spiele in dieser Rolle`} />
            <Figure label="Pickrate" value={percent(stats.pickRate)} />
            <Figure label="Banrate" value={percent(stats.banRate)} />
            <Figure
              label={stats.rank ? `Tier · Rang ${stats.rank}` : 'Tier'}
              value={stats.tier === null ? '–' : stats.tier === 0 ? 'OP' : stats.tier}
              hint="OP.GG-Einstufung in dieser Rolle: 1 = stark, 5 = schwach"
            />
          </div>
        )}
      </div>

      <nav className="relative flex gap-1 px-5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => onTab(id)}
            className={`border-b-2 px-3 py-1.5 transition-colors ${
              tab === id ? 'border-gold text-bone' : 'border-transparent text-mute hover:text-bone'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  )
}
