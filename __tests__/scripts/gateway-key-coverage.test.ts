import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

describe('gateway key rotation coverage', () => {
  const root = process.cwd()
  const servicesDir = join(root, 'services')

  const envelopeServices = readdirSync(servicesDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() && existsSync(join(servicesDir, d.name, 'service.cue')),
    )
    .map((d) => d.name)
    .filter((name) => {
      const worker = join(servicesDir, name, 'src/worker.ts')
      return (
        existsSync(worker) &&
        readFileSync(worker, 'utf8').includes('GATEWAY_PUBLIC_KEY')
      )
    })
    .sort()

  it('verifies non-empty envelope service set containing tenant-directory', () => {
    expect(
      envelopeServices.length,
      'No services found with GATEWAY_PUBLIC_KEY',
    ).toBeGreaterThan(0)
    expect(
      envelopeServices,
      'Expected tenant-directory in envelope services',
    ).toContain('tenant-directory')
  })

  it('rotates every verifying service and sets gateway private key', () => {
    const script = readFileSync(
      join(root, 'scripts/rotate-gateway-key.sh'),
      'utf8',
    )
    const match = script.match(/for svc in ([^;]+); do/)
    expect(match, 'rotate-gateway-key.sh loop not found').toBeTruthy()
    const scriptServices = (match ? match[1].trim().split(/\s+/) : []).sort()

    for (const svc of envelopeServices) {
      expect(
        scriptServices,
        `rotate-gateway-key.sh missing service: ${svc}`,
      ).toContain(svc)
    }
    expect(scriptServices).toEqual(envelopeServices)
    expect(
      script,
      'rotate-gateway-key.sh missing ENVELOPE_PRIVATE_KEY on api',
    ).toContain('put api ENVELOPE_PRIVATE_KEY')
  })

  it('documents every verifying service in docs/SECRETS.md', () => {
    const secrets = readFileSync(join(root, 'docs/SECRETS.md'), 'utf8')
    const row = secrets
      .split('\n')
      .find((l) => l.startsWith('| `GATEWAY_PUBLIC_KEY`'))
    expect(
      row,
      'docs/SECRETS.md row for GATEWAY_PUBLIC_KEY not found',
    ).toBeDefined()

    for (const svc of envelopeServices) {
      expect(row, `docs/SECRETS.md missing konf-${svc}`).toContain(
        `konf-${svc}`,
      )
    }
  })
})
