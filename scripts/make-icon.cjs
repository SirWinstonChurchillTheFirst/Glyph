// Draws the app icon and writes build/icon.png: `npm run icon`
// The mark is a sigil: the route of a rune page drawn as one line.
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const SIZE = 512
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#14121c"/>
  <rect x="20" y="20" width="472" height="472" rx="96" fill="#1d1a29" stroke="#383250" stroke-width="8"/>
  <path d="M168 150 L236 330 L344 168 L300 372" fill="none" stroke="#e0b866" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="168" cy="150" r="40" fill="#1d1a29" stroke="#e0b866" stroke-width="24"/>
  <circle cx="300" cy="372" r="26" fill="#e0b866"/>
  <circle cx="392" cy="300" r="11" fill="#aaa5c0" opacity="0.6"/>
  <circle cx="120" cy="330" r="11" fill="#aaa5c0" opacity="0.6"/>
  <circle cx="392" cy="372" r="11" fill="#aaa5c0" opacity="0.6"/>
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
