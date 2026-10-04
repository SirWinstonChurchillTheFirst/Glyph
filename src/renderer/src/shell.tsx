import { Search as SearchIcon, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LeagueStatus } from '../../shared/types'
import { getLanguage, storeLanguage, t } from '../../shared/i18n'

const STATUS: Record<LeagueStatus, { label: string; dot: string }> = {
  'not-running': { label: t('League nicht gestartet'), dot: 'bg-mute/50' },
  starting: { label: t('League startet'), dot: 'bg-gold loading' },
  unreachable: { label: t('Client nicht erreichbar'), dot: 'bg-down' },
  idle: { label: t('League verbunden'), dot: 'bg-ok' },
  'champ-select': { label: t('Champion Select'), dot: 'bg-ok' },
  'in-game': { label: t('Im Spiel'), dot: 'bg-ok' }
}

export function ConnectionStatus({ status }: { status: LeagueStatus }) {
  const { label, dot } = STATUS[status]
  return (
    <span className="flex h-6 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-[12px] text-mute">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export interface DataInfo {
  statsPatch: string | null
  gamePatch: string
  newPatch: string | null
  updating: boolean
  updateError?: string
  onUpdate: () => void
}

/** Small menu behind the gear: who is logged in, where the data comes from, patch update. */
function InfoMenu({ summonerName, info }: { summonerName?: string; info: DataInfo }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-mute">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )

  return (
    <div ref={ref} className="no-drag relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={t('Daten und Einstellungen')}
        className={`relative flex size-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-raised hover:text-bone ${open ? 'bg-raised text-bone' : ''}`}
      >
        <Settings size={15} />
        {info.newPatch && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-gold" />}
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-30 w-72 rounded-xl border border-line bg-surface p-3 text-[12px] shadow-2xl shadow-black/60">
          {summonerName && row(t('Angemeldet als'), summonerName)}
          {row(t('Statistiken'), `OP.GG, Ranked Solo${info.statsPatch ? `, Patch ${info.statsPatch}` : ''}`)}
          {row(t('Spieldaten'), `Data Dragon ${info.gamePatch}`)}
          {row(t('Klassen und Wertungen'), 'Meraki Analytics')}
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-mute">{t('Sprache')}</span>
            <span className="flex gap-1">
              {(['de', 'en'] as const).map((language) => (
                <button
                  key={language}
                  onClick={() => {
                    if (language === getLanguage()) return
                    storeLanguage(language)
                    // Texts are resolved when the interface is built, so a new language needs a fresh start.
                    void window.api.setLanguage(language).then(() => location.reload())
                  }}
                  className={`rounded px-2 py-0.5 transition-colors ${
                    language === getLanguage() ? 'bg-raised text-bone' : 'text-mute hover:text-bone'
                  }`}
                >
                  {language === 'de' ? 'Deutsch' : 'English'}
                </button>
              ))}
            </span>
          </div>
          {info.newPatch && (
            <button
              onClick={info.onUpdate}
              disabled={info.updating}
              className="primary mt-2 h-8 w-full text-[12px]"
            >
              {info.updating ? t('Aktualisiere …') : t`Spieldaten für ${info.newPatch} laden`}
            </button>
          )}
          {info.updateError && <p className="mt-2 text-down">{info.updateError}</p>}
        </div>
      )}
    </div>
  )
}

export function Header({
  status,
  summonerName,
  info,
  onSearch
}: {
  status: LeagueStatus
  summonerName?: string
  info: DataInfo | null
  onSearch: () => void
}) {
  return (
    // Right padding keeps clear of the window buttons drawn by the system.
    <div className="drag flex h-11 shrink-0 items-center gap-3 border-b border-line pr-[150px] pl-4">
      <span className="display text-[16px] font-semibold tracking-[0.2em]">{t('GLYPH')}</span>
      <ConnectionStatus status={status} />
      {info && (
        <>
          <button
            onClick={onSearch}
            className="no-drag ml-auto flex h-7 w-56 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[12px] text-mute transition-colors hover:border-mute/60 hover:text-bone"
          >
            <SearchIcon size={13} />
            {t('Suchen')}
            <kbd className="ml-auto rounded border border-line px-1 font-sans text-[10px]">{t('Strg K')}</kbd>
          </button>
          <InfoMenu summonerName={summonerName} info={info} />
        </>
      )}
    </div>
  )
}

export function Footer() {
  return (
    <footer className="shrink-0 px-4 py-1 text-[10px] text-mute/50">
      {t('Inoffizielles Fan-Projekt · nicht von Riot Games unterstützt')}
    </footer>
  )
}
