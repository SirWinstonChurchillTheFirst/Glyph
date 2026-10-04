import { spawn } from 'node:child_process'
import type { ChampSelectState, ImportRequest, ImportResult, Role } from '../../shared/types'
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

interface ChampSelectSession {
  localPlayerCellId: number
  myTeam: { cellId: number; championId: number; championPickIntent: number; assignedPosition: string }[]
}

interface GameflowSession {
  map?: { id?: number; gameMode?: string }
  gameData?: { queue?: { id?: number } }
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

  /** The local player's pick in the running champ select, or null outside of one. */
  async getSelection(): Promise<Pick<ChampSelectState, 'championId' | 'role'> | null> {
    let session: ChampSelectSession
    try {
      session = await this.request<ChampSelectSession>('GET', '/lol-champ-select/v1/session')
    } catch (error) {
      if (error instanceof LcuError && error.status === 404) return null
      throw error
    }
    const me = session.myTeam?.find((player) => player.cellId === session.localPlayerCellId)
    if (!me) return { championId: null, role: null }
    return {
      championId: me.championId || me.championPickIntent || null,
      role: POSITIONS[me.assignedPosition?.toLowerCase()] ?? null
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

  async importRunes({ name, runes, replacePageId }: ImportRequest): Promise<ImportResult> {
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
