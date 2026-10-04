import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { analyzeTeam, laneOpponent } from '../../shared/analysis'
import { recommend, type Facing, type Situation } from '../../shared/recommend'
import type { LeagueState, LeagueStatus, Role, StaticData } from '../../shared/types'
import { Drawer } from './Drawer'
import { ROLE_LABELS, count, percent, splashUrl, useAsync } from './lib'
import { Rail } from './Rail'
import { Search } from './Search'
import { Figure, Loading, Notice, type Detail } from './ui'
import { BuildsView, DecisionView, ItemsView, MatchupsView, type View } from './views'

const STATUS_LABELS: Record<LeagueStatus, string> = {
  'not-running': 'League nicht gestartet',
  starting: 'League startet …',
  unreachable: 'Client nicht erreichbar',
  idle: 'League verbunden',
  'champ-select': 'Champion Select'
}

const TABS = [
  ['decision', 'Entscheidung'],
  ['builds', 'Builds'],
  ['items', 'Items'],
  ['matchups', 'Matchups']
] as const
type Tab = (typeof TABS)[number][0]

const NO_FACING: Facing = { ad: false, ap: false, cc: false }

function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="display text-[28px]">{title}</h1>
      {children}
    </div>
  )
}

export function App() {
  const [data, setData] = useState<StaticData | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [league, setLeague] = useState<LeagueState>({ status: 'not-running' })
  const [manualId, setManualId] = useState<number | null>(null)
  const [roleChoice, setRoleChoice] = useState<{ championId: number; role: Role } | null>(null)
  // `id: null` is a deliberate "no opponent", as opposed to no choice at all.
  const [opponentChoice, setOpponentChoice] = useState<{ championId: number; id: number | null } | null>(null)
  const [facingChoice, setFacingChoice] = useState<Partial<Facing>>({})
  const [tab, setTab] = useState<Tab>('decision')
  const [pageChoice, setPageChoice] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [searching, setSearching] = useState(false)
  const [launch, setLaunch] = useState<{ busy: boolean; message?: string }>({ busy: false })
  const [newPatch, setNewPatch] = useState<string | null>(null)
  const [update, setUpdate] = useState<{ busy: boolean; message?: string }>({ busy: false })

  useEffect(() => {
    window.api.getStatic().then(setData, (error: Error) => setDataError(error.message))
    void window.api.checkUpdate().then(setNewPatch)
    void window.api.getState().then(setLeague)
    return window.api.onState((state) => {
      setLeague(state)
      // A real champ select ends any manual lookup, so it does not reappear afterwards.
      if (state.status === 'champ-select') setManualId(null)
    })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { status, champSelect } = league
  const connected = status === 'idle' || status === 'champ-select'
  // A live champ select always wins over a manually chosen champion.
  const championId = champSelect ? champSelect.championId : manualId
  const champion = data && championId !== null ? data.champions[championId] : undefined

  const role: Role =
    (roleChoice?.championId === championId ? roleChoice.role : null) ??
    champSelect?.role ??
    champion?.positions[0] ??
    'mid'

  // Another champion: whatever was drilled into belongs to the previous one.
  useEffect(() => {
    setDetail(null)
    setPageChoice(null)
  }, [championId])

  // ---------- Draft analysis ----------
  const draft = useMemo(() => {
    if (!data || !champSelect) return null
    const ids = (slots: typeof champSelect.myTeam): number[] =>
      slots.map((slot) => slot.championId).filter((id): id is number => id !== null)
    const enemyIds = ids(champSelect.theirTeam)
    return {
      allies: analyzeTeam(ids(champSelect.myTeam), data),
      enemies: analyzeTeam(enemyIds, data),
      lane: laneOpponent(enemyIds, role, data)
    }
  }, [data, champSelect, role])

  const opponentId = opponentChoice?.championId === championId ? opponentChoice.id : (draft?.lane ?? null)

  const derived: Facing = useMemo(() => {
    const enemies = draft?.enemies
    if (!enemies || enemies.known === 0) return NO_FACING
    return {
      ad: enemies.ad.length >= 3,
      ap: enemies.ap.length >= 3,
      cc: enemies.metrics.find((metric) => metric.id === 'control')?.level === 'high'
    }
  }, [draft])
  const facing: Facing = useMemo(() => ({ ...derived, ...facingChoice }), [derived, facingChoice])

  const situation: Situation = useMemo(() => {
    const enemies = draft?.enemies
    const marked = (what: string): string => `Du hast „${what}“ markiert.`
    return {
      ad: derived.ad && enemies ? `Gegner mit physischem Schaden: ${enemies.ad.join(', ')}.` : marked('viel physischer Schaden'),
      ap: derived.ap && enemies ? `Gegner mit magischem Schaden: ${enemies.ap.join(', ')}.` : marked('viel magischer Schaden'),
      cc:
        derived.cc && enemies
          ? `Das gegnerische Team hat viel Crowd Control (${enemies.metrics.find((metric) => metric.id === 'control')?.basis}).`
          : marked('viel Crowd Control')
    }
  }, [draft, derived])

  // ---------- Statistics ----------
  const profile = useAsync(championId !== null ? `profile-${championId}-${role}` : null, () =>
    window.api.getProfile(championId!, role)
  )
  const builds = useAsync(championId !== null ? `builds-${championId}-${role}-${opponentId}` : null, () =>
    window.api.getBuilds(championId!, role, opponentId)
  )

  // A champion opened in a role it is not played in: move to its most played one.
  useEffect(() => {
    const positions = profile.data?.positions
    if (!positions?.length || championId === null || positions.some((position) => position.role === role)) return
    const main = [...positions].sort((a, b) => b.games - a.games)[0].role
    setRoleChoice({ championId, role: main })
  }, [profile.data, championId, role])

  const recommendation = useMemo(
    () => (data && builds.data ? recommend(builds.data, facing, data, situation) : null),
    [data, builds.data, facing, situation]
  )

  // ---------- Actions ----------
  const openChampion = useCallback((id: number) => {
    setManualId(id)
    setTab('decision')
    setDetail(null)
    setPageChoice(null)
  }, [])
  const openMatchup = useCallback(
    (id: number, opponent: number) => {
      if (!champSelect) setManualId(id)
      setOpponentChoice({ championId: id, id: opponent })
      setTab('decision')
      setPageChoice(null)
    },
    [champSelect]
  )
  const setOpponent = useCallback(
    (id: number | null) => {
      if (championId === null) return
      setOpponentChoice({ championId, id })
      setTab('decision')
      setPageChoice(null)
    },
    [championId]
  )
  const openPage = useCallback((key: string) => {
    setPageChoice(key)
    setTab('builds')
  }, [])

  async function launchLeague(): Promise<void> {
    setLaunch({ busy: true })
    const result = await window.api.launchLeague()
    // On success the button stays disabled until the watcher reports the client.
    setLaunch(result.ok ? { busy: true } : { busy: false, message: result.message })
  }

  async function updateData(): Promise<void> {
    setUpdate({ busy: true })
    const result = await window.api.updateData()
    if (result.ok) {
      setData(result.data)
      setNewPatch(null)
      setUpdate({ busy: false })
    } else setUpdate({ busy: false, message: `Aktualisierung fehlgeschlagen: ${result.message}` })
  }

  // ---------- Main area ----------
  const searchButton = (
    <button
      onClick={() => setSearching(true)}
      className="h-10 rounded-md border border-line bg-surface px-5 text-mute hover:border-mute hover:text-bone"
    >
      Champion oder Matchup suchen <span className="ml-2 text-[11px]">Strg K</span>
    </button>
  )

  let main: ReactNode
  if (dataError) {
    main = (
      <Message title="Spieldaten konnten nicht geladen werden">
        <p className="text-mute">{dataError}</p>
      </Message>
    )
  } else if (!data) {
    main = null
  } else if (championId !== null && champion) {
    const positions = profile.data?.positions.length
      ? [...profile.data.positions].filter((position) => position.roleRate >= 0.05 || position.role === role).sort((a, b) => b.games - a.games).map((position) => position.role)
      : champion.positions.length
        ? champion.positions
        : [role]
    const stats = profile.data
    const view: View | null =
      builds.data && recommendation
        ? {
            data,
            championId,
            role,
            profile: profile.data,
            builds: builds.data,
            recommendation,
            opponentId,
            connected,
            onOpen: setDetail,
            onOpponent: setOpponent,
            situationMarked: facing.ad || facing.ap || facing.cc,
            draft: draft && { allies: draft.allies, enemies: draft.enemies },
            selectedPage: pageChoice ?? recommendation.page.pick.key,
            onPage: setPageChoice
          }
        : null

    main = (
      <>
        <header className="relative shrink-0 overflow-hidden border-b border-line">
          <img src={splashUrl(champion.key)} alt="" className="absolute inset-y-0 right-0 h-full w-2/3 object-cover object-[50%_18%] opacity-70" />
          <div className="absolute inset-0 bg-linear-to-r from-ink via-ink/85 to-ink/10" />
          <div className="relative flex items-end justify-between gap-6 px-6 pt-5 pb-4">
            <div>
              <div className="flex items-baseline gap-4">
                <h1 className="display text-[44px] leading-none">{champion.name}</h1>
                {opponentId !== null && (
                  <span className="display text-[20px] text-mute">gegen {data.champions[opponentId]?.name}</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-1">
                {positions.map((option) => (
                  <button
                    key={option}
                    onClick={() => setRoleChoice({ championId, role: option })}
                    className={`rounded-full px-3 py-1 text-[12px] ${
                      option === role ? 'bg-bone text-ink' : 'text-mute hover:text-bone'
                    }`}
                  >
                    {ROLE_LABELS[option]}
                  </button>
                ))}
                {champSelect?.gameMode && champSelect.gameMode !== 'CLASSIC' && (
                  <span className="ml-2 text-[11px] text-mute">{champSelect.gameMode}: Daten aus Ranked Solo</span>
                )}
                {!champSelect && (
                  <button onClick={() => setManualId(null)} className="ml-2 text-[11px] text-mute hover:text-bone">
                    Champion schließen
                  </button>
                )}
              </div>
            </div>
            {stats && stats.games > 0 && (
              <div className="flex gap-7 rounded-md bg-ink/70 px-4 py-3 backdrop-blur-sm">
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
                onClick={() => setTab(id)}
                className={`border-b-2 px-3 py-2 ${
                  tab === id ? 'border-bone text-bone' : 'border-transparent text-mute hover:text-bone'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {builds.error ? (
            <Notice onRetry={builds.retry}>{builds.error}</Notice>
          ) : !view ? (
            <Loading
              label={
                opponentId !== null
                  ? `Lade Matchup gegen ${data.champions[opponentId]?.name} …`
                  : 'Lade die häufigsten Matchups und summiere die Builds …'
              }
            />
          ) : tab === 'decision' ? (
            <DecisionView {...view} />
          ) : tab === 'builds' ? (
            <BuildsView {...view} />
          ) : tab === 'items' ? (
            <ItemsView {...view} />
          ) : (
            <MatchupsView {...view} />
          )}
        </div>
      </>
    )
  } else if (status === 'champ-select') {
    main = (
      <Message title="Champion Select erkannt">
        <p className="text-mute">Wähle einen Champion – die Analyse erscheint automatisch.</p>
      </Message>
    )
  } else if (status === 'idle') {
    main = (
      <Message title="Bereit">
        <p className="text-mute">Warte auf Champion Select …</p>
        {searchButton}
      </Message>
    )
  } else if (status === 'starting') {
    main = (
      <Message title="League startet …">
        <p className="text-mute">Verbinde mit dem Client.</p>
      </Message>
    )
  } else if (status === 'unreachable') {
    main = (
      <Message title="League Client nicht erreichbar">
        <p className="max-w-md text-mute">
          League läuft, antwortet aber nicht. Die Verbindung wird weiter versucht – falls es so bleibt, starte den
          Client neu.
        </p>
        {searchButton}
      </Message>
    )
  } else {
    main = (
      <Message title="League of Legends wurde nicht gefunden">
        <p className="text-mute">Starte League, um im Champion Select automatisch eine Analyse zu erhalten.</p>
        <div className="flex gap-3">
          <button
            onClick={() => void launchLeague()}
            disabled={launch.busy}
            className="h-10 rounded-md bg-gold px-6 font-semibold text-ink hover:brightness-110 disabled:opacity-40"
          >
            {launch.busy ? 'League wird gestartet …' : 'League starten'}
          </button>
          {searchButton}
        </div>
        {launch.message && <p className="text-[12px] text-down">{launch.message}</p>}
      </Message>
    )
  }

  const scope =
    opponentId !== null && data
      ? `gegen ${data.champions[opponentId]?.name}`
      : builds.data
        ? `Summe der ${builds.data.opponentIds.length} häufigsten Matchups`
        : ''

  return (
    <div className="relative flex h-full flex-col">
      <div className="drag flex h-11 shrink-0 items-center gap-4 border-b border-line pr-36 pl-4">
        <span className="display text-[17px] tracking-[0.18em]">GLYPH</span>
        <span className="flex items-center gap-1.5 text-[12px] text-mute">
          <span className={`size-1.5 rounded-full ${connected ? 'bg-up' : 'bg-mute/50'}`} />
          {STATUS_LABELS[status]}
          {connected && league.summonerName && ` · ${league.summonerName}`}
        </span>
        {data && (
          <button
            onClick={() => setSearching(true)}
            className="no-drag ml-auto flex h-7 w-72 items-center justify-between rounded-md border border-line bg-surface px-3 text-[12px] text-mute hover:border-mute"
          >
            Suchen: Champion, Matchup, Item, Rune
            <span className="text-[11px]">Strg K</span>
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {data && championId !== null && (
          <Rail
            data={data}
            myTeam={champSelect?.myTeam ?? []}
            theirTeam={champSelect?.theirTeam ?? []}
            opponentId={opponentId}
            onOpponent={setOpponent}
            facing={facing}
            derived={derived}
            onFacing={(flag, value) => setFacingChoice((current) => ({ ...current, [flag]: value }))}
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col">{main}</main>
        {data && detail && (
          <Drawer
            // Replays the entrance when another item or rune is opened.
            key={`${detail.kind}-${detail.id}`}
            detail={detail}
            data={data}
            builds={builds.data}
            scope={scope}
            onClose={() => setDetail(null)}
            onPage={openPage}
          />
        )}
      </div>

      {data && (
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-1.5 text-[11px] text-mute">
          <span>
            Statistiken: OP.GG, Ranked Solo{profile.data?.patch ? `, Patch ${profile.data.patch}` : ''} · Spieldaten: Data
            Dragon {data.patch}, Meraki Analytics
          </span>
          {update.message ? (
            <span className="text-down">{update.message}</span>
          ) : (
            newPatch && (
              <button onClick={() => void updateData()} disabled={update.busy} className="shrink-0 text-bone hover:underline disabled:opacity-60">
                {update.busy ? 'Aktualisiere …' : `Spieldaten für ${newPatch} laden`}
              </button>
            )
          )}
        </footer>
      )}

      {data && searching && (
        <Search
          data={data}
          championId={championId}
          builds={builds.data}
          onChampion={openChampion}
          onMatchup={openMatchup}
          onDetail={setDetail}
          onPage={openPage}
          onClose={() => setSearching(false)}
        />
      )}
    </div>
  )
}
