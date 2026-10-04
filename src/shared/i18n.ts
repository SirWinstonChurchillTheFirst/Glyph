// Interface language. German is the source language: the German text itself is the key, and
// `EN` holds its English counterpart. A text without an entry is shown in German.

import { EN } from './i18n-en'

export type Language = 'de' | 'en'

const STORAGE_KEY = 'glyph.language'

function initial(): Language {
  // Only the window has a store and a system language; the main process is told by the window.
  if (typeof localStorage === 'undefined') return 'de'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    // Fall through to the system language.
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

// Set while this module loads, so that texts in module-level constants come out right too.
let language: Language = initial()

export const getLanguage = (): Language => language

export function setLanguage(next: Language): void {
  language = next
}

/** Remembers the choice for the next start. Changing it takes a reload of the window. */
export function storeLanguage(next: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Without a store the choice lasts until the window closes.
  }
  language = next
}

/**
 * Translates a text. Works as a call, t('Runen'), and as a template tag, t`Seite „${name}“`.
 * In the dictionary a template's values appear as {} in order, or as {0}, {1} to reorder them.
 */
export function t(text: TemplateStringsArray | string, ...values: unknown[]): string {
  const source = typeof text === 'string' ? text : text.join('{}')
  // Spaces at the edges belong to the layout, not to the text.
  const [, lead, key, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(source)!
  const template = language === 'en' ? (EN[key] ?? key) : key
  let next = 0
  return lead + template.replace(/\{(\d*)\}/g, (_match, index: string) => String(values[index === '' ? next++ : Number(index)])) + trail
}

// ---------- Numbers ----------

/** A decimal number in the language's notation. */
export const decimal = (value: number, digits = 1): string =>
  language === 'de' ? value.toFixed(digits).replace('.', ',') : value.toFixed(digits)

export const percent = (value: number, digits = 1): string =>
  `${decimal(value * 100, digits)}${language === 'de' ? ' %' : '%'}`

export const count = (value: number): string => value.toLocaleString(language === 'de' ? 'de-DE' : 'en-US')
