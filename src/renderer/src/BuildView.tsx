import type { ReactNode } from 'react'
import type { Dataset, Role, RoleBuild } from '../../shared/types'
import { ImportButton } from './ImportButton'
import { ROLE_LABELS, buildPath, itemIconUrl, perkIconUrl, runesAsText, splashUrl } from './lib'

interface Props {
  data: Dataset
  championId: number
  /** Role from champ select, or the one the user picked. Falls back to the most played role. */
  role: Role | null
  onRole: (role: Role) => void
  /** e.g. "ARAM", when the statistics do not match the current game mode. */
  modeNote?: string
  connected: boolean
  /** Shown only for a manually chosen champion. */
  onClose?: () => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-dim uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Row({ icon, label, large }: { icon: string; label: string; large?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={icon} alt="" className={large ? 'size-9' : 'size-6'} />
      <span className={large ? 'font-semibold' : 'text-[13px]'}>{label}</span>
    </div>
  )
}

export function BuildView({ data, championId, role, onRole, modeNote, connected, onClose }: Props) {
  const champion = data.static.champions[championId]
  const entry = data.builds.champions[championId]
  const name = champion?.name ?? `Champion ${championId}`

  const activeRole = entry && (role && entry.roles[role] ? role : entry.defaultRole)
  const build: RoleBuild | undefined = activeRole && entry.roles[activeRole]
  const roles = entry ? (Object.keys(entry.roles) as Role[]) : []

  const header = (
    <header className="relative h-48 shrink-0 overflow-hidden">
      {champion && (
        <img
          src={splashUrl(champion.key)}
          alt=""
          className="absolute inset-0 size-full object-cover object-[50%_20%]"
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/60 to-transparent" />
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-4 rounded bg-bg/70 px-2 py-1 text-xs text-dim hover:text-text"
        >
          Schließen
        </button>
      )}
      <div className="absolute inset-x-5 bottom-4">
        <h1 className="text-4xl leading-none font-semibold tracking-wide uppercase">{name}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm">
          {roles.map((option) => (
            <button
              key={option}
              onClick={() => onRole(option)}
              className={
                option === activeRole
                  ? 'font-semibold tracking-widest text-accent uppercase'
                  : 'tracking-widest text-dim uppercase hover:text-text'
              }
            >
              {ROLE_LABELS[option]}
            </button>
          ))}
          {modeNote && <span className="text-xs text-dim">· {modeNote}</span>}
        </div>
      </div>
    </header>
  )

  if (!build || !activeRole) {
    return (
      <>
        {header}
        <p className="px-5 py-6 text-dim">Für {name} liegen noch keine Build-Daten vor.</p>
      </>
    )
  }

  const { styles, runes, shards, items, patch } = data.static
  const { perks } = build.runes
  const rune = (id: number, large?: boolean): ReactNode => (
    <Row key={id} icon={perkIconUrl(runes[id]?.icon ?? '')} label={runes[id]?.name ?? `#${id}`} large={large} />
  )
  const style = (id: number): ReactNode => (
    <div className="mb-1 text-xs font-semibold tracking-wider text-accent uppercase">
      {styles[id]?.name ?? id}
    </div>
  )
  const item = (id: number, prefix: string, count = 1): ReactNode => (
    <div key={`${prefix}-${id}`} className="flex items-center gap-3">
      <span className="w-10 text-xs text-dim">{prefix}</span>
      <img src={itemIconUrl(patch, id)} alt="" className="size-7 rounded-sm" />
      <span className="text-[13px]">
        {items[id]?.name ?? `Item ${id}`}
        {count > 1 && <span className="text-dim"> ×{count}</span>}
      </span>
    </div>
  )

  const path = buildPath(build, data)
  const startItems = [...new Set(build.startItems)]
  const title = `${name} ${ROLE_LABELS[activeRole]}`

  return (
    <>
      {header}

      <Section title="Runen">
        <div className="mb-4 grid grid-cols-2 gap-x-4">
          <div className="space-y-2">
            {style(build.runes.primaryStyle)}
            {rune(perks[0], true)}
            {perks.slice(1, 4).map((id) => rune(id))}
          </div>
          <div className="space-y-2">
            {style(build.runes.subStyle)}
            {perks.slice(4).map((id) => rune(id))}
            <div className="pt-2 text-xs font-semibold tracking-wider text-dim uppercase">Shards</div>
            {build.runes.shards.map((id, index) => (
              <Row key={index} icon={perkIconUrl(shards[id]?.icon ?? '')} label={shards[id]?.name ?? `#${id}`} />
            ))}
          </div>
        </div>
        <ImportButton
          // Resets the button whenever another page is shown.
          key={`${championId}-${activeRole}`}
          pageName={`Glyph · ${title}`}
          runes={build.runes}
          text={runesAsText(title, build, data)}
          connected={connected}
        />
      </Section>

      <Section title="Build">
        <div className="space-y-2">
          {startItems.map((id) =>
            item(id, 'Start', build.startItems.filter((other) => other === id).length)
          )}
          {path.core.map((id, index) => item(id, `${index + 1}.`))}
          {path.boots !== null && item(path.boots, 'Boots')}
        </div>
      </Section>

      <Section title="Skill Order">
        <div className="flex gap-[3px]">
          {build.skillOrder.map((skill, index) => (
            <div key={index} className="flex-1 text-center">
              <div
                className={`rounded-sm py-1 text-xs font-semibold ${
                  skill === 'R' ? 'bg-accent text-bg' : 'bg-panel'
                }`}
              >
                {skill}
              </div>
              <div className="mt-1 text-[9px] text-dim">{index + 1}</div>
            </div>
          ))}
        </div>
        {build.skillPriority && (
          <p className="mt-2 text-xs text-dim">Max: {build.skillPriority.split('').join(' → ')}</p>
        )}
      </Section>

      <p className="px-5 pb-4 text-[11px] text-dim">
        {Math.round(build.winRate * 1000) / 10} % Winrate · {build.games.toLocaleString('de-DE')} Spiele
      </p>
    </>
  )
}
