import { describe, expect, it } from 'vitest'
import { assertDemoHost, buildScreens, planShots } from './shots'

describe('demo:shots', () => {
  it('refuses hosts outside the allowlist', () => {
    for (const url of [
      'https://cloudnativedays.no',
      'https://kontainerkonf.konf.run.evil.com',
      'https://evil.com/?kontainerkonf.konf.run',
      'http://kontainerkonf.konf.run',
    ])
      expect(() => assertDemoHost(url)).toThrow(/refusing/)
    expect(assertDemoHost('https://my.konf.app/x').hostname).toBe('my.konf.app')
  })

  it('skips auth screens without storage state', () => {
    const logs: string[] = []
    const shots = planShots(buildScreens(), false, (m) => logs.push(m))
    expect(shots.length).toBeGreaterThan(0)
    expect(shots.every((s) => !s.screen.auth)).toBe(true)
    expect(logs).toContain(
      'skip admin-dashboard: needs DEMO_SHOTS_STORAGE_STATE',
    )
    const withAuth = planShots(buildScreens(), true, () => {})
    expect(withAuth.some((s) => s.screen.name === 'kontroll-billing')).toBe(
      true,
    )
  })

  it('names are deterministic and unique', () => {
    const a = planShots(buildScreens(), true, () => {}).map((s) => s.file)
    const b = planShots(buildScreens(), true, () => {}).map((s) => s.file)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
    expect(a).toContain('home--mobile--dark.png')
    expect(a.find((f) => f.startsWith('speaker-page'))).toBeDefined()
  })
})
