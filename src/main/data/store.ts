import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { StaticData, UpdateResult } from '../../shared/types'
import { buildStatic, latestVersion } from './updater'
import { t } from '../../shared/i18n'

const bundledFile = (): string => path.join(app.getAppPath(), 'data', 'static.json')
const updatedFile = (): string => path.join(app.getPath('userData'), 'data', 'static.json')

async function read(file: string): Promise<StaticData | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as StaticData
  } catch {
    return null
  }
}

/** "16.19.1" -> comparable number */
const versionValue = (version: string): number =>
  version.split('.').reduce((value, part) => value * 1000 + Number(part), 0)

let cached: StaticData | null = null

/** The static data shipped with the app, unless an in-app update has stored a newer one. */
export async function getStatic(): Promise<StaticData> {
  if (cached) return cached
  const [bundled, updated] = await Promise.all([read(bundledFile()), read(updatedFile())])
  const newest =
    bundled && updated
      ? versionValue(updated.patch) > versionValue(bundled.patch)
        ? updated
        : bundled
      : (updated ?? bundled)
  // A file written by an older app version lacks the fields the analysis needs.
  const usable = newest && Object.values(newest.champions)[0]?.slug && newest.spells ? newest : bundled
  if (!usable) throw new Error(t('Keine Spieldaten gefunden. Bitte `npm run update-data` ausführen.'))
  return (cached = usable)
}

export async function checkUpdate(): Promise<string | null> {
  try {
    const [latest, current] = await Promise.all([latestVersion(), getStatic()])
    return latest !== current.patch ? latest : null
  } catch {
    return null
  }
}

export async function updateStatic(): Promise<UpdateResult> {
  try {
    const data = await buildStatic()
    await mkdir(path.dirname(updatedFile()), { recursive: true })
    await writeFile(updatedFile(), JSON.stringify(data))
    cached = data
    return { ok: true, data }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
