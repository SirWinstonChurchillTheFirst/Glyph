import type { Facing } from '../../shared/recommend'
import type { DraftSlot, StaticData } from '../../shared/types'
import { ROLE_LABELS } from './lib'
import { ChampionIcon } from './ui'
import { t } from '../../shared/i18n'

const FACING: [flag: keyof Facing, label: string, effect: string][] = [
  ['ad', t('Viel physischer Schaden'), t('bevorzugt Rüstung')],
  ['ap', t('Viel magischer Schaden'), t('bevorzugt Magieresistenz')],
  ['cc', t('Viel Crowd Control'), t('bevorzugt Zähigkeit')]
]

function Team({
  title,
  slots,
  data,
  activeId,
  onPick
}: {
  title: string
  slots: DraftSlot[]
  data: StaticData
  activeId?: number | null
  onPick?: (id: number) => void
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] text-mute">{title}</h3>
      <div className="space-y-0.5">
        {slots.map((slot, index) => {
          const champion = slot.championId !== null ? data.champions[slot.championId] : undefined
          const content = (
            <>
              <ChampionIcon id={slot.championId} data={data} size={24} />
              <span className={`min-w-0 flex-1 truncate ${champion ? '' : 'text-mute/60'}`}>
                {champion?.name ?? t('noch offen')}
              </span>
              <span className="text-[11px] text-mute">
                {slot.isMe ? t('du') : slot.championId === activeId ? 'Lane' : slot.role ? ROLE_LABELS[slot.role] : ''}
              </span>
            </>
          )
          const base = 'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left'
          return onPick && champion ? (
            <button
              key={index}
              onClick={() => onPick(slot.championId!)}
              title={t('Als Lane-Gegner setzen')}
              className={`${base} hover:bg-raised ${slot.championId === activeId ? 'bg-raised' : ''}`}
            >
              {content}
            </button>
          ) : (
            <div key={index} className={`${base} ${slot.isMe ? 'bg-raised' : ''}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface RailProps {
  data: StaticData
  myTeam: DraftSlot[]
  theirTeam: DraftSlot[]
  opponentId: number | null
  onOpponent: (id: number | null) => void
  facing: Facing
  /** Flags derived from the draft, so the user can tell them from their own. */
  derived: Facing
  onFacing: (flag: keyof Facing, value: boolean) => void
}

export function Rail(props: RailProps) {
  const { data, myTeam, theirTeam, opponentId, onOpponent, facing, derived, onFacing } = props
  const inDraft = myTeam.length > 0
  const opponent = opponentId !== null ? data.champions[opponentId] : undefined

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line px-3.5 py-4">
      {inDraft ? (
        <>
          <Team title={t('Dein Team')} slots={myTeam} data={data} />
          <Team title={t('Gegner · Klick setzt die Lane')} slots={theirTeam} data={data} activeId={opponentId} onPick={onOpponent} />
        </>
      ) : (
        <div>
          <h3 className="mb-1.5 text-[11px] text-mute">{t('Lane-Gegner')}</h3>
          {opponent ? (
            <div className="flex items-center gap-2 rounded bg-raised px-1.5 py-1">
              <ChampionIcon id={opponentId} data={data} size={24} />
              <span className="min-w-0 flex-1 truncate">{opponent.name}</span>
              <button onClick={() => onOpponent(null)} className="text-[11px] text-mute hover:text-bone">
                {t('entfernen')}
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-mute">{t('Keiner gewählt – die Analyse summiert die häufigsten Matchups.')}</p>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-[11px] text-mute">{t('Was steht dir gegenüber?')}</h3>
        {FACING.map(([flag, label, effect]) => (
          <label key={flag} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-raised">
            <input
              type="checkbox"
              checked={facing[flag]}
              onChange={(event) => onFacing(flag, event.target.checked)}
              className="mt-0.5 accent-[#d6ad62]"
            />
            <span>
              {label}
              <span className="block text-[11px] text-mute">
                {effect}
                {derived[flag] && t(' · aus dem Draft')}
              </span>
            </span>
          </label>
        ))}
        <p className="mt-1.5 px-1.5 text-[11px] text-mute">
          {t('Für Poke, Engage oder Scaling gibt es keine Item-Daten, aus denen sich eine Anpassung belegen ließe.')}
        </p>
      </div>

    </aside>
  )
}
