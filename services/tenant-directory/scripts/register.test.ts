import { describe, expect, it } from 'vitest'
import type { CustomHostnames } from '../src/data/cloudflare'
import { registerCustomDomains } from './register'

const created: string[] = []
const fake: CustomHostnames = {
  async create(hostname) {
    if (hostname === 'bad.example.com') throw new Error('HTTP 409')
    created.push(hostname)
    return { id: `cf-${hostname}`, verification: 'pending' }
  },
  get: async () => 'pending',
  delete: async () => {},
}
const rows = [{ hostname: "o'k.example.com" }, { hostname: 'bad.example.com' }]

describe('registerCustomDomains', () => {
  it('dry run calls nothing', async () => {
    expect(await registerCustomDomains(rows, fake, true)).toEqual({
      sql: '',
      failed: [],
    })
    expect(created).not.toContain('bad.example.com')
    const calls = created.length
    await registerCustomDomains(rows, fake, true)
    expect(created).toHaveLength(calls)
  })

  it('emits guarded UPDATEs and keeps going past a failure', async () => {
    const r = await registerCustomDomains(rows, fake, false, 1)
    expect(r.sql).toBe(
      "UPDATE domains SET cf_custom_hostname_id = 'cf-o''k.example.com', verification = 'pending', checked_at = 1 WHERE hostname = 'o''k.example.com' AND kind = 'custom' AND cf_custom_hostname_id IS NULL;\n",
    )
    expect(r.failed).toEqual(['bad.example.com: HTTP 409'])
  })
})
