// Regenerates the bundled dataset: `npm run update-data [-- --locale de_DE]`
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildDataset } from '../src/main/data/updater.ts'

const localeFlag = process.argv.indexOf('--locale')
const locale = localeFlag > -1 ? process.argv[localeFlag + 1] : undefined
const dir = path.join(import.meta.dirname, '..', 'data')

const dataset = await buildDataset({
  locale,
  onProgress: (done, total) => process.stdout.write(`\r${done}/${total} Champions`)
})

await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, 'builds.json'), JSON.stringify(dataset.builds))
await writeFile(path.join(dir, 'static.json'), JSON.stringify(dataset.static))

const count = Object.keys(dataset.builds.champions).length
console.log(`\nPatch ${dataset.builds.patch} (Data Dragon ${dataset.static.patch}), ${count} Champions -> ${dir}`)
