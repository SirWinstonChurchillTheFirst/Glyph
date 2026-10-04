import { AlertCircle, Check, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { FlashKey, ImportRequest, ItemSetStat, StaticData } from '../../shared/types'
import { percent, spellIconUrl } from './lib'
import { t } from '../../shared/i18n'

type Phase =
  | { step: 'idle' | 'busy' | 'copied' }
  | { step: 'done'; message: string }
  | { step: 'confirm'; page: { id: number; name: string } }
  | { step: 'error'; message: string }

interface Props {
  request: Omit<ImportRequest, 'replacePageId'>
  /** Plain-text version of the page for the clipboard fallback. */
  text: string
  connected: boolean
  /** Why importing is not possible right now; replaces the generic "not connected". */
  note?: string
  /** The recommended summoner spells, if the statistics have any. */
  spells: ItemSetStat | null
  /** Spells can only be set while champ select is running. */
  canSpells: boolean
  data: StaticData
}

const FLASH = 4
const WANT_KEY = 'glyph.import'
const FLASH_KEY = 'glyph.flashKey'

// What to import and where Flash goes are habits, so they are remembered across sessions.
function load<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not being able to remember is fine.
  }
}

export function ImportButton({ request, text, connected, note, spells, canSpells, data }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [want, setWant] = useState(() => load(WANT_KEY, { runes: true, spells: true }))
  const [flashKey, setFlashKey] = useState<FlashKey>(() => load<FlashKey>(FLASH_KEY, 'auto'))

  const doRunes = want.runes && connected
  const doSpells = want.spells && canSpells && spells !== null

  function choose(next: typeof want): void {
    setWant(next)
    save(WANT_KEY, next)
    setPhase({ step: 'idle' })
  }

  async function run(replacePageId?: number): Promise<void> {
    setPhase({ step: 'busy' })
    const done: string[] = []
    try {
      if (doRunes) {
        const result = await window.api.importRunes({ ...request, replacePageId })
        if (!result.ok) {
          if (result.code === 'NO_FREE_PAGE' && result.replaceable) {
            setPhase({ step: 'confirm', page: result.replaceable })
          } else setPhase({ step: 'error', message: result.message })
          return
        }
        done.push(t`Seite „${result.pageName}“ ist im Client aktiv.`)
      }
      if (doSpells) {
        const result = await window.api.importSpells(spells.ids, flashKey)
        if (!result.ok) {
          setPhase({ step: 'error', message: [...done, result.message].join(' ') })
          return
        }
        done.push(t('Beschwörerzauber gesetzt.'))
      }
      setPhase({ step: 'done', message: done.join(' ') })
    } catch {
      setPhase({ step: 'error', message: t('Der Import ist unerwartet fehlgeschlagen.') })
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setPhase({ step: 'copied' })
    } catch {
      setPhase({ step: 'error', message: t('Kopieren in die Zwischenablage ist fehlgeschlagen.') })
    }
  }

  if (phase.step === 'confirm') {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-mute">{t('Keine freie Runenseite. „')}{phase.page.name}{t('“ überschreiben?')}</p>
        <div className="flex gap-2">
          <button className="primary h-9 px-5" onClick={() => void run(phase.page.id)}>
            {t('Überschreiben')}
          </button>
          <button className="card h-9 px-4 text-mute hover:text-bone" onClick={() => setPhase({ step: 'idle' })}>
            {t('Abbrechen')}
          </button>
        </div>
      </div>
    )
  }

  const [importLabel, importedLabel] =
    doRunes && doSpells
      ? [t('Runen und Zauber importieren'), t('Runen und Zauber importiert')]
      : doSpells
        ? [t('Zauber importieren'), t('Zauber importiert')]
        : [t('Runen importieren'), t('Runen importiert')]
  const [icon, label] =
    phase.step === 'busy'
      ? [<Loader2 size={15} className="spin" />, t('Importiere …')]
      : phase.step === 'done'
        ? [<Check size={16} />, importedLabel]
        : phase.step === 'error'
          ? [<AlertCircle size={15} />, t('Erneut versuchen')]
          : [<Download size={15} />, importLabel]

  const hint =
    phase.step === 'error' || phase.step === 'done'
      ? phase.message
      : phase.step === 'copied'
        ? t('Runen als Text kopiert.')
        : !want.runes && !want.spells
          ? t('Wähle aus, was importiert werden soll.')
          : !connected && !doSpells
            ? (note ?? t('League ist nicht verbunden.'))
            : want.spells && spells && !canSpells && connected
              ? t('Zauber lassen sich nur im Champion Select setzen – importiert werden die Runen.')
              : ''

  const option = 'flex cursor-pointer items-center gap-1.5 text-[12px]'
  const hasFlash = spells?.ids.includes(FLASH) ?? false

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className={option}>
          <input
            type="checkbox"
            checked={want.runes}
            onChange={(event) => choose({ ...want, runes: event.target.checked })}
            className="accent-[#d6ad62]"
          />
          {t('Runen')}
        </label>
        {spells && (
          <label className={option} title={t`${percent(spells.pickRate, 0)} der Spiele`}>
            <input
              type="checkbox"
              checked={want.spells}
              onChange={(event) => choose({ ...want, spells: event.target.checked })}
              className="accent-[#d6ad62]"
            />
            {t('Beschwörerzauber')}
            <span className="ml-0.5 flex gap-1">
              {spells.ids.map((id) => (
                <img
                  key={id}
                  src={data.spells[id] ? spellIconUrl(data.patch, data.spells[id].icon) : undefined}
                  alt={data.spells[id]?.name ?? String(id)}
                  title={data.spells[id]?.name}
                  className="size-5 rounded-sm"
                />
              ))}
            </span>
          </label>
        )}
        {spells && want.spells && hasFlash && (
          <span className="flex items-center gap-1 text-[12px] text-mute">
            {t('Flash auf')}
            {(['auto', 'D', 'F'] as const).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setFlashKey(key)
                  save(FLASH_KEY, key)
                }}
                title={key === 'auto' ? t('Flash bleibt auf der Taste, auf der er gerade liegt') : undefined}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  flashKey === key ? 'bg-raised text-bone' : 'hover:text-bone'
                }`}
              >
                {key === 'auto' ? t('wie bisher') : key}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          className="primary h-9 px-5"
          disabled={(!doRunes && !doSpells) || phase.step === 'busy'}
          onClick={() => void run()}
        >
          {icon}
          {label}
        </button>
        <button
          className="text-[12px] text-mute underline-offset-2 hover:text-bone hover:underline"
          onClick={() => void copy()}
        >
          {t('Als Text kopieren')}
        </button>
        <span className={`text-[12px] ${phase.step === 'error' ? 'text-down' : 'text-mute'}`}>{hint}</span>
      </div>
    </div>
  )
}
