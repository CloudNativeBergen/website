#!/usr/bin/env tsx
/**
 * `pnpm demo:shots` (#2150): screenshots the KontainerKonf demo for marketing.
 *
 * Only the demo hosts are allowed, so this cannot capture a real customer's
 * site. Logged-in screens need DEMO_SHOTS_STORAGE_STATE (a Playwright
 * storage-state JSON for an organizer of the demo; never commit it) and are
 * skipped without it.
 *
 * Env: DEMO_SHOTS_STORAGE_STATE, DEMO_SHOTS_OUT (default ./demo-shots),
 * DEMO_SHOTS_SITE (default https://kontainerkonf.konf.run),
 * DEMO_SHOTS_KONTROLL (default https://my.konf.app), DEMO_SHOTS_ONLY
 * (substring filter on the screen name).
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { generateDemoFixtures } from './fixtures/generate'
import { DEMO_ORG_ID, DEMO_PREFIX, DEMO_SEED } from './seed'

export const ALLOWED_HOSTS = ['kontainerkonf.konf.run', 'my.konf.app']
export const FROZEN_TIME = new Date('2026-11-01T10:00:00Z')

export type Viewport = 'desktop' | 'mobile'
export type Theme = 'light' | 'dark'
export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 393, height: 852 },
}

export interface Screen {
  name: string
  app: 'site' | 'kontroll'
  path: string
  auth: boolean
  /** Kontroll has no dark mode; the site follows prefers-color-scheme. */
  themes: Theme[]
}

export interface Shot {
  screen: Screen
  viewport: Viewport
  theme: Theme
  file: string
}

export function assertDemoHost(url: string): URL {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname))
    throw new Error(
      `refusing ${u.origin}: only ${ALLOWED_HOSTS.join(', ')} are allowed`,
    )
  return u
}

export function buildScreens(): Screen[] {
  const { sanity } = generateDemoFixtures({ seed: DEMO_SEED, now: FROZEN_TIME })
  const speaker = sanity.speakers[0].slug
  const proposal = `${DEMO_PREFIX}talk.${sanity.proposals[0].key}`
  const both: Theme[] = ['light', 'dark']
  const site = (name: string, path: string, auth = false): Screen => ({
    name,
    app: 'site',
    path,
    auth,
    themes: both,
  })
  const kontroll = (name: string, path: string): Screen => ({
    name,
    app: 'kontroll',
    path,
    auth: true,
    themes: ['light'],
  })
  return [
    site('home', '/'),
    site('program', '/program'),
    site('speakers', '/speaker'),
    site('speaker-page', `/speaker/${speaker}`),
    site('sponsors', '/sponsor'),
    site('tickets', '/tickets'),
    site('cfp', '/cfp'),
    site('admin-dashboard', '/admin', true),
    site('admin-proposals', '/admin/proposals', true),
    site('admin-proposal-review', `/admin/proposals/${proposal}`, true),
    site('admin-schedule', '/admin/schedule', true),
    site('admin-sponsor-crm', '/admin/sponsors/crm', true),
    site('admin-tickets', '/admin/tickets', true),
    site('speaker-portal', '/cfp/list', true),
    kontroll('kontroll-org', `/orgs/${DEMO_ORG_ID}`),
    kontroll('kontroll-stats', '/operator/stats'),
    kontroll('kontroll-billing', `/orgs/${DEMO_ORG_ID}/billing`),
  ]
}

export function planShots(
  screens: Screen[],
  hasAuth: boolean,
  log: (m: string) => void = console.log,
): Shot[] {
  const shots: Shot[] = []
  for (const screen of screens) {
    if (screen.auth && !hasAuth) {
      log(`skip ${screen.name}: needs DEMO_SHOTS_STORAGE_STATE`)
      continue
    }
    for (const viewport of ['desktop', 'mobile'] as const)
      for (const theme of screen.themes)
        shots.push({
          screen,
          viewport,
          theme,
          file: `${screen.name}--${viewport}--${theme}.png`,
        })
  }
  return shots
}

async function main() {
  const env = process.env
  const bases = {
    site: assertDemoHost(
      env.DEMO_SHOTS_SITE ?? 'https://kontainerkonf.konf.run',
    ),
    kontroll: assertDemoHost(env.DEMO_SHOTS_KONTROLL ?? 'https://my.konf.app'),
  }
  const state = env.DEMO_SHOTS_STORAGE_STATE
  if (state && !existsSync(state)) throw new Error(`no such file: ${state}`)
  const out = env.DEMO_SHOTS_OUT ?? 'demo-shots'
  mkdirSync(out, { recursive: true })
  const shots = planShots(buildScreens(), Boolean(state)).filter((s) =>
    s.screen.name.includes(env.DEMO_SHOTS_ONLY ?? ''),
  )

  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    for (const s of shots) {
      const ctx = await browser.newContext({
        viewport: VIEWPORTS[s.viewport],
        deviceScaleFactor: 2,
        colorScheme: s.theme,
        reducedMotion: 'reduce',
        locale: 'en-GB',
        timezoneId: 'Europe/Oslo',
        storageState: s.screen.auth ? state : undefined,
      })
      await ctx.clock.setFixedTime(FROZEN_TIME)
      const page = await ctx.newPage()
      await page.goto(new URL(s.screen.path, bases[s.screen.app]).href, {
        waitUntil: 'networkidle',
      })
      // A redirect (e.g. to sign-in elsewhere) must not leave the demo hosts.
      assertDemoHost(page.url())
      await page.screenshot({
        path: join(out, s.file),
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      })
      console.log(`ok ${s.file}`)
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1]?.endsWith('shots.ts'))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
