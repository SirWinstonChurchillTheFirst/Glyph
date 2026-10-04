import type { ReactNode } from 'react'
import { interval, verdict, winRate } from '../../shared/analysis'
import type { Stat, StaticData } from '../../shared/types'
import { championIconUrl, count, itemIconUrl, percent, perkIconUrl } from './lib'
import { t } from '../../shared/i18n'

/** What the detail drawer can show. */
export type Detail = { kind: 'item'; id: number } | { kind: 'rune'; id: number }

const SCALE_MIN = 0.4
const SCALE_MAX = 0.6
const scale = (value: number): number =>
  Math.min(1, Math.max(0, (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN))) * 100

/**
 * GLYPH's signature: a win rate drawn together with its 95 % range. The band is wide for small
 * samples and narrow for large ones; it is coloured only when it lies clear of 50 %.
 */
export function WinBar({ stat, compact }: { stat: { games: number; wins: number }; compact?: boolean }) {
  if (stat.games === 0) return <span className="text-mute">{t('keine Spiele')}</span>
  const rate = winRate(stat)
  const range = interval(stat.wins, stat.games)
  const side = verdict(stat.wins, stat.games)
  const colour = side === 'above' ? 'bg-up' : side === 'below' ? 'bg-down' : 'bg-mute'
  const text = side === 'above' ? 'text-up' : side === 'below' ? 'text-down' : 'text-bone'

  return (
    <span
      className="inline-flex items-center gap-2"
      title={t`${count(stat.games)} Spiele · 95-%-Bereich ${percent(range.low)} bis ${percent(range.high)}`}
    >
      <span className={`display w-[54px] text-right text-base ${text}`}>{percent(rate)}</span>
      <span className={`relative h-4 ${compact ? 'w-20' : 'w-36'}`}>
        {/* Track from 40 % to 60 %, with the 50 % mark. */}
        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
        <span className="absolute top-0 left-1/2 h-full w-[2px] -translate-x-1/2 rounded-full bg-mute" />
        <span
          className={`absolute top-1/2 h-[9px] -translate-y-1/2 rounded-full opacity-50 ${colour}`}
          style={{ left: `${scale(range.low)}%`, width: `${Math.max(4, scale(range.high) - scale(range.low))}%` }}
        />
        <span
          className={`absolute top-1/2 size-[11px] -translate-1/2 rounded-full ring-2 ring-surface ${colour}`}
          style={{ left: `${scale(rate)}%` }}
        />
      </span>
    </span>
  )
}

/** Share of games as a thin bar with the figure. */
export function PickBar({ stat }: { stat: Stat }) {
  return (
    <span className="inline-flex items-center gap-2" title={t`${count(stat.games)} Spiele`}>
      <span className="relative h-1.5 w-14 rounded-full bg-line">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-bone/80"
          style={{ width: `${Math.min(100, stat.pickRate * 100)}%` }}
        />
      </span>
      <span className="display w-11 text-mute">{percent(stat.pickRate, 0)}</span>
    </span>
  )
}

export function Figure({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <div className="display text-xl leading-none font-semibold">{value}</div>
      <div className="mt-1.5 text-xs text-mute">{label}</div>
    </div>
  )
}

export function ChampionIcon({ id, data, size = 28 }: { id: number | null; data: StaticData; size?: number }) {
  const champion = id === null ? undefined : data.champions[id]
  return champion ? (
    <img
      src={championIconUrl(data.patch, champion.key)}
      alt=""
      className="shrink-0 rounded-sm"
      style={{ width: size, height: size }}
    />
  ) : (
    <span className="shrink-0 rounded-sm border border-dashed border-line" style={{ width: size, height: size }} />
  )
}

export function ItemIcon({
  id,
  data,
  size = 32,
  onOpen
}: {
  id: number
  data: StaticData
  size?: number
  onOpen?: (detail: Detail) => void
}) {
  const image = (
    <img
      src={itemIconUrl(data.patch, id)}
      alt={data.items[id]?.name ?? ''}
      className="rounded-md"
      style={{ width: size, height: size }}
    />
  )
  return onOpen ? (
    <button
      onClick={() => onOpen({ kind: 'item', id })}
      title={data.items[id]?.name}
      className="shrink-0 rounded-md ring-mute transition-shadow hover:ring-2"
    >
      {image}
    </button>
  ) : (
    image
  )
}

