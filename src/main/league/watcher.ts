import type { ChampSelectState, LeagueState } from '../../shared/types'
import type { CurrentGame, LeagueService } from './LeagueService'

/** Consecutive failed polls (~2s apart) before "starting" turns into "unreachable". */
const UNREACHABLE_AFTER = 10
/** From the end of champ select until the game is over. */
const GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect'])

type Selection = Omit<ChampSelectState, 'gameMode'>

/**
 * Polls the client and reports state changes. One request per tick, slower whenever nothing
 * interesting can happen, so the app stays idle next to a running game.
 */
export class LeagueWatcher {
  state: LeagueState = { status: 'not-running' }

  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private failures = 0
  private summonerName: string | undefined
  private game: CurrentGame | null = null
  /** The last draft seen in champ select; kept for the game that follows. */
  private draft: Selection | null = null
  /** The teams as the running game reports them. */
  private teams: Selection | null = null

  constructor(
    private readonly league: LeagueService,
    private readonly onChange: (state: LeagueState) => void
  ) {}

  start(): void {
    this.stopped = false
    void this.loop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
  }

  private async loop(): Promise<void> {
    let delay = 3000
    try {
      delay = await this.tick()
    } catch {
      // A tick must never take the app down; try again on the next one.
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.loop(), delay)
  }

  private set(state: LeagueState): void {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return
    this.state = state
    this.onChange(state)
  }

  private async tick(): Promise<number> {
    if (!(await this.league.isLeagueRunning())) {
      this.failures = 0
      this.summonerName = undefined
      this.set({ status: 'not-running' })
      return 3000
    }

    let phase: string
    try {
      phase = await this.league.getPhase()
    } catch {
      this.failures++
      this.set({ status: this.failures >= UNREACHABLE_AFTER ? 'unreachable' : 'starting' })
      return 2000
    }
    this.failures = 0

    // Fails while the login is still in progress; simply retried on the next tick.
    this.summonerName ||= await this.league.getSummonerName().catch(() => undefined)

    if (GAME_PHASES.has(phase)) {
      // The build is needed most while playing, so the analysis stays up for the whole game.
      // The game's own team list also covers an app that was started after champ select.
      if (!this.teams) {
        const teams = await this.league.getGameSelection().catch(() => null)
        if (teams?.championId) this.teams = teams
      }
      this.game ??= await this.league.getCurrentGame().catch(() => null)
      const selection = this.teams ?? this.draft
      this.set({
        status: 'in-game',
        summonerName: this.summonerName,
        champSelect: selection ? { ...selection, gameMode: this.game?.gameMode ?? null } : undefined
      })
      return 5000
    }

    if (phase !== 'ChampSelect') {
      this.game = null
      this.draft = null
      this.teams = null
      this.set({ status: 'idle', summonerName: this.summonerName })
      return 2000
    }

    const selection = await this.league.getSelection()
    if (!selection) return 1000
    this.draft = selection
    this.teams = null
    this.game ??= await this.league.getCurrentGame().catch(() => null)
    this.set({
      status: 'champ-select',
      summonerName: this.summonerName,
      champSelect: { ...selection, gameMode: this.game?.gameMode ?? null }
    })
    return 1000
  }
}
