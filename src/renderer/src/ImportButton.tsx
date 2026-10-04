import { AlertCircle, Check, Download, Loader2 } from 'lucide-react'
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
  /** Why importing is not possible right now; replaces the generic "not connected". */
  note?: string
}

export function ImportButton({ request, text, connected, note }: Props) {
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

  if (phase.step === 'confirm') {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-mute">Keine freie Runenseite. „{phase.page.name}“ überschreiben?</p>
        <div className="flex gap-2">
          <button className="primary h-9 px-5" onClick={() => void run(phase.page.id)}>
            Überschreiben
          </button>
          <button className="card h-9 px-4 text-mute hover:text-bone" onClick={() => setPhase({ step: 'idle' })}>
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  const [icon, label] =
    phase.step === 'busy'
      ? [<Loader2 size={15} className="spin" />, 'Importiere …']
      : phase.step === 'done'
        ? [<Check size={16} />, 'Runen importiert']
        : phase.step === 'error'
          ? [<AlertCircle size={15} />, 'Erneut versuchen']
          : [<Download size={15} />, 'Runen importieren']

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button className="primary h-9 px-5" disabled={!connected || phase.step === 'busy'} onClick={() => void run()}>
        {icon}
        {label}
      </button>
      <button className="text-[12px] text-mute underline-offset-2 hover:text-bone hover:underline" onClick={() => void copy()}>
        Als Text kopieren
      </button>
      <span className={`text-[12px] ${phase.step === 'error' ? 'text-down' : 'text-mute'}`}>
        {phase.step === 'error' && phase.message}
        {phase.step === 'done' && `Seite „${phase.pageName}“ ist im Client aktiv.`}
        {phase.step === 'copied' && 'Runen als Text kopiert.'}
        {phase.step === 'idle' && !connected && (note ?? 'League ist nicht verbunden.')}
      </span>
    </div>
  )
}
