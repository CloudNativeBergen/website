import { describe, expect, it, vi } from 'vitest'
import { buildRequest } from './questions'
import { loadData } from './schema'
import { ItemError, parseResponse, requestDecision } from './transport'

const request = () => buildRequest('wall-caption', loadData('wall-caption')[0])
const valid = () => ({
  model: 'typesafe/jev-1.14',
  answers: {
    abusive: { noul: 0.8 },
    sexual: { noul: 0 },
    spam: { noul: 0.1 },
    personal_info: { noul: 1 },
  },
  usage: { cost: 0.002, input_tokens: 100 },
})

describe('decision transport', () => {
  it('sends the decision body and retries transient statuses at most four times', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('private remote error', { status: 429 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 529 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(valid()))
    const pause = vi
      .fn<(ms: number) => Promise<void>>()
      .mockResolvedValue(undefined)
    expect(
      await requestDecision(
        'wall-caption',
        request(),
        'test-key',
        fetcher,
        pause,
      ),
    ).toEqual(valid())
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(pause.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000])
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/alpha/decisions')
    expect(options?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(options?.body))).toEqual(request())
  })
  it('records exhausted retries and never includes a remote body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response('sensitive text', { status: 500 }),
      )
    const pause = vi
      .fn<(ms: number) => Promise<void>>()
      .mockResolvedValue(undefined)
    await expect(
      requestDecision('wall-caption', request(), 'test-key', fetcher, pause),
    ).rejects.toEqual(new ItemError('http_500'))
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(pause).toHaveBeenCalledTimes(3)
  })
  it('does not retry permanent HTTP failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private text', { status: 401 }))
    await expect(
      requestDecision('wall-caption', request(), 'test-key', fetcher),
    ).rejects.toThrow('http_401')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('categorizes malformed JSON and invalid answer shapes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{'))
      .mockResolvedValueOnce(
        Response.json({ ...valid(), answers: { abusive: { noul: 2 } } }),
      )
    await expect(
      requestDecision('wall-caption', request(), 'test-key', fetcher),
    ).rejects.toThrow('invalid_json')
    await expect(
      requestDecision('wall-caption', request(), 'test-key', fetcher),
    ).rejects.toThrow('invalid_response')
  })
  it('validates every expected answer and bounds all probabilities', () => {
    expect(parseResponse('wall-caption', valid())).toEqual(valid())
    expect(() =>
      parseResponse('wall-caption', {
        ...valid(),
        answers: { ...valid().answers, spam: { noul: -0.1 } },
      }),
    ).toThrow()
    const probabilities = {
      talk_details: 0.4,
      proposal_status: 0.1,
      account_and_site: 0.1,
      schedule: 0.1,
      travel_and_visa: 0.1,
      tickets: 0.1,
      other: 0.1,
    }
    const conversation = {
      model: 'test',
      usage: {},
      answers: {
        category: { choice: 'talk_details', confidence: 0.4, probabilities },
      },
    }
    expect(parseResponse('conversation-opening', conversation)).toEqual(
      conversation,
    )
    expect(() =>
      parseResponse('conversation-opening', {
        ...conversation,
        answers: {
          category: { ...conversation.answers.category, probabilities: {} },
        },
      }),
    ).toThrow()
  })
})
