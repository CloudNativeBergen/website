/**
 * @vitest-environment node
 */

import type { MockedFunction } from 'vitest'

const mockFetch = vi.fn() as MockedFunction<typeof global.fetch>

let savedNodeEnv: string | undefined
let savedBotToken: string | undefined
let savedFetch: typeof global.fetch

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
      await postSlackMessage(testMessage, { channel: '#sales' })

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
        postSlackMessage(testMessage, { channel: '#bad' }),
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
        postSlackMessage(testMessage, { channel: '#test' }),
      ).rejects.toThrow('Slack API HTTP 401: Unauthorized')
    })
  })

  describe('missing configuration', () => {
    it('should warn when no bot token', async () => {
      setEnv({ nodeEnv: 'production' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage, { channel: '#test' })

      expect(warnSpy).toHaveBeenCalledWith('SLACK_BOT_TOKEN is not configured')
    })

    it('should warn when no channel specified', async () => {
      setEnv({ nodeEnv: 'production', botToken: 'xoxb-test' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { postSlackMessage } = await import('@/lib/slack/client')
      await postSlackMessage(testMessage)

      expect(warnSpy).toHaveBeenCalledWith(
        'No Slack channel specified, skipping notification',
      )
    })
  })
})