export function RuneIcon({
  id,
  data,
  size = 28,
  dim,
  onOpen
}: {
  id: number
  data: StaticData
  size?: number
  dim?: boolean
  onOpen?: (detail: Detail) => void
}) {
  const icon = data.runes[id]?.icon ?? data.shards[id]?.icon
  const name = data.runes[id]?.name ?? data.shards[id]?.name ?? String(id)
  // Shard art is a small flat pictogram; a round seat makes it sit with the rune medallions.
  const isShard = !data.runes[id]
  const image = isShard ? (
    <span
      className={`flex items-center justify-center rounded-full border border-line bg-raised ${dim ? 'opacity-30' : ''}`}
      style={{ width: size, height: size }}
    >
      <img src={icon ? perkIconUrl(icon) : undefined} alt={name} style={{ width: size * 0.62, height: size * 0.62 }} />
    </span>
  ) : (
    <img
      src={icon ? perkIconUrl(icon) : undefined}
      alt={name}
      className={dim ? 'opacity-25 grayscale' : ''}
      style={{ width: size, height: size }}
    />
  )
  return onOpen && data.runes[id] ? (
    <button
      onClick={() => onOpen({ kind: 'rune', id })}
      title={name}
      className="shrink-0 rounded-full ring-mute transition-shadow hover:ring-2"
    >
      {image}
    </button>
  ) : (
    <span title={name} className="shrink-0">
      {image}
    </span>
  )
}

export function Panel({
  title,
  aside,
  children,
  className = ''
}: {
  title?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          {title && <h2 className="display text-base font-semibold text-bone">{title}</h2>}
          {aside && <div className="text-xs text-mute">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** The reasons behind a pick. Always visible for the main pick, collapsible elsewhere. */
export function Why({ reasons, open, quiet }: { reasons: string[]; open?: boolean; quiet?: boolean }) {
  if (reasons.length === 0) return null
  return (
    <details open={open} className="group text-sm">
      <summary className={`cursor-pointer list-none text-xs font-medium hover:underline ${quiet ? 'text-mute' : 'text-gold'}`}>
        {t('Warum?')}<span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ul className="mt-2 space-y-1.5 text-bone select-text">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span className={`mt-[8px] size-1 shrink-0 rounded-full ${quiet ? 'bg-mute' : 'bg-gold'}`} />
            {reason}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function Notice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="rounded-card border border-dashed border-line px-4 py-6 text-center text-mute">
      {children}
      {onRetry && (
        <button onClick={onRetry} className="link ml-2">
          {t('Erneut laden')}
        </button>
      )}
    </div>
  )
}

/** Placeholder in the shape of the decision view while statistics load. */
export function Skeleton({ label }: { label: string }) {
  const block = (className: string) => <div className={`loading rounded-card bg-surface ${className}`} />
  return (
    <div>
      <p className="mb-3 text-xs text-mute">{label}</p>
      <div className="grid grid-cols-12 gap-4">
        {block('col-span-7 h-80')}
        {block('col-span-5 h-80')}
        {block('col-span-12 h-44')}
      </div>
    </div>
  )
}

/** The GLYPH mark: a sigil, the route of a rune page drawn as one line. */
export function Mark({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect x="4" y="4" width="504" height="504" rx="116" fill="#1d1a29" stroke="#383250" strokeWidth="8" />
      <path d="M168 150 L236 330 L344 168 L300 372" fill="none" stroke="#e0b866" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="168" cy="150" r="40" fill="#1d1a29" stroke="#e0b866" strokeWidth="24"/>
      <circle cx="300" cy="372" r="26" fill="#e0b866"/>
      <circle cx="392" cy="300" r="11" fill="#aaa5c0" opacity="0.6"/>
      <circle cx="120" cy="330" r="11" fill="#aaa5c0" opacity="0.6"/>
      <circle cx="392" cy="372" r="11" fill="#aaa5c0" opacity="0.6"/>
    </svg>
  )
}

/** One checkbox for the whole app; the box sits on the first line of its label. */
export function Checkbox({
  checked,
  onChange,
  children,
  title
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  title?: string
}) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="check-box">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M1.5 5.2 4 7.6 8.5 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  )
}

/** A choice of one among a few, shown as one joined control. */
export function Segment<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <span role="radiogroup" aria-label={label} className="segment">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}
