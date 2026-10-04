import { useEffect, useState, type ReactNode } from 'react'
import type { Dataset, LeagueState, LeagueStatus, Role } from '../../shared/types'
import { BuildView } from './BuildView'
import { ChampionSearch } from './ChampionSearch'

const STATUS_LABELS: Record<LeagueStatus, string> = {
  'not-running': 'League nicht gestartet',
  starting: 'League startet …',
  unreachable: 'Client nicht erreichbar',
  idle: 'League verbunden',
  'champ-select': 'Champion Select'
}

function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}

export function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [league, setLeague] = useState<LeagueState>({ status: 'not-running' })
  const [manualId, setManualId] = useState<number | null>(null)
  const [roleChoice, setRoleChoice] = useState<{ championId: number; role: Role } | null>(null)
  const [launch, setLaunch] = useState<{ busy: boolean; message?: string }>({ busy: false })
  const [newPatch, setNewPatch] = useState<string | null>(null)
  const [update, setUpdate] = useState<{ busy: boolean; message?: string }>({ busy: false })

  useEffect(() => {
    window.api.getData().then(setData, (error: Error) => setDataError(error.message))
    void window.api.checkUpdate().then(setNewPatch)
    void window.api.getState().then(setLeague)
    return window.api.onState((state) => {
      setLeague(state)
      // A real champ select ends any manual lookup, so it does not reappear afterwards.
      if (state.status === 'champ-select') setManualId(null)
    })
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
      setData(result.dataset)
      setNewPatch(null)
      setUpdate({ busy: false })
    } else {
      setUpdate({ busy: false, message: `Aktualisierung fehlgeschlagen: ${result.message}` })
    }
  }

  const { status, champSelect } = league
  const connected = status === 'idle' || status === 'champ-select'
  // A live champ select always wins over a manually chosen champion.
  const championId = champSelect ? champSelect.championId : manualId
  const role = roleChoice?.championId === championId ? roleChoice.role : (champSelect?.role ?? null)
  const mode = champSelect?.gameMode
  const modeNote = mode && mode !== 'CLASSIC' ? `${mode} · Daten aus Ranked Solo` : undefined

  let content: ReactNode
  if (dataError) {
    content = (
      <Message title="Daten konnten nicht geladen werden.">
        <p className="text-dim">{dataError}</p>
      </Message>
    )
  } else if (!data) {
    content = null
  } else if (championId !== null) {
    content = (
      <BuildView
        data={data}
        championId={championId}
        role={role}
        onRole={(next) => setRoleChoice({ championId, role: next })}
        modeNote={modeNote}
        connected={connected}
        onClose={champSelect ? undefined : () => setManualId(null)}
      />
    )
  } else if (status === 'champ-select') {
    content = (
      <Message title="Champion Select erkannt.">
        <p className="text-dim">Wähle einen Champion – Runen und Build erscheinen automatisch.</p>
      </Message>
    )
  } else if (status === 'idle') {
    content = (
      <Message title="Bereit.">
        <p className="text-dim">Warte auf Champion Select …</p>
        <ChampionSearch data={data} onPick={setManualId} />
      </Message>
    )
  } else if (status === 'starting') {
    content = (
      <Message title="League startet …">
        <p className="text-dim">Verbinde mit dem Client.</p>
      </Message>
    )
  } else if (status === 'unreachable') {
    content = (
      <Message title="League Client nicht erreichbar.">
        <p className="text-dim">
          League läuft, antwortet aber nicht. Die Verbindung wird weiter versucht – falls es so
          bleibt, starte den Client neu.
        </p>
        <ChampionSearch data={data} onPick={setManualId} />
      </Message>
    )
  } else {
    content = (
      <Message title="League of Legends wurde nicht gefunden.">
        <p className="text-dim">
          Starte League, um automatisch
          <br />
          Runen und Builds zu erhalten.
        </p>
        <button
          onClick={() => void launchLeague()}
          disabled={launch.busy}
          className="h-11 rounded-md bg-accent px-8 text-sm font-semibold tracking-wide text-bg uppercase hover:brightness-110 disabled:opacity-40"
        >
          {launch.busy ? 'League wird gestartet …' : 'League starten'}
        </button>
        {launch.message && <p className="text-xs text-danger">{launch.message}</p>}
        <ChampionSearch data={data} onPick={setManualId} />
      </Message>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="drag flex h-10 shrink-0 items-center gap-3 px-5">
        <span className="text-sm font-semibold tracking-[0.2em] uppercase">Glyph</span>
        <span className="flex items-center gap-1.5 text-xs text-dim">
          <span className={`size-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-dim/50'}`} />
          {STATUS_LABELS[status]}
          {connected && league.summonerName && ` · ${league.summonerName}`}
        </span>
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{content}</main>

      {data && (
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-2 text-[11px] text-dim">
          <span>
            Patch {data.builds.patch} · {data.builds.source}
          </span>
          {update.message ? (
            <span className="text-danger">{update.message}</span>
          ) : (
            newPatch && (
              <button
                onClick={() => void updateData()}
                disabled={update.busy}
                className="shrink-0 text-accent hover:underline disabled:opacity-60"
              >
                {update.busy ? 'Aktualisiere …' : `Daten für ${newPatch} laden`}
              </button>
            )
          )}
        </footer>
      )}
    </div>
  )
}
