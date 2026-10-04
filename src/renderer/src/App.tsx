import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { analyzeTeam, laneOpponent } from '../../shared/analysis'
import { recommend, type Facing, type Situation } from '../../shared/recommend'
import type { LeagueState, Role, StaticData } from '../../shared/types'
import { Drawer } from './Drawer'
import { ChampionHeader, type Tab } from './ChampionHeader'
import { Home } from './Home'
import { useAsync } from './lib'
import { Rail } from './Rail'
import { Search } from './Search'
import { Footer, Header } from './shell'
import { Notice, Skeleton, type Detail } from './ui'
import { BuildsView, DecisionView, ItemsView, MatchupsView, type View } from './views'

const RECENT_KEY = 'glyph.recent'
const RECENT_MAX = 8

/** Champions opened before. Only a convenience, so a browser store that fails is simply ignored. */
function loadRecent(): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'number') : []
  } catch {
    return []
  }
}

const NO_FACING: Facing = { ad: false, ap: false, cc: false }

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
  const [recent, setRecent] = useState(loadRecent)

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
    if (championId === null) return
    setRecent((current) => {
      const next = [championId, ...current.filter((id) => id !== championId)].slice(0, RECENT_MAX)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        // Not being able to remember is fine.
      }
      return next
    })
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
  let main: ReactNode
  if (dataError) {
    main = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <h1 className="display text-[22px]">Spieldaten konnten nicht geladen werden</h1>
        <p className="text-mute">{dataError}</p>
      </div>
    )
  } else if (!data) {
    main = null
  } else if (championId !== null && champion) {
    const roles = profile.data?.positions.length
      ? [...profile.data.positions]
          .filter((position) => position.roleRate >= 0.05 || position.role === role)
          .sort((a, b) => b.games - a.games)
          .map((position) => position.role)
      : champion.positions.length
        ? champion.positions
        : [role]
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
        <ChampionHeader
          champion={champion}
          opponentName={opponentId !== null ? data.champions[opponentId]?.name : undefined}
          roles={roles}
          role={role}
          onRole={(next) => setRoleChoice({ championId, role: next })}
          stats={profile.data}
          note={
            champSelect?.gameMode && champSelect.gameMode !== 'CLASSIC'
              ? `${champSelect.gameMode}: Daten aus Ranked Solo`
              : undefined
          }
          onClose={champSelect ? undefined : () => setManualId(null)}
          tab={tab}
          onTab={setTab}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Aligned with the header; very wide windows keep the panels from stretching. */}
          <div className="max-w-[1320px]">
            {builds.error ? (
              <Notice onRetry={builds.retry}>{builds.error}</Notice>
            ) : !view ? (
              <Skeleton
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
        </div>
      </>
    )
  } else {
    main = (
      <Home
        status={status}
        data={data}
        recent={recent}
        launch={launch}
        onLaunch={() => void launchLeague()}
        onSearch={() => setSearching(true)}
        onChampion={openChampion}
      />
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
      <Header
        status={status}
        summonerName={connected ? league.summonerName : undefined}
        onSearch={() => setSearching(true)}
        info={
          data && {
            statsPatch: profile.data?.patch ?? null,
            gamePatch: data.patch,
            newPatch,
            updating: update.busy,
            updateError: update.message,
            onUpdate: () => void updateData()
          }
        }
      />

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

      <Footer />

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
