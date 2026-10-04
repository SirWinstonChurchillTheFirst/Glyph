// Prints the installer's SHA-256 for the release notes; runs at the end of `npm run dist`.
const { createHash } = require('node:crypto')
const { readFileSync, statSync } = require('node:fs')
const path = require('node:path')

const file = path.join(__dirname, '..', 'dist', 'Glyph-Setup.exe')
const hash = createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()
console.log(`
${file}
${(statSync(file).size / 1e6).toFixed(1)} MB
SHA-256: ${hash}`)
