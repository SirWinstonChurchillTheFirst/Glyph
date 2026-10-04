import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BuildData, Dataset, StaticData, UpdateResult } from '../../shared/types'
import { buildDataset, latestVersion } from './updater'

const bundledDir = (): string => path.join(app.getAppPath(), 'data')
const updatedDir = (): string => path.join(app.getPath('userData'), 'data')

async function read(dir: string): Promise<Dataset | null> {
  try {
    const [builds, staticData] = await Promise.all([
      readFile(path.join(dir, 'builds.json'), 'utf8'),
      readFile(path.join(dir, 'static.json'), 'utf8')
    ])
    return { builds: JSON.parse(builds) as BuildData, static: JSON.parse(staticData) as StaticData }
  } catch {
    return null
  }
}

let cached: Dataset | null = null

/** The dataset shipped with the app, unless an in-app update has stored a newer one. */
export async function getDataset(): Promise<Dataset> {
  if (cached) return cached
  const [bundled, updated] = await Promise.all([read(bundledDir()), read(updatedDir())])
  const newest =
    bundled && updated
      ? updated.builds.generatedAt > bundled.builds.generatedAt
        ? updated
        : bundled
      : (updated ?? bundled)
  if (!newest) throw new Error('Keine Build-Daten gefunden. Bitte `npm run update-data` ausführen.')
  return (cached = newest)
}

export async function checkUpdate(): Promise<string | null> {
  try {
    const [latest, current] = await Promise.all([latestVersion(), getDataset()])
    return latest !== current.static.patch ? latest : null
  } catch {
    return null
  }
}

export async function updateDataset(): Promise<UpdateResult> {
  try {
    const dataset = await buildDataset({ locale: cached?.static.locale })
    await mkdir(updatedDir(), { recursive: true })
    await Promise.all([
      writeFile(path.join(updatedDir(), 'builds.json'), JSON.stringify(dataset.builds)),
      writeFile(path.join(updatedDir(), 'static.json'), JSON.stringify(dataset.static))
    ])
    cached = dataset
    return { ok: true, dataset }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
