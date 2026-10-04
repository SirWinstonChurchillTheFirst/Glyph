import { spawn } from 'node:child_process'
import type { ChampSelectState, DraftSlot, ImportRequest, ImportResult, Role } from '../../shared/types'
import { discoverClient, findRiotClient, type LcuCredentials } from './credentials'
import { LcuError, lcuRequest } from './lcu'

/** Rune pages created by this app start with this, so they can be reused instead of piling up. */
export const PAGE_PREFIX = 'Glyph'

const POSITIONS: Record<string, Role> = {
  top: 'top',
  jungle: 'jungle',
  middle: 'mid',
  bottom: 'adc',
  utility: 'support'
}

// Only the fields this app reads; see the LCU schema for the full resources.
interface RunePage {
  id: number
  name: string
  isDeletable: boolean
  isValid: boolean
  current: boolean
}

interface SessionPlayer {
  cellId: number
  championId: number
  championPickIntent: number
  assignedPosition: string
}

interface ChampSelectSession {
  localPlayerCellId: number
  myTeam?: SessionPlayer[]
  theirTeam?: SessionPlayer[]
}

interface GamePlayer {
  championId?: number
  puuid?: string
  selectedPosition?: string
}

interface GameflowSession {
  map?: { id?: number; gameMode?: string }
  gameData?: {
    queue?: { id?: number }
    teamOne?: GamePlayer[]
    teamTwo?: GamePlayer[]
    playerChampionSelections?: GamePlayer[]
  }
}

export interface CurrentGame {
  gameMode: string | null
  mapId: number | null
  queueId: number | null
}

/** The only place that knows about the LCU. Everything else goes through these methods. */
export class LeagueService {
  private credentials: LcuCredentials | null = null

  /** Looks for the client and refreshes the connection details. Cheap enough to poll. */
  async isLeagueRunning(): Promise<boolean> {
    const found = await discoverClient()
    this.credentials = found.credentials
    return found.running
  }

