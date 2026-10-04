// Regenerates the bundled static game data: `npm run update-data`
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildStatic } from '../src/main/data/updater.ts'

const dir = path.join(import.meta.dirname, '..', 'data')
const data = await buildStatic()

await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, 'static.json'), JSON.stringify(data))

const champions = Object.values(data.champions)
const rated = champions.filter((champion) => champion.ratings).length
console.log(`Data Dragon ${data.patch}: ${champions.length} Champions (${rated} mit Klassen/Wertungen) -> ${dir}`)
