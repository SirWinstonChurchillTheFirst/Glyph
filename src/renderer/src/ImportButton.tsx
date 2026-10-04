import { useState } from 'react'
import type { RuneSetup } from '../../shared/types'

type Phase =
  | { step: 'idle' | 'busy' | 'copied' }
  | { step: 'done'; pageName: string }
  | { step: 'confirm'; page: { id: number; name: string } }
  | { step: 'error'; message: string }

interface Props {
  pageName: string
  runes: RuneSetup
  /** Plain-text version of the page for the clipboard fallback. */
  text: string
  connected: boolean
}

export function ImportButton({ pageName, runes, text, connected }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })

  async function run(replacePageId?: number): Promise<void> {
    setPhase({ step: 'busy' })
    try {
      const result = await window.api.importRunes({ name: pageName, runes, replacePageId })
      if (result.ok) setPhase({ step: 'done', pageName: result.pageName })
      else if (result.code === 'NO_FREE_PAGE' && result.replaceable) {
        setPhase({ step: 'confirm', page: result.replaceable })
      } else setPhase({ step: 'error', message: result.message })
    } catch {
      setPhase({ step: 'error', message: 'Der Import ist unerwartet fehlgeschlagen.' })
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setPhase({ step: 'copied' })
    } catch {
      setPhase({ step: 'error', message: 'Kopieren in die Zwischenablage ist fehlgeschlagen.' })
    }
  }

  const primary =
    'h-11 w-full rounded-md bg-accent text-sm font-semibold tracking-wide text-bg uppercase hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100'
  const secondary = 'text-xs text-dim underline-offset-2 hover:text-text hover:underline'

  if (phase.step === 'confirm') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-dim">
          Keine freie Runenseite. Soll „{phase.page.name}“ überschrieben werden?
        </p>
        <div className="flex gap-2">
          <button className={primary} onClick={() => void run(phase.page.id)}>
            Überschreiben
          </button>
          <button
            className="h-11 shrink-0 rounded-md border border-line px-4 text-sm text-dim hover:text-text"
            onClick={() => setPhase({ step: 'idle' })}
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button className={primary} disabled={!connected || phase.step === 'busy'} onClick={() => void run()}>
        {phase.step === 'busy' ? 'Importiere …' : phase.step === 'done' ? 'Importiert ✓' : 'Runen importieren'}
      </button>
      <div className="flex min-h-4 items-start justify-between gap-3 text-xs">
        <span className={phase.step === 'error' ? 'text-danger' : 'text-dim'}>
          {phase.step === 'error' && phase.message}
          {phase.step === 'done' && `Seite „${phase.pageName}“ ist im Client aktiv.`}
          {phase.step === 'copied' && 'Runen als Text kopiert.'}
          {phase.step === 'idle' && !connected && 'League ist nicht verbunden – Import nicht möglich.'}
        </span>
        <button className={`${secondary} shrink-0`} onClick={() => void copy()}>
          Als Text kopieren
        </button>
      </div>
    </div>
  )
}