  get hasCredentials(): boolean {
    return this.credentials !== null
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.credentials) return Promise.reject(new LcuError(0, 'not connected'))
    return lcuRequest<T>(this.credentials, method, path, body)
  }

  getPhase(): Promise<string> {
    return this.request<string>('GET', '/lol-gameflow/v1/gameflow-phase')
  }

  async getSummonerName(): Promise<string> {
    const summoner = await this.request<{ gameName?: string; displayName?: string }>(
      'GET',
      '/lol-summoner/v1/current-summoner'
    )
    return summoner.gameName || summoner.displayName || ''
  }

  async getCurrentGame(): Promise<CurrentGame> {
    const session = await this.request<GameflowSession>('GET', '/lol-gameflow/v1/session')
    return {
      gameMode: session.map?.gameMode ?? null,
      mapId: session.map?.id ?? null,
      queueId: session.gameData?.queue?.id ?? null
    }
  }

  /** Both teams of the running champ select as far as they are visible, or null outside of one. */
  async getSelection(): Promise<Omit<ChampSelectState, 'gameMode'> | null> {
    let session: ChampSelectSession
    try {
      session = await this.request<ChampSelectSession>('GET', '/lol-champ-select/v1/session')
    } catch (error) {
      if (error instanceof LcuError && error.status === 404) return null
      throw error
    }
    const slot = (player: SessionPlayer): DraftSlot => ({
      championId: player.championId || player.championPickIntent || null,
      role: POSITIONS[player.assignedPosition?.toLowerCase()] ?? null,
      isMe: player.cellId === session.localPlayerCellId
    })
    const myTeam = (session.myTeam ?? []).map(slot)
    const me = myTeam.find((player) => player.isMe)
    return {
      championId: me?.championId ?? null,
      role: me?.role ?? null,
      myTeam,
      // Enemy cells share ids with nobody on this side; never mark one as the local player.
      theirTeam: (session.theirTeam ?? []).map((player) => ({ ...slot(player), isMe: false }))
    }
  }

  /**
   * Both teams of the game that is starting or running, or null when the client has no game.
   * Unlike champ select this also knows the enemies' positions.
   */
  async getGameSelection(): Promise<Omit<ChampSelectState, 'gameMode'> | null> {
    const [session, summoner] = await Promise.all([
      this.request<GameflowSession>('GET', '/lol-gameflow/v1/session'),
      this.request<{ puuid?: string }>('GET', '/lol-summoner/v1/current-summoner')
    ])
    const game = session.gameData
    const teams = [game?.teamOne ?? [], game?.teamTwo ?? []]
    if (teams[0].length + teams[1].length === 0) return null

    const mine = summoner.puuid
    const slot = (player: GamePlayer): DraftSlot => ({
      championId: player.championId || null,
      role: POSITIONS[player.selectedPosition?.toLowerCase() ?? ''] ?? null,
      isMe: mine !== undefined && player.puuid === mine
    })
    const sides = teams.map((team) => team.map(slot))

    // The client can leave a player out of the team lists while still naming their champion.
    // Such a player belongs to the shorter team and plays the one position nobody else has.
    const listed = new Set(teams.flat().map((player) => player.puuid))
    for (const player of game?.playerChampionSelections ?? []) {
      if (!player.championId || listed.has(player.puuid)) continue
      const side = sides[0].length <= sides[1].length ? sides[0] : sides[1]
      const taken = new Set(side.map((other) => other.role))
      const free = Object.values(POSITIONS).filter((role) => !taken.has(role))
      side.push({ ...slot(player), role: free.length === 1 ? free[0] : null })
    }

    const myIndex = sides.findIndex((side) => side.some((player) => player.isMe))
    if (myIndex < 0) return null
    const me = sides[myIndex].find((player) => player.isMe)
    return {
      championId: me?.championId ?? null,
      role: me?.role ?? null,
      myTeam: sides[myIndex],
      theirTeam: sides[1 - myIndex]
    }
  }

  async getCurrentChampion(): Promise<number | null> {
    return (await this.getSelection())?.championId ?? null
  }

  async getCurrentRole(): Promise<Role | null> {
    return (await this.getSelection())?.role ?? null
  }

  getRunePage(): Promise<RunePage> {
    return this.request<RunePage>('GET', '/lol-perks/v1/currentpage')
  }

  async importRunes({ name, replacePageId, ...runes }: ImportRequest): Promise<ImportResult> {
    try {
      const pages = await this.request<RunePage[]>('GET', '/lol-perks/v1/pages')
      const custom = pages.filter((page) => page.isDeletable)
      const own = custom.find((page) => page.name.startsWith(PAGE_PREFIX))

      let remove = own?.id ?? null
      if (remove === null) {
        const { ownedPageCount } = await this.request<{ ownedPageCount: number }>(
          'GET',
          '/lol-perks/v1/inventory'
        )
        if (custom.length >= ownedPageCount) {
          const target = custom.find((page) => page.id === replacePageId)
          if (!target) {
            const candidate = custom.find((page) => page.current) ?? custom[0]
            return {
              ok: false,
              code: 'NO_FREE_PAGE',
              message: 'Keine freie Runenseite.',
              replaceable: candidate && { id: candidate.id, name: candidate.name }
            }
          }
          remove = target.id
        }
      }
      if (remove !== null) await this.request('DELETE', `/lol-perks/v1/pages/${remove}`)

      const created = await this.request<RunePage>('POST', '/lol-perks/v1/pages', {
        name,
        primaryStyleId: runes.primaryStyle,
        subStyleId: runes.subStyle,
        selectedPerkIds: [...runes.perks, ...runes.shards],
        current: true
      })
      if (created.isValid === false) {
        return {
          ok: false,
          code: 'INVALID_PAGE',
          message:
            'Der Client hat die Runenseite als ungültig markiert. Vermutlich sind die Daten älter als der aktuelle Patch.'
        }
      }
      // `current: true` normally selects the page already; this covers clients where it does not.
      await this.request('PUT', '/lol-perks/v1/currentpage', created.id).catch(() => {})
      return { ok: true, pageName: created.name ?? name }
    } catch (error) {
      if (error instanceof LcuError && error.status === 0) {
        return { ok: false, code: 'NOT_CONNECTED', message: 'Der League Client ist nicht erreichbar.' }
      }
      const detail = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        code: 'REQUEST_FAILED',
        message: `Der Client hat den Import abgelehnt (${detail}).`
      }
    }
  }

  async launchLeague(): Promise<{ ok: boolean; message?: string }> {
    const riotClient = await findRiotClient()
    if (!riotClient) {
      return { ok: false, message: 'Riot Client nicht gefunden. Bitte League manuell starten.' }
    }
    return new Promise((resolve) => {
      const child = spawn(
        riotClient,
        ['--launch-product=league_of_legends', '--launch-patchline=live'],
        { detached: true, stdio: 'ignore' }
      )
      child.once('error', () =>
        resolve({ ok: false, message: 'League konnte nicht gestartet werden. Bitte manuell starten.' })
      )
      child.once('spawn', () => {
        child.unref()
        resolve({ ok: true })
      })
    })
  }
}
