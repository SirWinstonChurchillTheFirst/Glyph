import type { BuildSet, StaticData } from '../../shared/types'
import { count, pageName } from './lib'
import { ItemIcon, PickBar, RuneIcon, WinBar, type Detail } from './ui'
import { t } from '../../shared/i18n'

const TAGS: Record<string, string> = {
  Armor: t('Rüstung'),
  SpellBlock: t('Magieresistenz'),
  Tenacity: t('Zähigkeit'),
  Health: t('Leben'),
  Damage: t('Angriffsschaden'),
  SpellDamage: t('Fähigkeitsstärke'),
  AttackSpeed: t('Angriffstempo'),
  CriticalStrike: t('Kritische Treffer'),
  AbilityHaste: t('Fähigkeitstempo'),
  Mana: 'Mana',
  LifeSteal: t('Lebensraub'),
  ArmorPenetration: t('Rüstungsdurchdringung'),
  MagicPenetration: t('Magiedurchdringung'),
  NonbootsMovement: t('Lauftempo'),
  Boots: t('Stiefel'),
  Active: t('Aktiv'),
  Slow: t('Verlangsamung')
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line py-1.5">
      <span className="text-mute">{label}</span>
      <span className="flex items-center gap-3">{children}</span>
    </div>
  )
}

/** Drill-down for one item or rune, using the statistics of the build set currently on screen. */
export function Drawer({
  detail,
  data,
  builds,
  scope,
  onClose,
  onPage
}: {
  detail: Detail
  data: StaticData
  builds: BuildSet | null
  scope: string
  onClose: () => void
  onPage: (key: string) => void
}) {
  const none = <p className="text-mute">{t('In der aktuellen Auswahl gibt es dazu keine Statistik.')}</p>
  let body: React.ReactNode

  if (detail.kind === 'item') {
    const item = data.items[detail.id]
    const overall = builds?.items.find((entry) => entry.ids[0] === detail.id)
    const slots = (builds?.slots ?? [])
      .map((slot, index) => ({ index, entry: slot.find((option) => option.ids[0] === detail.id) }))
      .filter((slot) => slot.entry)
    const boots = builds?.boots.find((entry) => entry.ids[0] === detail.id)
    const cores = (builds?.cores ?? []).filter((entry) => entry.ids.includes(detail.id)).slice(0, 4)

    body = (
      <>
        <div className="flex items-center gap-3">
          <ItemIcon id={detail.id} data={data} size={48} />
          <div>
            <h2 className="display text-xl leading-tight">{item?.name ?? `Item ${detail.id}`}</h2>
            <div className="text-xs text-mute">{item ? `${count(item.gold)} Gold` : ''}</div>
          </div>
        </div>
        {item && item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-raised px-2 py-0.5 text-xs text-mute">
                {TAGS[tag] ?? tag}
              </span>
            ))}
          </div>
        )}
        {item?.text && <p className="mt-3 text-xs text-bone/80 select-text">{item.text}</p>}

        <h3 className="display mt-5 mb-1 text-base">{t('Nutzung')}</h3>
        {!overall && slots.length === 0 && !boots ? (
          none
        ) : (
          <>
            {overall && (
              <Row label={t("In allen Spielen")}>
                <PickBar stat={overall} />
                <WinBar stat={overall} compact />
              </Row>
            )}
            {boots && (
              <Row label={t("Als Stiefel")}>
                <PickBar stat={boots} />
                <WinBar stat={boots} compact />
              </Row>
            )}
            {slots.map(({ index, entry }) => (
              <Row key={index} label={t`Als ${index + 1}. Item`}>
                <PickBar stat={entry!} />
                <WinBar stat={entry!} compact />
              </Row>
            ))}
          </>
        )}

        {cores.length > 0 && (
          <>
            <h3 className="display mt-5 mb-1 text-base">{t('Gekauft zusammen mit')}</h3>
            {cores.map((entry) => (
              <div key={entry.ids.join('-')} className="flex items-center justify-between gap-2 border-t border-line py-1.5">
                <span className="flex gap-1">
                  {entry.ids.map((id, index) => (
                    <ItemIcon key={index} id={id} data={data} size={24} />
                  ))}
                </span>
                <WinBar stat={entry} compact />
              </div>
            ))}
          </>
        )}
        <p className="mt-5 text-xs text-mute">{t('Durchschnittliche Kaufzeit: liefert die Quelle nicht.')}</p>
      </>
    )
  } else {
    const rune = data.runes[detail.id]
    const primary = builds?.runeUse.primary.find((entry) => entry.id === detail.id)
    const secondary = builds?.runeUse.secondary.find((entry) => entry.id === detail.id)
    const pages = (builds?.pages ?? []).filter((page) => page.variants.some((variant) => variant.perks.includes(detail.id)))
    const isKeystone = rune?.row === 0

    // Keystones against each other: pages summed by keystone.
    const keystones = new Map<number, { games: number; wins: number }>()
    for (const page of builds?.pages ?? []) {
      const sum = keystones.get(page.keystone) ?? { games: 0, wins: 0 }
      sum.games += page.games
      sum.wins += page.wins
      keystones.set(page.keystone, sum)
    }

    body = (
      <>
        <div className="flex items-center gap-3">
          <RuneIcon id={detail.id} data={data} size={48} />
          <div>
            <h2 className="display text-xl leading-tight">{rune?.name}</h2>
            <div className="text-xs text-mute">{rune ? data.styles[rune.style]?.name : ''}</div>
          </div>
        </div>
        {rune?.text && <p className="mt-3 text-xs text-bone/80 select-text">{rune.text}</p>}

        <h3 className="display mt-5 mb-1 text-base">{t('Nutzung')}</h3>
        {!primary && !secondary ? (
          none
        ) : (
          <>
            {primary && (
              <Row label={t("Im Hauptbaum")}>
                <PickBar stat={primary} />
                <WinBar stat={primary} compact />
              </Row>
            )}
            {secondary && (
              <Row label={t("Im Nebenbaum")}>
                <PickBar stat={secondary} />
                <WinBar stat={secondary} compact />
              </Row>
            )}
          </>
        )}

        {isKeystone && keystones.size > 1 && (
          <>
            <h3 className="display mt-5 mb-1 text-base">{t('Im Vergleich der Keystones')}</h3>
            {[...keystones].map(([id, sum]) => (
              <Row key={id} label={data.runes[id]?.name ?? String(id)}>
                <span className="display text-xs text-mute">{count(sum.games)}</span>
                <WinBar stat={sum} compact />
              </Row>
            ))}
          </>
        )}

        {pages.length > 0 && (
          <>
            <h3 className="display mt-5 mb-1 text-base">{t('Teil dieser Builds')}</h3>
            {pages.map((page) => (
              <button
                key={page.key}
                onClick={() => onPage(page.key)}
                className="flex w-full items-center justify-between gap-2 border-t border-line py-1.5 text-left hover:text-gold"
              >
                <span className="truncate">{pageName(page, data)}</span>
                <WinBar stat={page} compact />
              </button>
            ))}
          </>
        )}
        <p className="mt-5 text-xs text-mute">{t('Beste und schwerste Matchups je Rune: liefert die Quelle nicht.')}</p>
      </>
    )
  }

  return (
    <aside className="drawer absolute inset-y-0 right-0 z-10 flex w-[330px] flex-col border-l border-line bg-surface [box-shadow:var(--shadow-pop)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-mute">
        <span className="truncate">{builds ? scope : t('Öffne einen Champion für Statistiken')}</span>
        <button onClick={onClose} className="shrink-0 pl-3 text-sm hover:text-bone" aria-label={t('Details schließen')}>
          {t('Schließen')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
    </aside>
  )
}
