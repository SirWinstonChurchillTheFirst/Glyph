// Draws the app icon and writes build/icon.png: `npm run icon`
// The mark is Glyph's win-rate bar: a range, the 50 % tick and the measured point.
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const SIZE = 512
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0d1218"/>
  <rect x="20" y="20" width="472" height="472" rx="96" fill="none" stroke="#1c2730" stroke-width="8"/>
  <line x1="96" y1="256" x2="416" y2="256" stroke="#2c3a46" stroke-width="14" stroke-linecap="round"/>
  <line x1="256" y1="150" x2="256" y2="362" stroke="#82909d" stroke-width="14" stroke-linecap="round"/>
  <rect x="236" y="226" width="150" height="60" rx="30" fill="#d6ad62" opacity="0.38"/>
  <circle cx="316" cy="256" r="46" fill="#d6ad62"/>
</svg>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  const html = `<body style="margin:0;background:transparent">${svg}</body>`
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 300))
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })

  const dir = path.join(__dirname, '..', 'build')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'icon.png'), image.resize({ width: SIZE, height: SIZE }).toPNG())
  app.quit()
})
