import { chromium } from 'playwright'
const [, , url, channel = 'chrome'] = process.argv
const b = await chromium.launch({ channel: channel === 'none' ? undefined : channel, headless: false })
const p = await b.newPage()
p.on('console', (m) => console.log('console:', m.text().slice(0, 400)))
await p.goto(url)
await p.waitForFunction(() => document.title.startsWith('DONE'), null, { timeout: 180000 })
await b.close()
