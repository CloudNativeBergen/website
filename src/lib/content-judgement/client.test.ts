/**
 * @vitest-environment node
 *
 * The OpenRouter client (Content judgement spec §4.1). The boundaries are
 * scripted: the Sanity read that answers "is content judgement on for this
 * organization?" and OpenRouter (an injected fetch). Everything between them
 * is the real client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCommentRequest,
  buildConversationRequest,
  buildWallPostRequest,
} from './questions'

const sanityFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => sanityFetch(...args) },
}))

const { judgeForOrganization, JEV_ENDPOINT } = await import('./client')

const ORG = 'org-on'
const COMMENT = 'synthetic comment 0123 45 678, never logged'
const noul = (value: number) => ({ type: 'noul', noul: value })
const commentAnswers = {
  abusive: noul(0.1),
  sexual: noul(0),
  spam: noul(0.02),
  personal_info: noul(0.7),
}
const ok = (answers: object = commentAnswers) =>
  Response.json({
    model: 'typesafe/jev-1.14-20261014',
    usage: { input_tokens: 412, cost: 0.00004 },
    answers,
  })
const status = (code: number) =>
  new Response('{"echo":"body"}', { status: code })

let enabled: boolean | undefined | 'throw'
const pause = vi.fn<(ms: number) => Promise<void>>(async () => {})

beforeEach(() => {
  enabled = true
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
  sanityFetch.mockReset()
  sanityFetch.mockImplementation(
    async (_query: string, params: { orgId: string }) => {
      if (enabled === 'throw') throw new Error('sanity down')
      return params.orgId === ORG ? (enabled ?? null) : null
    },
  )
  pause.mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function judgeWith(fetcher: typeof fetch) {
  const judge = await judgeForOrganization(ORG, { fetcher, pause })
  if (!judge) throw new Error('expected a judge')
  return judge
}

describe('the gate: no call while the setting is off', () => {
  it.each([
    ['off', false],
    ['never set', undefined],
  ] as const)(
    '%s: no judge, and the read asked about this organization',
    async (_name, value) => {
      enabled = value
      const fetcher = vi.fn<typeof fetch>()
      expect(await judgeForOrganization(ORG, { fetcher, pause })).toBeNull()
      expect(sanityFetch).toHaveBeenCalledWith(
        expect.stringContaining('contentJudgement.enabled'),
        { orgId: ORG },
      )
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('a failed settings read gives no judge (fail closed: nothing is sent)', async () => {
    enabled = 'throw'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await judgeForOrganization(ORG)).toBeNull()
  })

  it('no organization gives no judge without a read', async () => {
    expect(await judgeForOrganization(null)).toBeNull()
    expect(sanityFetch).not.toHaveBeenCalled()
  })

  it('another organization being on does not switch this one on', async () => {
    expect(await judgeForOrganization('org-other')).toBeNull()
  })

  it('on without OPENROUTER_API_KEY is an error, not a silent skip', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    await expect(judgeForOrganization(ORG)).rejects.toThrow(
      'OPENROUTER_API_KEY',
    )
  })
})

describe('the request', () => {
  it.each([
    ['comment', buildCommentRequest(COMMENT)],
    ['Wall Post', buildWallPostRequest({ caption: 'hi', imageBase64: 'AAEC' })],
    [
      'Conversation opening',
      buildConversationRequest({
        subject: 's',
        message: 'm',
        openedBy: 'speaker',
      }),
    ],
  ])(
    '%s: POSTs the built request with zero data retention and the key',
    async (_name, request) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        ok(
          Object.fromEntries(
            Object.entries(request.questions).map(([key, q]) => [
              key,
              q.type === 'noul'
                ? noul(0)
                : {
                    type: 'choice',
                    choice: 'schedule',
                    probabilities: { schedule: 0.9 },
                    confidence: 0.9,
                  },
            ]),
          ),
        ),
      )
      const judge = await judgeWith(fetcher)
      expect((await judge.judge(request)).ok).toBe(true)
      const [url, init] = fetcher.mock.calls[0]
      expect(url).toBe('https://openrouter.ai/api/alpha/decisions')
      expect(JEV_ENDPOINT).toBe(url)
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer sk-or-test',
      )
      expect(JSON.parse(String(init?.body))).toEqual({
        ...request,
        provider: { zdr: true },
      })
      expect(JSON.parse(String(init?.body)).model).toBe('typesafe/jev-1.14')
    },
  )
})

describe('the answer', () => {
  it('keeps the returned build, usage and answers', async () => {
    const judge = await judgeWith(async () => ok())
    expect(await judge.judge(buildCommentRequest(COMMENT))).toEqual({
      ok: true,
      model: 'typesafe/jev-1.14-20261014',
      inputTokens: 412,
      cost: 0.00004,
      answers: commentAnswers,
    })
  })

  it('missing usage tokens are kept as null (the image guard refuses them later)', async () => {
    const judge = await judgeWith(async () =>
      Response.json({ model: 'm', usage: {}, answers: commentAnswers }),
    )
    const outcome = await judge.judge(buildCommentRequest(COMMENT))
    expect(outcome).toMatchObject({ ok: true, inputTokens: null, cost: null })
  })

  it.each([
    ['a missing answer', { ...commentAnswers, spam: undefined }],
    ['an answer nobody asked for', { ...commentAnswers, extra: noul(0) }],
    ['a probability out of range', { ...commentAnswers, spam: noul(1.5) }],
  ])('%s is not judged', async (_name, answers) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const judge = await judgeWith(async () => ok(answers))
    expect(await judge.judge(buildCommentRequest(COMMENT))).toEqual({
      ok: false,
      why: 'failed',
    })
  })

  it('a body that is not JSON is not judged', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const judge = await judgeWith(async () => new Response('<html>'))
    expect(await judge.judge(buildCommentRequest(COMMENT))).toEqual({
      ok: false,
      why: 'failed',
    })
  })
})

describe('retries, the spend cap and the timeout', () => {
  it.each([429, 500, 503])(
    'retries %i and succeeds on a later attempt',
    async (code) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(status(code))
        .mockResolvedValueOnce(ok())
      const judge = await judgeWith(fetcher)
      expect((await judge.judge(buildCommentRequest(COMMENT))).ok).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(pause).toHaveBeenCalledTimes(1)
    },
  )

  it('gives up after three attempts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>(async () => status(503))
    const judge = await judgeWith(fetcher)
    expect(await judge.judge(buildCommentRequest(COMMENT))).toEqual({
      ok: false,
      why: 'failed',
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
    // Backoff grows between attempts.
    const waits = pause.mock.calls.map(([ms]) => ms)
    expect(waits).toHaveLength(2)
    expect(waits[1]).toBeGreaterThan(waits[0])
  })

  it('402 is the spend cap: not judged, never retried', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>(async () => status(402))
    const judge = await judgeWith(fetcher)
    expect(await judge.judge(buildCommentRequest(COMMENT))).toEqual({
      ok: false,
      why: 'spendCap',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([400, 401, 404])('%i is not retried', async (code) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>(async () => status(code))
    const judge = await judgeWith(fetcher)
    expect(await judge.judge(buildCommentRequest(COMMENT))).toEqual({
      ok: false,
      why: 'failed',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('aborts an attempt at 20 seconds, not before', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () => reject(signal?.reason))
        }),
    )
    const judge = await judgeWith(fetcher)
    const outcome = judge.judge(buildCommentRequest(COMMENT))
    await vi.advanceTimersByTimeAsync(19_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    expect(await outcome).toEqual({ ok: false, why: 'failed' })
  })
})

describe('nothing judged is ever logged', () => {
  it('no log line on any failure path carries the request or the response body', async () => {
    const lines: string[] = []
    for (const method of ['log', 'info', 'warn', 'error'] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(
          args
            .map((a) => (a instanceof Error ? a.stack : JSON.stringify(a)))
            .join(' '),
        )
      })
    const responses = [
      () => status(503),
      () => status(402),
      () => status(400),
      () => ok({ wrong: noul(0) }),
      () => new Response('not json'),
      () => {
        throw new TypeError(`fetch failed: ${COMMENT}`)
      },
    ]
    for (const respond of responses) {
      const judge = await judgeWith(async () => respond())
      await judge.judge(buildCommentRequest(COMMENT))
    }
    expect(lines.length).toBeGreaterThan(0)
    const output = lines.join('\n')
    expect(output).not.toContain('never logged')
    expect(output).not.toContain('echo')
    expect(output).not.toContain('sk-or-test')
  })
})

describe('the timeout covers the body', () => {
  it('a body that stalls after the headers is cut off at 20 seconds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    // Headers arrive at once; the body never does, and ignores the signal.
    const stalled = () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { 'content-type': 'application/json' },
      })
    const judge = await judgeWith(async () => stalled())
    let settled = false
    const outcome = judge.judge(buildCommentRequest(COMMENT)).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toEqual({ ok: false, why: 'failed' })
  })
})

/**
 * Spec §15: the eval runner and production send byte-identical requests.
 * Compared on the WIRE: the body each transport actually POSTs, for one
 * labelled item per production surface.
 */
