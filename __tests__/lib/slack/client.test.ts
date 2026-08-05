/**
 * @vitest-environment node
 */

import type { MockedFunction } from 'vitest'

const mockFetch = vi.fn() as MockedFunction<typeof global.fetch>

let savedNodeEnv: string | undefined
let savedBotToken: string | undefined
let savedFetch: typeof global.fetch

/**
 * NOTE: `SLACK_BOT_TOKEN` is set here only to prove the transport IGNORES it.
 * `postSlackMessage` has no env fallback — the token must be injected by
 * `resolveConferenceSlackToken` at the caller's boundary (see
 * `src/lib/slack/token.test.ts` for the isolation rules that resolver enforces).
 */
function setEnv(opts: { nodeEnv: string; botToken?: string }) {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = opts.nodeEnv
  if (opts.botToken !== undefined) {
    process.env.SLACK_BOT_TOKEN = opts.botToken
  } else {
    delete process.env.SLACK_BOT_TOKEN
  }
}

function restoreEnv() {
  if (savedNodeEnv !== undefined) {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv
  } else {
    delete (process.env as Record<string, string | undefined>).NODE_ENV
  }
  if (savedBotToken !== undefined) {
    process.env.SLACK_BOT_TOKEN = savedBotToken
  } else {
    delete process.env.SLACK_BOT_TOKEN
  }
}

describe('Slack client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    mockFetch.mockReset()
    savedNodeEnv = process.env.NODE_ENV
    savedBotToken = process.env.SLACK_BOT_TOKEN
    savedFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = savedFetch
    restoreEnv()
  })

  const testMessage = {
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
  }

  describe('escapeMrkdwn (A1)', () => {
    it('escapes &, < and > and neutralizes link/mention injection', async () => {
      const { escapeMrkdwn } = await import('@/lib/slack/client')
      expect(escapeMrkdwn('a & b')).toBe('a &amp; b')
      expect(escapeMrkdwn('<!channel>')).toBe('&lt;!channel&gt;')
      expect(escapeMrkdwn('<https://evil|Label>')).toBe(
        '&lt;https://evil|Label&gt;',
      )
      // `&` is escaped first, so introduced entities are not double-escaped.
      expect(escapeMrkdwn('<a>')).toBe('&lt;a&gt;')
      expect(escapeMrkdwn('plain text')).toBe('plain text')
    })
  })

  describe('development mode', () => {
    it('should log to console instead of sending', async () => {
      setEnv({ nodeEnv: 'development' })
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, { channel: '#test' })

      expect(consoleSpy).toHaveBeenCalledWith(
        'Slack notification (development mode):',
      )
    })

    it('should bypass dev mode when forceSlack is true', async () => {
      setEnv({
        nodeEnv: 'development',
        botToken: 'xoxb-test',
      })
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, {
        channel: '#test',
        forceSlack: true,
        botToken: 'xoxb-test',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.any(Object),
      )
    })
  })

  describe('bot token + channel', () => {
    it('should use chat.postMessage API', async () => {
      setEnv({ nodeEnv: 'production', botToken: 'xoxb-test-token' })
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, {
        channel: '#sales',
        botToken: 'xoxb-test-token',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: 'Bearer xoxb-test-token',
          },
        }),
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
      expect(body.channel).toBe('#sales')
      expect(body.blocks).toEqual(testMessage.blocks)
    })

    it('should throw on Slack API error response', async () => {
      setEnv({ nodeEnv: 'production', botToken: 'xoxb-test' })
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'channel_not_found' }),
      } as Response)

      const { postSlackMessage } = await import('@/lib/slack/client')
      await expect(
        postSlackMessage(testMessage, {
          channel: '#bad',
          botToken: 'xoxb-test',
        }),
      ).rejects.toThrow('Slack API error: channel_not_found')
    })

    it('should throw on HTTP error', async () => {
      setEnv({ nodeEnv: 'production', botToken: 'xoxb-test' })
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response)

      const { postSlackMessage } = await import('@/lib/slack/client')
      await expect(
        postSlackMessage(testMessage, {
          channel: '#test',
          botToken: 'xoxb-test',
        }),
      ).rejects.toThrow('Slack API HTTP 401: Unauthorized')
    })
  })

  describe('missing configuration', () => {
    it('should warn and NOT send when no bot token is injected', async () => {
      setEnv({ nodeEnv: 'production' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      global.fetch = mockFetch

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, { channel: '#test' })

      expect(warnSpy).toHaveBeenCalledWith(
        'No Slack bot token resolved for this organization, skipping notification',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    /**
     * THE ISOLATION PIN. The transport used to end
     * `injectedToken ?? process.env.SLACK_BOT_TOKEN`, so any caller that
     * resolved no token silently posted with the PLATFORM's bot into a
     * tenant-editable channel name. Restoring that fallback flips this case.
     */
    it('IGNORES process.env.SLACK_BOT_TOKEN when no token is injected', async () => {
      setEnv({ nodeEnv: 'production', botToken: 'xoxb-platform-bot' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      global.fetch = mockFetch

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, { channel: '#tenant-typed-channel' })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        'No Slack bot token resolved for this organization, skipping notification',
      )
    })

    it('should warn when no channel specified', async () => {
      setEnv({ nodeEnv: 'production', botToken: 'xoxb-test' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, { botToken: 'xoxb-test' })

      expect(warnSpy).toHaveBeenCalledWith(
        'No Slack channel specified, skipping notification',
      )
    })
  })
})
