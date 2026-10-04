import { ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { interval, verdict, winRate, type TeamAnalysis } from '../../shared/analysis'
import type { Recommendation } from '../../shared/recommend'
import type { BuildSet, ChampionProfile, ItemSetStat, Role, StaticData } from '../../shared/types'
import { ImportButton } from './ImportButton'
import { ROLE_LABELS, count, pageName, percent, runesAsText } from './lib'
import { RuneLine, RuneTree, Sigil } from './RuneTree'
import { ChampionIcon, ItemIcon, Notice, Panel, PickBar, RuneIcon, Why, WinBar, type Detail } from './ui'
import { t } from '../../shared/i18n'

/** Everything a tab needs. Assembled once in App; tabs only present it. */
export interface View {
  data: StaticData
  championId: number
  role: Role
  profile: ChampionProfile | null
  builds: BuildSet
  recommendation: Recommendation
  opponentId: number | null
  connected: boolean
  /** Why runes cannot be imported right now, when it is not simply a missing connection. */
  importNote?: string
  /** Summoner spells can only be set while champ select is running. */
  canSpells: boolean
  onOpen: (detail: Detail) => void
  onOpponent: (id: number | null) => void
  /** Both teams' composition during champ select. */
  draft: { allies: TeamAnalysis; enemies: TeamAnalysis } | null
  /** The detailed set over several matchups is still loading; `builds` is the quick overall one. */
  loadingMore: boolean
  /** At least one "what are you facing" flag is set. */
  situationMarked: boolean
  selectedPage: string
  onPage: (key: string) => void
}

const MIN_GAMES = 30
const STRENGTH: Record<Recommendation['page']['strength'], string> = {
  clear: t('Klarer Favorit'),
  recommended: t('Empfohlen'),
  thin: t('Wenig Daten')
}
const LEVELS = { low: [t('niedrig'), 1], medium: [t('mittel'), 2], high: [t('hoch'), 3] } as const

function Level({ analysis, id }: { analysis: TeamAnalysis; id: string }) {
  const metric = analysis.metrics.find((entry) => entry.id === id)
  if (!metric) return <td className="text-mute">–</td>
  const [label, filled] = LEVELS[metric.level]
  return (
    <td className="py-1" title={metric.basis}>
      <span className="flex items-center gap-2">
        <span className="flex gap-0.5">
          {[1, 2, 3].map((step) => (
            <span key={step} className={`h-2.5 w-1.5 rounded-[1px] ${step <= filled ? 'bg-bone/80' : 'bg-line'}`} />
          ))}
        </span>
        <span className="text-xs text-mute">{label}</span>
      </span>
    </td>
  )
}

function Damage({ analysis }: { analysis: TeamAnalysis }) {
  return (
    <td className="py-1.5 pr-4" title={`AD: ${analysis.ad.join(', ') || '–'} · AP: ${analysis.ap.join(', ') || '–'}`}>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-line">
        <span className="bg-down/80" style={{ flex: analysis.ad.length }} />
        <span className="bg-magic" style={{ flex: analysis.ap.length }} />
      </span>
      <span className="mt-1 block text-xs">
        {analysis.ad.length}{t(' AD · ')}{analysis.ap.length}{t(' AP')}
      </span>
    </td>
  )
}

/** Both teams side by side, one row per trait. */
function TeamCompare({ allies, enemies }: { allies: TeamAnalysis; enemies: TeamAnalysis }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-xs text-mute">
          <th className="font-normal" />
          <th className="pb-1 font-normal">{t('Gegner · ')}{enemies.known}{t(' erkannt')}</th>
          <th className="pb-1 font-normal">{t('Dein Team · ')}{allies.known}{t(' erkannt')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="pr-3">{t('Schaden')}</td>
          <Damage analysis={enemies} />
          <Damage analysis={allies} />
        </tr>
        {enemies.metrics.map((metric) => (
          <tr key={metric.id} className="border-t border-line">
            <td className="pr-3">{metric.label}</td>
            <Level analysis={enemies} id={metric.id} />
            <Level analysis={allies} id={metric.id} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const SIDE = { me: t('du'), opponent: t('Gegner'), even: t('ausgeglichen') }
const PLAY_STYLES: Record<string, string> = {
  even: t('ausgeglichen'),
  aggressive: t('aggressiv'),
  defensive: t('defensiv'),
  passive: t('defensiv')
}
const LENGTH_LABELS: Record<number, string> = { 0: t('bis 25'), 25: '25–30', 30: '30–35', 35: '35–40', 40: t('ab 40') }

const itemName = (id: number, data: StaticData): string => data.items[id]?.name ?? `Item ${id}`

function scopeText(view: View): string {
  const { builds, data, opponentId } = view
  if (opponentId !== null) return t`gegen ${data.champions[opponentId]?.name} · ${count(builds.sample)} Spiele`
  if (builds.quick) return t`Champion gesamt · ${count(builds.sample)} Spiele`
  const share = builds.coverage ? t` (${percent(builds.coverage, 0)} aller Spiele)` : ''
  return t`Summe der ${builds.opponentIds.length} häufigsten Matchups${share} · ${count(builds.sample)} Spiele`
}

/** Shown above the quick overall data while the detailed set loads. */
function MoreLoading({ what }: { what: string }) {
  return (
    <p className="loading rounded-control border border-line bg-surface px-3 py-2 text-xs text-mute">
      {what}{t(' werden aus den häufigsten Matchups geladen …')}
    </p>
  )
}

// ---------- Entscheidung ----------

/** The purchase path. Every item carries its name; clicking one opens the reasons for it. */
function ItemPath({ view }: { view: View }) {
  const { recommendation: rec, builds, data, onOpen } = view
  const choices = [...rec.path, ...(rec.boots ? [rec.boots] : [])]
  // Starts on the item the situation changed or confirmed, if there is one.
  const preset = choices.find((choice) => choice.adapted || choice.fits)?.pick.ids[0] ?? null
  const [picked, setPicked] = useState<number | null | undefined>(undefined)
  const openId = picked === undefined ? preset : picked
  const open = choices.find((choice) => choice.pick.ids[0] === openId)
  // Keeps the last reasons in place while the strip closes.
  const shown = useRef(open)
  if (open) shown.current = open

  const figure = 'display text-xs text-mute'
  const caption = 'line-clamp-2 min-h-[2.5em] text-center text-xs leading-tight'
  const arrow = <ChevronRight size={16} className="mt-[46px] shrink-0 text-mute" aria-hidden />

  const step = (label: string, choice: (typeof choices)[number]) => {
    const id = choice.pick.ids[0]
    const isOpen = id === openId
    return (
      <button
        onClick={() => setPicked(isOpen ? null : id)}
        aria-expanded={isOpen}
        className={`row flex w-[94px] flex-col items-center gap-1.5 px-1.5 py-2 ${isOpen ? 'bg-raised' : ''}`}
      >
        <span className="text-xs text-mute">{label}</span>
        <span className={`rounded-md ${choice.adapted ? 'ring-2 ring-gold ring-offset-2 ring-offset-surface' : ''}`}>
          <ItemIcon id={id} data={data} size={44} />
        </span>
        <span className={`${caption} ${choice.adapted ? 'text-gold' : ''}`}>{itemName(id, data)}</span>
        <span className={figure}>{percent(choice.pick.pickRate, 0)}</span>
      </button>
    )
  }

  return (
    <Panel
      className="col-span-12"
      title={t('Item-Pfad')}
      aside={builds.quick ? t('Anteil der Spiele mit diesem Item · Klick für Details') : t('Anteil der Spiele je Kauf-Slot · Klick für Details')}
    >
      <div className="flex flex-wrap items-start gap-x-1 gap-y-3">
        {rec.starter && (
          <div className="flex w-[112px] flex-col items-center gap-1.5 px-1.5 py-2">
            <span className="text-xs text-mute">Start</span>
            <span className="flex gap-1">
              {[...new Set(rec.starter.ids)].map((id) => (
                <ItemIcon key={id} id={id} data={data} size={44} onOpen={onOpen} />
              ))}
            </span>
            <span className={caption}>{[...new Set(rec.starter.ids)].map((id) => itemName(id, data)).join(' + ')}</span>
            <span className={figure}>{percent(rec.starter.pickRate, 0)}</span>
          </div>
        )}
        {rec.path.map((choice, index) => (
          <div key={choice.pick.ids[0]} className="flex items-start gap-1">
            {(index > 0 || rec.starter) && arrow}
            {step(t`${index + 1}. Item`, choice)}
          </div>
        ))}
        {rec.boots && (
          <div className="flex items-start gap-1">
            <span className="mx-2 mt-7 h-[68px] w-px bg-line" />
            {step(t('Stiefel'), rec.boots)}
          </div>
        )}
      </div>

      <div className="reveal" data-open={open !== undefined}>
        <div>
          {shown.current && (
            <div className="mt-3 flex items-start justify-between gap-6 rounded-control border border-line bg-ink/50 p-4">
              <ul className="space-y-1.5 select-text">
                {shown.current.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span className={`mt-[8px] size-1 shrink-0 rounded-full ${shown.current!.adapted ? 'bg-gold' : 'bg-mute'}`} />
                    {reason}
                  </li>
                ))}
              </ul>
              <button className="link shrink-0 text-xs" onClick={() => onOpen({ kind: 'item', id: shown.current!.pick.ids[0] })}>
                {t('Nutzung')}
                <ChevronRight size={13} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** Win rate per game-length bucket as bars from a visible 50 % baseline, each with its value. */
function GameLengthChart({ buckets }: { buckets: ChampionProfile['gameLengths'] }) {
  const HALF = 40
  const peak = Math.max(0.02, ...buckets.map((bucket) => Math.abs(bucket.winRate - 0.5)))
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="relative flex h-[128px] gap-3 pl-10">
        <span className="display absolute top-1/2 left-0 -translate-y-1/2 text-xs text-mute">{percent(0.5, 0)}</span>
        <span className="absolute top-1/2 right-0 left-10 h-px bg-mute" />
        {buckets.map((bucket) => {
          const up = bucket.winRate >= 0.5
          const height = Math.max(3, (Math.abs(bucket.winRate - 0.5) / peak) * HALF)
          return (
            <div key={bucket.from} className="relative flex-1">
              <span
                className={`absolute left-1/2 w-[58%] -translate-x-1/2 ${up ? 'bottom-1/2 rounded-t-[3px] bg-up' : 'top-1/2 rounded-b-[3px] bg-down'}`}
                style={{ height }}
              />
              <span
                className={`display absolute left-1/2 -translate-x-1/2 text-xs ${up ? 'text-up' : 'text-down'}`}
                style={up ? { bottom: `calc(50% + ${height + 4}px)` } : { top: `calc(50% + ${height + 4}px)` }}
              >
                {percent(bucket.winRate)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 pl-10">
        {buckets.map((bucket) => (
          <span key={bucket.from} className="flex-1 text-center text-xs text-mute">
            {LENGTH_LABELS[bucket.from] ?? bucket.from}
          </span>
        ))}
      </div>
    </div>
  )
}

export function DecisionView(view: View) {
  const { data, recommendation: rec, builds, profile, opponentId, championId, role, onOpen } = view
  const { page } = rec
  const champion = data.champions[championId]
  const title = `${champion?.name} ${ROLE_LABELS[role]}`
  const matchup = opponentId !== null ? profile?.matchups.find((entry) => entry.opponentId === opponentId) : undefined
  const opponent = opponentId !== null ? data.champions[opponentId] : undefined
  const fact = 'flex items-center justify-between gap-4'

  // With a full draft the right column carries the team comparison and would tower over the left
  // one, so the chart moves across. Either way the last card of each column takes up the slack.
  const chartLeft = Boolean(view.draft && view.draft.enemies.known > 0)
  const chart = profile && profile.gameLengths.length > 0 && (
    <Panel className="flex flex-1 flex-col" title={t('Winrate nach Spieldauer')} aside={t('Champion gesamt, Minuten')}>
      <GameLengthChart buckets={profile.gameLengths} />
    </Panel>
  )

  return (
    <div className="grid grid-cols-12 items-stretch gap-4">
      {/* The recommendation, with the build's sigil as its emblem. */}
      <div className="col-span-7 flex flex-col gap-4">
      <section className={`panel flex flex-col border-l-[3px] border-l-gold p-5 ${chartLeft && chart ? '' : 'flex-1'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-xs font-medium text-gold">{t('GLYPH empfiehlt')}</h2>
          <span className="text-xs text-mute">{scopeText(view)}</span>
        </div>

        <div className="mt-4 flex gap-5">
          <div className="flex size-[148px] shrink-0 items-center justify-center rounded-card border border-line bg-ink">
            <Sigil page={page.pick} variant={page.variant} data={data} size={132} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="display text-2xl leading-tight font-semibold">{pageName(page.pick, data)}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  page.strength === 'thin' ? 'bg-raised text-mute' : 'bg-gold/15 text-gold'
                }`}
              >
                {STRENGTH[page.strength]}
              </span>
              <WinBar stat={page.pick} />
            </div>
            <div className="mt-4">
              <RuneLine variant={page.variant} data={data} onOpen={onOpen} />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <ImportButton
            // Resets the button whenever another page is shown.
            key={`${championId}-${role}-${page.pick.key}`}
            request={{
              name: `Glyph · ${title}`,
              primaryStyle: page.pick.primaryStyle,
              subStyle: page.pick.subStyle,
              perks: page.variant.perks,
              shards: page.variant.shards
            }}
            text={runesAsText(title, page.pick, page.variant, data)}
            connected={view.connected}
            note={view.importNote}
            spells={rec.spells}
            canSpells={view.canSpells}
            data={data}
          />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <Why reasons={page.reasons} open />
        </div>
      </section>

      {rec.skill && (
        <Panel title={t('Skill-Reihenfolge')} aside={t`${percent(rec.skill.pickRate, 0)} der Spiele`}>
          <div className="flex flex-wrap gap-1">
            {rec.skill.order.map((skill, index) => (
              <div key={index} className="w-8 text-center">
                <div
                  className={`display rounded-md py-1.5 text-sm font-semibold ${
                    skill === 'R' ? 'bg-bone text-ink' : 'bg-raised'
                  }`}
                >
                  {skill}
                </div>
                <div className="mt-1 text-2xs text-mute">{index + 1}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {chartLeft && chart}
      </div>

      {/* The situation: stretches to the height of the recommendation, the chart takes the rest. */}
      <div className="col-span-5 flex flex-col gap-4">
        <Panel title={t('Was du in diesem Match änderst')}>
          {rec.changes.length > 0 ? (
            <ul className="space-y-1.5">
              {rec.changes.map((change) => (
                <li key={change} className="flex gap-2 text-gold">
                  <span className="mt-[8px] size-1 shrink-0 rounded-full bg-gold" />
                  {change}
                </li>
              ))}
            </ul>
          ) : rec.covered.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-mute">{t('Nichts – der Standardpfad deckt die Situation schon ab:')}</p>
              {rec.covered.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-mute">
              {view.situationMarked
                ? t('Nichts. Für die markierte Situation gibt es keine passende Alternative, die in mindestens 10 % der Spiele gekauft wird – der Standardpfad bleibt.')
                : t('Noch nichts: Es ist keine Situation markiert. Im Champion Select füllt GLYPH das aus dem Draft, sonst links von Hand.')}
            </p>
          )}
        </Panel>

        {view.draft && view.draft.enemies.known > 0 && (
          <Panel title={t('Team-Analyse')} aside={t("Maus über einen Wert zeigt die Grundlage")}>
            <TeamCompare allies={view.draft.allies} enemies={view.draft.enemies} />
          </Panel>
        )}

        {opponent ? (
          <Panel className={chartLeft ? 'flex-1' : ''} title={t`Lane gegen ${opponent.name}`} aside={t("Einschätzung von OP.GG")}>
            <div className="space-y-2.5">
              <div className={fact}>
                <span className="text-mute">{t('Deine Winrate')}</span>
                {matchup ? <WinBar stat={matchup} compact /> : <span className="text-mute">{t('nicht verfügbar')}</span>}
              </div>
              {builds.lane?.advantage && (
                <div className={fact}>
                  <span className="text-mute">{t('Vorteil in der Lane')}</span>
                  <span>{SIDE[builds.lane.advantage]}</span>
                </div>
              )}
              {builds.lane?.soloKill && (
                <div className={fact}>
                  <span className="text-mute">{t('Vorteil bei Solo-Kills')}</span>
                  <span>{SIDE[builds.lane.soloKill]}</span>
                </div>
              )}
              {builds.lane?.playStyle && (
                <div className={fact}>
                  <span className="text-mute">{t('Empfohlene Spielweise')}</span>
                  <span>{PLAY_STYLES[builds.lane.playStyle.toLowerCase()] ?? builds.lane.playStyle}</span>
                </div>
              )}
              {builds.lane?.tip && (
                <p className="border-t border-line pt-3 text-bone select-text">{builds.lane.tip}</p>
              )}
            </div>
          </Panel>
        ) : (
          <Panel className={chartLeft ? 'flex-1' : ''} title={t('Kein Lane-Gegner gewählt')}>
            <p className="text-mute">
              {builds.quick
                ? t('Das ist der meistgespielte Build des Champions über alle Gegner.')
                : t('Die Empfehlung summiert die häufigsten Matchups.')}{' '}
              {t('Wähle unter „Matchups“ oder über die Suche einen Gegner, um Runen und Items genau für diese Lane zu sehen.')}
            </p>
          </Panel>
        )}

        {!chartLeft && chart}
      </div>

      <ItemPath
        // Another build or situation starts with its own item opened.
        key={[...rec.path, ...(rec.boots ? [rec.boots] : [])].map((choice) => choice.pick.ids[0]).join('-')}
        view={view}
      />
    </div>
  )
}

// ---------- Builds ----------

export function BuildsView(view: View) {
  const { data, builds, profile, recommendation, opponentId, onOpen, selectedPage, onPage, championId, role } = view
  const [variantIndex, setVariantIndex] = useState(0)
  const page = builds.pages.find((entry) => entry.key === selectedPage) ?? recommendation.page.pick
  const variant = page.variants[variantIndex] ?? page.variants[0]
  const title = `${data.champions[championId]?.name} ${ROLE_LABELS[role]}`

  const ranked = [...builds.pages]
    .filter((entry) => entry.games >= MIN_GAMES)
    .sort((a, b) => interval(b.wins, b.games).low - interval(a.wins, a.games).low)
  const columns = builds.pages.slice(0, 4)

  return (
    <div className="space-y-4">
      {view.loadingMore && <MoreLoading what={t("Weitere Builds und der Vergleich je Gegner")} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {builds.pages.map((entry) => {
          const active = entry.key === page.key
          const recommended = entry.key === recommendation.page.pick.key
          return (
            <button
              key={entry.key}
              onClick={() => {
                onPage(entry.key)
                setVariantIndex(0)
              }}
              className={`rounded-card border p-4 text-left transition-colors [box-shadow:var(--shadow-card)] ${
                active ? 'border-gold bg-raised' : 'border-line bg-surface hover:border-mute'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <RuneIcon id={entry.keystone} data={data} size={34} />
                <div className="min-w-0">
                  <div className="display truncate text-base">{data.runes[entry.keystone]?.name}</div>
                  <div className="truncate text-xs text-mute">+ {data.styles[entry.subStyle]?.name}</div>
                </div>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {recommended && <span className="size-2 rounded-full bg-gold" title={t('Von GLYPH empfohlen')} />}
                  {entry.variants[0] && <Sigil page={entry} variant={entry.variants[0]} data={data} size={40} />}
                </span>
              </div>
              <div className="mt-3">
                <WinBar stat={entry} compact />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-mute">
                <span>{count(entry.games)}{t(' Spiele')}</span>
                <PickBar stat={entry} />
              </div>
            </button>
          )
        })}
      </div>

      {variant && (
        <Panel title={pageName(page, data)} aside={t`Prozent = Nutzung der Rune · ${scopeText(view)}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-6">
            <RuneTree page={page} variant={variant} usage={builds.runeUse} data={data} onOpen={onOpen} />
            <div>
              <div className="mb-2 text-xs text-mute">{t('Varianten dieser Seite')}</div>
              <div className="space-y-1">
                {page.variants.slice(0, 5).map((entry, index) => (
                  <button
                    key={index}
                    onClick={() => setVariantIndex(index)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 ${
                      entry === variant ? 'bg-raised' : 'hover:bg-raised/60'
                    }`}
                  >
                    <span className="flex gap-1">
                      {entry.perks.slice(1).map((id) => (
                        <RuneIcon key={id} id={id} data={data} size={18} />
                      ))}
                    </span>
                    <span className="display text-xs text-mute">
                      {percent(winRate(entry))} · {count(entry.games)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <ImportButton
                  key={`${page.key}-${variantIndex}`}
                  request={{
                    name: `Glyph · ${title}`,
                    primaryStyle: page.primaryStyle,
                    subStyle: page.subStyle,
                    perks: variant.perks,
                    shards: variant.shards
                  }}
                  text={runesAsText(title, page, variant, data)}
                  connected={view.connected}
                  note={view.importNote}
                  spells={recommendation.spells}
                  canSpells={view.canSpells}
                  data={data}
                />
              </div>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Panel title={t('Builds im Vergleich')} aside={t("Balken = 95-%-Bereich der Winrate")}>
          <table className="w-full">
            <tbody>
              {builds.pages.map((entry) => (
                <tr key={entry.key} className="border-t border-line first:border-0">
                  <td className="py-1.5 pr-2">{pageName(entry, data)}</td>
                  <td className="py-1.5">
                    <WinBar stat={entry} compact />
                  </td>
                  <td className="display py-1.5 text-right text-mute">{count(entry.games)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-mute">
            {t('Früh-, Mittel- und Spätspiel je Build liefert die Quelle nicht. Die Spieldauer-Kurve unter „Entscheidung“ gilt für den Champion insgesamt.')}
          </p>
        </Panel>

        {opponentId !== null ? (
          <Panel title={t`Rangfolge gegen ${data.champions[opponentId]?.name}`} aside={t`ab ${MIN_GAMES} Spielen`}>
            {ranked.length === 0 ? (
              <p className="text-mute">{t('Kein Build erreicht in diesem Matchup ')}{MIN_GAMES}{t(' Spiele.')}</p>
            ) : (
              <ol className="space-y-2">
                {ranked.map((entry, index) => (
                  <li key={entry.key} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="mr-2 text-mute">
                        {index === 0 ? t('Bester') : index === ranked.length - 1 && ranked.length > 1 ? t('Schwächster') : `${index + 1}.`}
                      </span>
                      {pageName(entry, data)}
                    </span>
                    <WinBar stat={entry} compact />
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-mute">
              {t('Sortiert nach dem unteren Rand des 95-%-Bereichs, damit kleine Stichproben nicht vorne landen.')}
            </p>
          </Panel>
        ) : (
          <Panel title={t('Build gegen Gegner')} aside={t`Winrate je Build · „–“ = unter ${MIN_GAMES} Spielen`}>
            {builds.perOpponent.length === 0 && <p className="text-mute">{t('Kommt mit den Matchup-Daten.')}</p>}
            <table className={builds.perOpponent.length === 0 ? 'hidden' : 'w-full'}>
              <thead>
                <tr className="text-xs text-mute">
                  <th />
                  {columns.map((column) => (
                    <th key={column.key} className="pb-1.5 font-normal" title={pageName(column, data)}>
                      <span className="inline-flex items-center gap-1">
                        <RuneIcon id={column.keystone} data={data} size={18} />
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/img/${data.styles[column.subStyle]?.icon}`}
                          alt=""
                          className="size-3.5 opacity-70"
                        />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {builds.perOpponent.map((row) => {
                  const cells = columns.map((column) => row.pages.find((entry) => entry.key === column.key))
                  const best = cells
                    .filter((cell) => cell && cell.games >= MIN_GAMES)
                    .sort((a, b) => interval(b!.wins, b!.games).low - interval(a!.wins, a!.games).low)[0]
                  return (
                    <tr key={row.opponentId} className="border-t border-line">
                      <td className="py-1">
                        <button onClick={() => view.onOpponent(row.opponentId)} className="flex items-center gap-2 hover:underline">
                          <ChampionIcon id={row.opponentId} data={data} size={20} />
                          {data.champions[row.opponentId]?.name}
                        </button>
                      </td>
                      {cells.map((cell, index) => {
                        const enough = cell && cell.games >= MIN_GAMES
                        const side = enough ? verdict(cell.wins, cell.games) : 'open'
                        return (
                          <td
                            key={index}
                            className={`display py-1 text-center ${
                              !enough ? 'text-mute/50' : side === 'above' ? 'text-up' : side === 'below' ? 'text-down' : ''
                            }`}
                            title={cell ? t`${count(cell.games)} Spiele` : t('keine Spiele')}
                          >
                            {enough ? percent(winRate(cell)) : '–'}
                            {cell && cell === best && <span className="ml-1 inline-block size-1.5 rounded-full bg-gold align-middle" />}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-mute">{t('Goldener Punkt: bester Build gegen diesen Gegner. Klick auf den Gegner öffnet das Matchup.')}</p>
          </Panel>
        )}
      </div>

      {profile && profile.archetypes.length > 0 && (
        <Panel title={t('Build-Stile laut OP.GG')} aside={t("Champion gesamt · ohne Item-Listen je Stil")}>
          <div className="grid grid-cols-3 gap-x-8 gap-y-2">
            {profile.archetypes.map((style) => (
              <div key={style.name} className="flex items-center justify-between gap-3">
                <span>
                  {style.name.charAt(0) + style.name.slice(1).toLowerCase()}
                  <span className="ml-2 text-mute">{percent(style.share, 0)}</span>
                </span>
                <WinBar stat={style} compact />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

// ---------- Items ----------

export function ItemsView(view: View) {
  const { data, builds, recommendation, onOpen } = view
  const option = (entry: ItemSetStat, picked?: number) => (
    <div key={entry.ids.join('-')} className="flex items-center gap-2.5 py-1">
      <span className="flex gap-1">
        {[...new Set(entry.ids)].map((id) => (
          <ItemIcon key={id} id={id} data={data} size={28} onOpen={onOpen} />
        ))}
      </span>
      <span className={`min-w-0 flex-1 truncate ${entry.ids.length === 1 && entry.ids[0] === picked ? 'text-gold' : ''}`}>
        {entry.ids.length === 1
          ? itemName(entry.ids[0], data)
          : [...new Set(entry.ids)]
              .map((id) => `${itemName(id, data)}${entry.ids.filter((other) => other === id).length > 1 ? ' ×2' : ''}`)
              .join(' + ')}
      </span>
      <PickBar stat={entry} />
      <WinBar stat={entry} compact />
    </div>
  )

  return (
    <div className="space-y-4">
      {view.loadingMore && <MoreLoading what={t("Die Optionen je Kauf-Slot")} />}
      <p className="text-xs text-mute">
        {scopeText(view)}{t(' · Gold = im empfohlenen Pfad · Spätere Slots zeigen von Natur aus höhere Winrates, weil nur längere, oft gewonnene Spiele sie erreichen – vergleiche deshalb innerhalb eines Slots. Die durchschnittliche Kaufzeit liefert die Quelle nicht.')}
      </p>
      <div className="grid grid-cols-2 gap-4">
        {builds.slots.slice(0, 4).map((slot, index) => (
          <Panel key={index} title={t`${index + 1}. Item`} aside={t("Anteil · Winrate")}>
            {slot.slice(0, 6).map((entry) => option(entry, recommendation.path[index]?.pick.ids[0]))}
          </Panel>
        ))}
        <Panel title={t('Stiefel')} aside={t("Anteil · Winrate")}>
          {builds.boots.slice(0, 5).map((entry) => option(entry, recommendation.boots?.pick.ids[0]))}
        </Panel>
        <Panel title={t('Start-Items')} aside={t("Anteil · Winrate")}>
          {builds.starters.slice(0, 4).map((entry) => option(entry))}
        </Panel>
      </div>
      <Panel title={t('Häufigste Dreier-Kombinationen')} aside={t("in Kaufreihenfolge")}>
        <div className="grid grid-cols-2 gap-x-8">
          {builds.cores.slice(0, 8).map((entry) => (
            <div key={entry.ids.join('-')} className="flex items-center gap-3 py-1">
              <span className="flex items-center gap-1">
                {entry.ids.map((id, index) => (
                  <span key={index} className="flex items-center gap-1">
                    {index > 0 && <span className="text-mute/50">›</span>}
                    <ItemIcon id={id} data={data} size={28} onOpen={onOpen} />
                  </span>
                ))}
              </span>
              <span className="ml-auto">
                <PickBar stat={entry} />
              </span>
              <WinBar stat={entry} compact />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// ---------- Matchups ----------

export function MatchupsView(view: View) {
  const { data, profile, opponentId, onOpponent } = view
  const [order, setOrder] = useState<'games' | 'best' | 'worst'>('games')
  if (!profile || profile.matchups.length === 0) return <Notice>{t('Für diesen Champion liegen keine Matchup-Daten vor.')}</Notice>

  const solid = profile.matchups.filter((entry) => entry.games >= MIN_GAMES)
  const best = [...solid].sort((a, b) => interval(b.wins, b.games).low - interval(a.wins, a.games).low).slice(0, 5)
  const worst = [...solid].sort((a, b) => interval(a.wins, a.games).high - interval(b.wins, b.games).high).slice(0, 5)
  const all = [...profile.matchups].sort((a, b) =>
    order === 'games' ? b.games - a.games : order === 'best' ? winRate(b) - winRate(a) : winRate(a) - winRate(b)
  )

  const row = (entry: ChampionProfile['matchups'][number]) => (
    <button
      key={entry.opponentId}
      onClick={() => onOpponent(entry.opponentId)}
      className={`flex w-full items-center gap-2.5 rounded px-2 py-1 text-left hover:bg-raised ${
        entry.opponentId === opponentId ? 'bg-raised' : ''
      }`}
    >
      <ChampionIcon id={entry.opponentId} data={data} size={24} />
      <span className="min-w-0 flex-1 truncate">{data.champions[entry.opponentId]?.name ?? entry.opponentId}</span>
      <span className="display text-xs text-mute">{count(entry.games)}</span>
      <WinBar stat={entry} compact />
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Panel title={t('Beste Matchups')} aside={t("nach unterem Rand des 95-%-Bereichs")}>
          {best.map(row)}
        </Panel>
        <Panel title={t('Schwerste Matchups')} aside={t("nach oberem Rand des 95-%-Bereichs")}>
          {worst.map(row)}
        </Panel>
      </div>
      <Panel
        title={t`Alle ${profile.matchups.length} Matchups`}
        aside={
          <span className="flex gap-3">
            {(['games', 'best', 'worst'] as const).map((key) => (
              <button key={key} onClick={() => setOrder(key)} className={order === key ? 'text-bone' : 'hover:text-bone'}>
                {key === 'games' ? t('nach Spielen') : key === 'best' ? t('beste zuerst') : t('schwerste zuerst')}
              </button>
            ))}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-x-6">{all.map(row)}</div>
        <p className="mt-3 text-xs text-mute">
          {t('Klick auf einen Gegner stellt die ganze Analyse auf dieses Matchup um. Phasen-Daten (Lane, Mid-Game, Late-Game) je Matchup liefert die Quelle nicht.')}
        </p>
      </Panel>
    </div>
  )
}
