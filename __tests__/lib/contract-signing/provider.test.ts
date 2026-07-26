/**
 * @vitest-environment node
 */

describe('getSigningProvider', () => {
  it('returns SelfHostedSigningProvider by default', async () => {
    const { getSigningProvider } = await import('@/lib/contract-signing')
    const provider = getSigningProvider()
    expect(provider.name).toBe('Verified Document Signing')
  })

  it('returns self-hosted when explicitly requested', async () => {
    const { getSigningProvider } = await import('@/lib/contract-signing')
    const provider = getSigningProvider('self-hosted')
    expect(provider.name).toBe('Verified Document Signing')
  })

  it('falls back to self-hosted (with a warning) for legacy/unknown values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { getSigningProvider } = await import('@/lib/contract-signing')
      // A conference doc may still carry the removed 'adobe-sign' value.
      const provider = getSigningProvider('adobe-sign')
      expect(provider.name).toBe('Verified Document Signing')
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('adobe-sign'),
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('implements ContractSigningProvider interface', async () => {
    const { getSigningProvider } = await import('@/lib/contract-signing')
    const provider = getSigningProvider()
    expect(typeof provider.sendForSigning).toBe('function')
    expect(typeof provider.checkStatus).toBe('function')
    expect(typeof provider.cancelAgreement).toBe('function')
    expect(typeof provider.sendReminder).toBe('function')
    expect(typeof provider.getConnectionStatus).toBe('function')
    expect(typeof provider.getAuthorizeUrl).toBe('function')
    expect(typeof provider.disconnect).toBe('function')
    expect(typeof provider.registerWebhook).toBe('function')
  })
})
