/**
 * Dev tool: prove the SpeakerShareWrapper square never clips its own content.
 *
 * The card is an `aspect-square overflow-hidden` box sized entirely in `cqw`,
 * so any tier whose size budget exceeds 100cqh clips the footer silently.
 * This renders the card's stories at real container widths (320 = `/cfp/list`
 * desktop sidebar, 377 = 393px phone under the page's `px-2`, wider = tablet)
 * and reports clip = scrollHeight - clientHeight per width. Every row must be
 * 0px.
 *
 * Usage: node scripts/measure-share-card-clip.mjs
 * (needs a running Storybook; SHOOT_PORT overrides the default :6006)
 */
import { chromium } from 'playwright'

const PORT = Number(process.env.SHOOT_PORT) || 6006
const BASE = `http://localhost:${PORT}`
const stories = {
  'no title': 'components-cfp-speakersharewrapper--no-title',
  'short title': 'components-cfp-speakersharewrapper--default',
  'long title': 'components-cfp-speakersharewrapper--long-title',
}
const widths = [320, 377, 420, 460, 600]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 900 } })
for (const [label, id] of Object.entries(stories)) {
  await page.goto(`${BASE}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'networkidle',
  })
  await page.evaluate(() => document.fonts.ready)
  const rows = []
  for (const w of widths) {
    const r = await page.evaluate(async (w) => {
      const card = document.querySelector('.aspect-square')
      // Pin every ancestor (incl. the decorator div, which carries its own
      // inline width) to the target width so the card's container is exactly w.
      let el = card.parentElement
      while (el && el.id !== 'storybook-root') {
        el.style.width = w + 'px'
        el.style.maxWidth = 'none'
        el = el.parentElement
      }
      await new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res)),
      )
      return {
        cardW: card.clientWidth,
        clip: card.scrollHeight - card.clientHeight,
      }
    }, w)
    rows.push({ width: w, ...r })
  }
  console.log(`\n${label} (${id})`)
  for (const r of rows)
    console.log(
      `  wrapper ${r.width}px  card content ${r.cardW}px  clip ${r.clip}px`,
    )
}
await browser.close()