describe('the eval runner and production POST the same bytes', () => {
  const capture = () => {
    const bodies: string[] = []
    const fetcher: typeof fetch = async (_url, init) => {
      bodies.push(String(init?.body))
      return new Response(null, { status: 400 })
    }
    return { bodies, fetcher }
  }

  it.each([
    ['feedback comment', 'feedback-comment', 0],
    ['Wall Post with a caption', 'wall-photo', 'caption'],
    ['Wall Post without a caption', 'wall-photo', 'none'],
    ['Conversation opening', 'conversation-opening', 0],
  ] as const)('%s', async (_name, surface, pick) => {
    const { loadData } = await import('../../../evals/content-judgement/schema')
    const evalQuestions =
      await import('../../../evals/content-judgement/questions')
    const { requestDecision } =
      await import('../../../evals/content-judgement/transport')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const items = loadData(surface)
    const item =
      pick === 0
        ? items[0]
        : items.find((i) =>
            'image' in i
              ? (i.caption !== undefined) === (pick === 'caption')
              : false,
          )!
    const image = 'image' in item ? 'AAEC' : undefined

    const evalSide = capture()
    await requestDecision(
      surface,
      evalQuestions.buildRequest(surface, item, undefined, image),
      'k',
      evalSide.fetcher,
    ).catch(() => {})

    const production =
      'image' in item
        ? buildWallPostRequest({ caption: item.caption, imageBase64: image })
        : 'category' in item
          ? buildConversationRequest({
              subject: item.subject,
              message: item.text,
              openedBy: item.openedBy,
            })
          : buildCommentRequest(item.text)
    const productionSide = capture()
    await (await judgeWith(productionSide.fetcher)).judge(production)

    expect(productionSide.bodies).toHaveLength(1)
    expect(productionSide.bodies[0]).toBe(evalSide.bodies[0])
    expect(JSON.parse(productionSide.bodies[0]).provider).toEqual({ zdr: true })
  })
})
