import { X } from 'lucide-react'
import type { ChampionInfo, ChampionProfile, Role } from '../../shared/types'
import { ROLE_LABELS, count, percent, splashUrl } from './lib'
import { OpggCredit } from './OpggCredit'
import { Figure } from './ui'
import { t } from '../../shared/i18n'

export const TABS = [
  ['decision', t('Entscheidung')],
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

      <div className="relative flex items-end justify-between gap-6 px-6 pt-5 pb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="display text-3xl leading-none font-semibold">{champion.name}</h1>
            {opponentName && <span className="display text-lg text-mute">{t('gegen ')}{opponentName}</span>}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            {roles.map((option) => (
              <button
                key={option}
                onClick={() => onRole(option)}
                className={`rounded-full px-3 py-0.5 text-xs transition-colors ${
                  option === role ? 'bg-bone text-ink' : 'text-mute hover:text-bone'
                }`}
              >
                {ROLE_LABELS[option]}
              </button>
            ))}
            {note && <span className="ml-2 text-xs text-mute">{note}</span>}
            {onClose && (
              <button
                onClick={onClose}
                className="ml-2 flex items-center gap-1 text-xs text-mute transition-colors hover:text-bone"
              >
                <X size={12} />
                {t('Schließen')}
              </button>
            )}
          </div>
        </div>

        {stats && stats.games > 0 && (
          <div className="flex gap-8 rounded-card border border-line bg-ink/75 px-5 py-3 backdrop-blur-sm">
            <Figure label={t("Winrate")} value={percent(stats.winRate)} hint={t`${count(stats.games)} Spiele in dieser Rolle`} />
            <Figure label={t("Pickrate")} value={percent(stats.pickRate)} />
            <Figure label={t("Banrate")} value={percent(stats.banRate)} />
            <Figure
              label={stats.rank ? t`Tier · Rang ${stats.rank}` : 'Tier'}
              value={stats.tier === null ? '–' : stats.tier === 0 ? 'OP' : stats.tier}
              hint={t("OP.GG-Einstufung in dieser Rolle: 1 = stark, 5 = schwach")}
            />
          </div>
        )}
      </div>

      {/* Every view of the dashboard shows OP.GG data, so the credit sits in the header that stays on all of them. */}
      <div className="relative flex items-end justify-between gap-4 pr-6 pl-4">
      <nav className="flex gap-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => onTab(id)}
            className={`rounded-t-md border-b-2 px-3 py-2 font-medium transition-colors ${
              tab === id ? 'border-gold text-bone' : 'border-transparent text-mute hover:border-line hover:text-bone'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="pb-1.5">
        <OpggCredit />
      </div>
      </div>
    </header>
  )
}
