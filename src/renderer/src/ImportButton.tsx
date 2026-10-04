import { useState } from 'react'
import type { ImportRequest } from '../../shared/types'

type Phase =
  | { step: 'idle' | 'busy' | 'copied' }
  | { step: 'done'; pageName: string }
  | { step: 'confirm'; page: { id: number; name: string } }
  | { step: 'error'; message: string }

interface Props {
  request: Omit<ImportRequest, 'replacePageId'>
  /** Plain-text version of the page for the clipboard fallback. */
  text: string
  connected: boolean
}

export function ImportButton({ request, text, connected }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })

  async function run(replacePageId?: number): Promise<void> {
    setPhase({ step: 'busy' })
    try {
      const result = await window.api.importRunes({ ...request, replacePageId })
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
    'h-9 rounded-md bg-gold px-5 text-[13px] font-semibold text-ink hover:brightness-110 disabled:opacity-35 disabled:hover:brightness-100'

  if (phase.step === 'confirm') {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-mute">Keine freie Runenseite. „{phase.page.name}“ überschreiben?</p>
        <div className="flex gap-2">
          <button className={primary} onClick={() => void run(phase.page.id)}>
            Überschreiben
          </button>
          <button
            className="h-9 rounded-md border border-line px-4 text-mute hover:text-bone"
            onClick={() => setPhase({ step: 'idle' })}
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button className={primary} disabled={!connected || phase.step === 'busy'} onClick={() => void run()}>
        {phase.step === 'busy' ? 'Importiere …' : phase.step === 'done' ? 'Importiert ✓' : 'Runen importieren'}
      </button>
      <button className="text-[12px] text-mute underline-offset-2 hover:text-bone hover:underline" onClick={() => void copy()}>
        Als Text kopieren
      </button>
      <span className={`text-[12px] ${phase.step === 'error' ? 'text-down' : 'text-mute'}`}>
        {phase.step === 'error' && phase.message}
        {phase.step === 'done' && `Seite „${phase.pageName}“ ist im Client aktiv.`}
        {phase.step === 'copied' && 'Runen als Text kopiert.'}
        {phase.step === 'idle' && !connected && 'League ist nicht verbunden.'}
      </span>
    </div>
  )
}
