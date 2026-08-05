import { describe, it, expect, vi, afterEach } from 'vitest'

// The provider imports the Sanity client at module load; sendForSigning itself
// never touches it, so a stub keeps these tests off the network.
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { patch: vi.fn() },
}))

import { SelfHostedSigningProvider } from './self-hosted'

const provider = new SelfHostedSigningProvider()

const send = (baseUrl?: string) =>
  provider.sendForSigning({
    pdf: Buffer.from('pdf'),
    filename: 'agreement.pdf',
    signerEmail: 'sponsor@example.com',
    agreementName: 'Sponsorship Agreement',
    baseUrl,
  })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SelfHostedSigningProvider.sendForSigning — base URL resolution', () => {
  it('builds the signing link on the tenant origin passed as baseUrl', async () => {
    const { signingUrl } = await send('https://tenant.example')
    expect(signingUrl).toMatch(
      /^https:\/\/tenant\.example\/sponsor\/contract\/sign\/[0-9a-f-]+$/,
    )
  })

  it('falls back to NEXT_PUBLIC_BASE_URL when no baseUrl is passed', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://platform.example')
    const { signingUrl } = await send()
    expect(new URL(signingUrl!).origin).toBe('https://platform.example')
  })

  // The #687 trap: next-auth's reqWithEnvURL rewrites EVERY request origin to
  // NEXTAUTH_URL, so an operator setting it to "fix" signing links would
  // silently break auth on every other tenant domain. The signing module must
  // NOT read it — setting it must not change the resolved signing URL.
  it('IGNORES NEXTAUTH_URL — it does not influence the signing origin (#687)', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://auth-pinned.example')
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://platform.example')
    const { signingUrl } = await send()
    // Before the fix, NEXTAUTH_URL sat ahead of NEXT_PUBLIC_BASE_URL in the
    // fallback chain and this origin would be 'https://auth-pinned.example'.
    expect(new URL(signingUrl!).origin).toBe('https://platform.example')
    expect(signingUrl).not.toContain('auth-pinned.example')
  })

  it('IGNORES NEXTAUTH_URL even when it is the only origin env var set (#687)', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://auth-pinned.example')
    await expect(send()).rejects.toThrow(/Missing base URL/)
  })

  it('does not name NEXTAUTH_URL in the missing-base-URL error', async () => {
    await expect(send()).rejects.toThrow(/NEXT_PUBLIC_BASE_URL/)
    await expect(send()).rejects.not.toThrow(/NEXTAUTH_URL/)
  })
})
