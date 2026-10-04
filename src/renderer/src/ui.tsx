import type { ReactNode } from 'react'
import { interval, verdict, winRate } from '../../shared/analysis'
import type { Stat, StaticData } from '../../shared/types'
import { championIconUrl, count, itemIconUrl, percent, perkIconUrl } from './lib'

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
  if (stat.games === 0) return <span className="text-mute">keine Spiele</span>
  const rate = winRate(stat)
  const range = interval(stat.wins, stat.games)
  const side = verdict(stat.wins, stat.games)
  const colour = side === 'above' ? 'bg-up' : side === 'below' ? 'bg-down' : 'bg-mute'
  const text = side === 'above' ? 'text-up' : side === 'below' ? 'text-down' : 'text-bone'

  return (
    <span
      className="inline-flex items-center gap-2"
      title={`${count(stat.games)} Spiele · 95-%-Bereich ${percent(range.low)} bis ${percent(range.high)}`}
    >
      <span className={`display w-[52px] text-right text-[15px] ${text}`}>{percent(rate)}</span>
      <span className={`relative h-3 ${compact ? 'w-16' : 'w-28'}`}>
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="absolute top-0 left-1/2 h-full w-px bg-mute/50" />
        <span
          className={`absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full opacity-45 ${colour}`}
          style={{ left: `${scale(range.low)}%`, width: `${Math.max(2, scale(range.high) - scale(range.low))}%` }}
        />
        <span
          className={`absolute top-1/2 size-[7px] -translate-1/2 rounded-full ${colour}`}
          style={{ left: `${scale(rate)}%` }}
        />
      </span>
    </span>
  )
}

/** Share of games as a thin bar with the figure. */
export function PickBar({ stat }: { stat: Stat }) {
  return (
    <span className="inline-flex items-center gap-2" title={`${count(stat.games)} Spiele`}>
      <span className="relative h-1 w-14 rounded-full bg-line">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-bone/70"
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
      <div className="display text-[22px] leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-mute">{label}</div>
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
      className="rounded-sm"
      style={{ width: size, height: size }}
    />
  )
  return onOpen ? (
    <button
      onClick={() => onOpen({ kind: 'item', id })}
      title={data.items[id]?.name}
      className="shrink-0 rounded-sm ring-line hover:ring-2"
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
  const image = (
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
      className="shrink-0 rounded-full ring-line hover:ring-2"
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
    <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="display text-[15px] text-bone">{title}</h2>}
          {aside && <div className="text-[11px] text-mute">{aside}</div>}
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
    <details open={open} className="group text-[12px]">
      <summary className={`cursor-pointer list-none hover:underline ${quiet ? 'text-mute' : 'text-gold'}`}>
        Warum?<span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ul className="mt-1.5 space-y-1 text-bone/85 select-text">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span className={`mt-[7px] size-1 shrink-0 rounded-full ${quiet ? 'bg-mute' : 'bg-gold'}`} />
            {reason}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function Notice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-mute">
      {children}
      {onRetry && (
        <button onClick={onRetry} className="ml-2 text-bone underline underline-offset-2">
          Erneut laden
        </button>
      )}
    </div>
  )
}

/** Placeholder in the shape of the decision view while statistics load. */
export function Skeleton({ label }: { label: string }) {
  const block = (className: string) => <div className={`loading rounded-xl bg-surface ${className}`} />
  return (
    <div>
      <p className="mb-3 text-[12px] text-mute">{label}</p>
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-4">
          {block('h-64')}
          {block('h-44')}
        </div>
        <div className="space-y-4">
          {block('h-28')}
          {block('h-56')}
        </div>
      </div>
    </div>
  )
}

/** The GLYPH mark: a win-rate range, the 50 % tick and the measured point. */
export function Mark({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect x="4" y="4" width="504" height="504" rx="116" fill="#0d1218" stroke="#1c2730" strokeWidth="8" />
      <line x1="96" y1="256" x2="416" y2="256" stroke="#2c3a46" strokeWidth="14" strokeLinecap="round" />
      <line x1="256" y1="150" x2="256" y2="362" stroke="#82909d" strokeWidth="14" strokeLinecap="round" />
      <rect x="236" y="226" width="150" height="60" rx="30" fill="#d6ad62" opacity="0.38" />
      <circle cx="316" cy="256" r="46" fill="#d6ad62" />
    </svg>
  )
}
