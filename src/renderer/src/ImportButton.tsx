import { AlertCircle, Check, Copy, Download, Info, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { FlashKey, ImportRequest, ItemSetStat, StaticData } from '../../shared/types'
import { percent, spellIconUrl } from './lib'
import { t } from '../../shared/i18n'
import { Checkbox, Segment } from './ui'

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
        <p className="text-xs text-mute">{t('Keine freie Runenseite. „')}{phase.page.name}{t('“ überschreiben?')}</p>
        <div className="flex gap-2">
          <button className="primary h-10 px-5" onClick={() => void run(phase.page.id)}>
            {t('Überschreiben')}
          </button>
          <button className="card h-10 px-4 text-mute hover:text-bone" onClick={() => setPhase({ step: 'idle' })}>
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

  const hasFlash = spells?.ids.includes(FLASH) ?? false

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Checkbox checked={want.runes} onChange={(runes) => choose({ ...want, runes })}>
          {t('Runen')}
        </Checkbox>
        {spells && (
          <Checkbox
            checked={want.spells}
            onChange={(checked) => choose({ ...want, spells: checked })}
            title={t`${percent(spells.pickRate, 0)} der Spiele`}
          >
            <span className="flex items-center gap-2.5">
              {t('Beschwörerzauber')}
              <span className="flex gap-1">
                {spells.ids.map((id) => (
                  <img
                    key={id}
                    src={data.spells[id] ? spellIconUrl(data.patch, data.spells[id].icon) : undefined}
                    alt={data.spells[id]?.name ?? String(id)}
                    title={data.spells[id]?.name}
                    className="size-[22px] rounded-md"
                  />
                ))}
              </span>
            </span>
          </Checkbox>
        )}
        {spells && want.spells && hasFlash && (
          <span className="flex items-center gap-2 text-xs text-mute">
            {t('Flash auf')}
            <Segment
              label={t('Flash auf')}
              value={flashKey}
              onChange={(key) => {
                setFlashKey(key)
                save(FLASH_KEY, key)
              }}
              options={[
                { value: 'auto', label: t('wie bisher'), title: t('Flash bleibt auf der Taste, auf der er gerade liegt') },
                { value: 'D', label: 'D' },
                { value: 'F', label: 'F' }
              ]}
            />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          className="primary h-10 px-5"
          disabled={(!doRunes && !doSpells) || phase.step === 'busy'}
          onClick={() => void run()}
        >
          {icon}
          {label}
        </button>
        <button className="link text-xs" onClick={() => void copy()}>
          <Copy size={13} aria-hidden />
          {t('Als Text kopieren')}
        </button>
        {hint && (
          <span className={`status text-xs ${phase.step === 'error' ? 'text-down' : ''}`}>
            {phase.step === 'error' ? <AlertCircle size={13} aria-hidden /> : <Info size={13} aria-hidden />}
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
