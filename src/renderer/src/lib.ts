import { useCallback, useEffect, useState } from 'react'
import type { Role, RunePageStat, RuneVariant, StaticData } from '../../shared/types'

const CDN = 'https://ddragon.leagueoflegends.com/cdn'

export const splashUrl = (key: string): string => `${CDN}/img/champion/splash/${key}_0.jpg`
export const championIconUrl = (patch: string, key: string): string => `${CDN}/${patch}/img/champion/${key}.png`
export const itemIconUrl = (patch: string, id: number): string => `${CDN}/${patch}/img/item/${id}.png`
export const perkIconUrl = (icon: string): string => `${CDN}/img/${icon}`

export const ROLE_LABELS: Record<Role, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  adc: 'ADC',
  support: 'Support'
}

export const percent = (value: number, digits = 1): string =>
  `${(value * 100).toFixed(digits).replace('.', ',')} %`
export const count = (value: number): string => value.toLocaleString('de-DE')

export const pageName = (page: RunePageStat, data: StaticData): string =>
  `${data.runes[page.keystone]?.name ?? page.keystone} + ${data.styles[page.subStyle]?.name ?? page.subStyle}`

/** Plain-text rune page, the fallback when the client cannot be reached. */
export function runesAsText(title: string, page: RunePageStat, variant: RuneVariant, data: StaticData): string {
  const names = (ids: number[]): string => ids.map((id) => data.runes[id]?.name ?? id).join(', ')
  return [
    title,
    `${data.styles[page.primaryStyle]?.name}: ${names(variant.perks.slice(0, 4))}`,
    `${data.styles[page.subStyle]?.name}: ${names(variant.perks.slice(4))}`,
    `Shards: ${variant.shards.map((id) => data.shards[id]?.name ?? id).join(', ')}`
  ].join('\n')
}

// ---------- Async data with a shared cache, so switching tabs never refetches ----------

const cache = new Map<string, Promise<unknown>>()

export interface Async<T> {
  data: T | null
  error: string | null
  loading: boolean
  retry: () => void
}

export function useAsync<T>(key: string | null, load: () => Promise<T>): Async<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (key === null) return
    let current = true
    let promise = cache.get(key) as Promise<T> | undefined
    if (!promise) {
      promise = load()
      cache.set(key, promise)
      promise.catch(() => cache.delete(key))
    }
    promise.then(
      (data) => current && setState({ key, data, error: null }),
      (error: Error) =>
        // Electron prefixes errors that cross the process boundary.
        current && setState({ key, data: null, error: error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    )
    return () => {
      current = false
    }
    // `load` is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const fresh = state.key === key
  return {
    data: fresh ? state.data : null,
    error: fresh ? state.error : null,
    loading: key !== null && !fresh,
    retry
  }
}
