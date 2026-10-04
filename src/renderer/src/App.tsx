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

const ROLES_KEY = 'glyph.mainRoles'

/** Each champion's most played role as learned from earlier lookups, so the next one starts in it. */
function loadMainRoles(): Record<number, Role> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ROLES_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? (stored as Record<number, Role>) : {}
  } catch {
    return {}
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
  const [mainRoles, setMainRoles] = useState(loadMainRoles)

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

  const { status } = league
  const online = status === 'idle' || status === 'champ-select' || status === 'in-game'
  // Rune pages can only be changed before the game starts.
  const connected = status === 'idle' || status === 'champ-select'
  // A live champ select always wins over a manually chosen champion. During a game the own
  // champion is the default, but looking something else up is allowed.
  const liveId = league.champSelect?.championId ?? null
  const championId = status === 'champ-select' ? liveId : (manualId ?? liveId)
  // The draft only says something about the champion it belongs to.
  const champSelect = league.champSelect && championId === liveId ? league.champSelect : undefined
  const champion = data && championId !== null ? data.champions[championId] : undefined

  const role: Role =
    (roleChoice?.championId === championId ? roleChoice.role : null) ??
    champSelect?.role ??
    (championId !== null ? mainRoles[championId] : undefined) ??
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
      // A running game knows the enemies' positions; champ select has to estimate them.
      lane:
        champSelect.theirTeam.find((slot) => slot.role === role && slot.championId !== null)?.championId ??
        laneOpponent(enemyIds, role, data)
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
  const profile = useAsync(championId !== null ? `profile-${championId}-${role}-${opponentId}` : null, () =>
    window.api.getProfile(championId!, role, opponentId)
  )
  // First answer: the matchup, or without an opponent the overall build from a single request.
  const first = useAsync(championId !== null ? `builds-${championId}-${role}-${opponentId}` : null, () =>
    window.api.getBuilds(championId!, role, opponentId, 'quick')
  )

  // Without an opponent the detailed sum over several matchups costs six more requests, so it is
  // loaded only once something needs it: the build or item tabs, a marked situation, or a failed first answer.
  const fullKey = championId !== null && opponentId === null ? `full-${championId}-${role}` : null
  const wantsFull =
    fullKey !== null && (tab === 'builds' || tab === 'items' || facing.ad || facing.ap || facing.cc || first.error !== null)
  const [fullRequested, setFullRequested] = useState<string | null>(null)
  useEffect(() => {
    if (wantsFull) setFullRequested(fullKey)
  }, [wantsFull, fullKey])
  const full = useAsync(fullKey !== null && fullRequested === fullKey ? fullKey : null, () =>
    window.api.getBuilds(championId!, role, null, 'full')
  )

  const buildData = full.data ?? first.data
  const loadingMore = fullKey !== null && fullRequested === fullKey && !full.data && !full.error
  const builds = {
    data: buildData,
    // While the detailed set is still on its way, a failed first answer is not the last word.
    error: buildData || loadingMore ? null : (full.error ?? first.error),
    retry: () => {
      first.retry()
      full.retry()
    }
  }

  // The static data lists a champion's positions without saying which is the main one. The profile
  // does: remember it, and move there unless the role was chosen (by the draft or by hand) and is one
  // the champion is actually played in.
  const roleGiven = roleChoice?.championId === championId || Boolean(champSelect?.role)
  useEffect(() => {
    const positions = profile.data?.positions
    if (!positions?.length || championId === null) return
    const main = [...positions].sort((a, b) => b.games - a.games)[0].role
    setMainRoles((current) => {
      if (current[championId] === main) return current
      const next = { ...current, [championId]: main }
      try {
        localStorage.setItem(ROLES_KEY, JSON.stringify(next))
      } catch {
        // Not being able to remember is fine.
      }
      return next
    })
    const played = positions.some((position) => position.role === role)
    if (role !== main && (!roleGiven || !played)) setRoleChoice({ championId, role: main })
  }, [profile.data, championId, role, roleGiven])

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
      if (status !== 'champ-select') setManualId(id)
      setOpponentChoice({ championId: id, id: opponent })
      setTab('decision')
      setPageChoice(null)
    },
    [status]
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
            importNote: status === 'in-game' ? 'Im Spiel lassen sich Runen und Zauber nicht mehr ändern.' : undefined,
            canSpells: status === 'champ-select' && championId === liveId,
            onOpen: setDetail,
            onOpponent: setOpponent,
            situationMarked: facing.ad || facing.ap || facing.cc,
            loadingMore,
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
          onClose={manualId !== null && status !== 'champ-select' ? () => setManualId(null) : undefined}
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
        ? builds.data.quick
          ? 'Champion gesamt'
          : `Summe der ${builds.data.opponentIds.length} häufigsten Matchups`
        : ''

  return (
    <div className="relative flex h-full flex-col">
      <Header
        status={status}
        summonerName={online ? league.summonerName : undefined}
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
