// CommonJS module (run by `pnpm run lint:routers` via node); imported here
// through esModuleInterop, the same way tenancy-ratchet.test.ts loads its own.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ratchet from './router-test-ratchet'
import baseline from './router-test.baseline.json'

const { findUntested, readRouters, updateBaseline } = ratchet as unknown as {
  findUntested: (
    routers: { key: string; variable: string }[],
    sources: string[],
  ) => string[]
  readRouters: () => { key: string; variable: string }[]
  updateBaseline: (
    current: string[],
    opts?: { allowIncrease?: boolean; baselinePath?: string },
  ) => number
}

const routers = [
  { key: 'signing', variable: 'signingRouter' },
  { key: 'organization', variable: 'organizationRouter' },
]

describe('router-test detector', () => {
  it('counts a co-located test that names the router export', () => {
    expect(findUntested(routers, ['signingRouter.createCaller(ctx)'])).toEqual([
      'organization',
    ])
  })

  it('counts a whole-app caller test', () => {
    expect(
      findUntested(routers, [
        'const caller = appRouter.createCaller(ctx)\ncaller.signing.getContract({})',
      ]),
    ).toEqual(['organization'])
  })

  it('does NOT count a bare field access that happens to match the key', () => {
    // `conference.organization._ref` is not a test of `organizationRouter`.
    // Scoring it as one is exactly how four untested routers read as covered.
    expect(findUntested(routers, ['doc.conference.organization._ref'])).toEqual(
      ['organization', 'signing'],
    )
  })

  it('reads every mounted router out of _app.ts', () => {
    const keys = readRouters().map((r) => r.key)
    expect(keys).toContain('signing')
    expect(keys.length).toBeGreaterThan(20)
  })
})

describe('router-test baseline', () => {
  it('holds only the pre-existing debt, and signing is not in it', () => {
    expect(baseline.untested).toEqual([
      'agents',
      'domainVerification',
      'notification',
      'organization',
    ])
    expect(baseline.count).toBe(baseline.untested.length)
  })

  it('refuses to add a router without --allow-increase', () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'router-ratchet-')),
      'baseline.json',
    )
    fs.writeFileSync(file, JSON.stringify({ untested: ['agents'] }))

    expect(updateBaseline(['agents', 'signing'], { baselinePath: file })).toBe(
      1,
    )
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).untested).toEqual([
      'agents',
    ])

    expect(
      updateBaseline(['agents', 'signing'], {
        baselinePath: file,
        allowIncrease: true,
      }),
    ).toBe(0)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).untested).toEqual([
      'agents',
      'signing',
    ])
  })

  it('ratchets down freely', () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'router-ratchet-')),
      'baseline.json',
    )
    fs.writeFileSync(file, JSON.stringify({ untested: ['agents', 'signing'] }))

    expect(updateBaseline(['agents'], { baselinePath: file })).toBe(0)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).untested).toEqual([
      'agents',
    ])
  })
})
