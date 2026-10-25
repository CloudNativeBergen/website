import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main, parseOptions } from './run'

const savedExitCode = process.exitCode
const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.exitCode = savedExitCode
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('offline runner integration', () => {
  it('dry-run validates every dataset without a key, fetch or photo cache', async () => {
    const prepare = await import('./images/prepare')
    const prepareImage = vi.spyOn(prepare, 'prepareImage')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await main(['--dry-run', '--surface', 'wall-caption', '--limit', '1'])
    expect(
      log.mock.calls
        .map(([value]) => value)
        .filter(
          (value) => typeof value === 'string' && value.includes(': validated'),
        ),
    ).toEqual([
      'wall-caption: validated 130 items',
      'feedback-comment: validated 160 items',
      'conversation-opening: validated 112 items',
      'wall-photo: validated 75 items',
    ])
    // A text surface must not need the gitignored image cache.
    expect(prepareImage).not.toHaveBeenCalled()
    const output = log.mock.calls.map(([value]) => String(value)).join('\n')
    expect(output.includes('data:image')).toBe(false)
    expect(output).toContain('requestBytes')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('dry-run of every surface does not need the photo cache', async () => {
    const prepare = await import('./images/prepare')
    const prepareImage = vi.spyOn(prepare, 'prepareImage')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await main(['--dry-run', '--limit', '1'])
    expect(prepareImage).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    const output = log.mock.calls.map(([value]) => String(value)).join('\n')
    expect(output).toContain('wall-photo: validated 75 items')
    expect(output.includes('data:image')).toBe(false)
  })
  it('requires an API key before attempting a paid request', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    await expect(main(['--limit', '1'])).rejects.toThrow(
      'OPENROUTER_API_KEY is required',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('records malformed repeats, continues remaining work, and writes a report', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-test-key')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ private: 'not an answer' }))
      .mockResolvedValueOnce(
        Response.json({
          model: 'test-returned-model',
          usage: { cost: 0.01 },
          answers: {
            abusive: { type: 'noul', noul: 0.1 },
            sexual: { type: 'noul', noul: 0 },
            spam: { type: 'noul', noul: 0 },
            personal_info: { type: 'noul', noul: 0 },
          },
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const directory = mkdtempSync(join(tmpdir(), 'jev-run-test-'))
    directories.push(directory)
    await main([
      '--surface',
      'wall-caption',
      '--repeats',
      '2',
      '--limit',
      '1',
      '--concurrency',
      '1',
      '--out',
      directory,
    ])
    const raw = readFileSync(join(directory, 'raw-wall-caption.jsonl'), 'utf8')
    const lines = raw
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      id: 'wc-001',
      repeat: 1,
      answers: null,
      error: 'invalid_response',
      cost: null,
    })
    expect(lines[1]).toMatchObject({
      id: 'wc-001',
      repeat: 2,
      model: 'test-returned-model',
      cost: 0.01,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledWith(
      'wall-caption/wc-001 repeat 1: invalid_response',
    )
    expect(raw).not.toContain('not an answer')
    expect(readFileSync(join(directory, 'report.md'), 'utf8')).toContain(
      'Scored 0/1 items; excluded 1',
    )
    expect(process.exitCode).toBe(1)
  })
  it('runs all surfaces with bounded concurrency and records every successful repeat', async () => {
    // Photos need the gitignored image cache; this test covers the text surfaces.
    const schema = await import('./schema')
    const originalLoadData = schema.loadData
    vi.spyOn(schema, 'loadData').mockImplementation((surface) =>
      surface === 'wall-photo' ? [] : originalLoadData(surface),
    )
    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-test-key')
    let active = 0
    let peak = 0
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      const body = JSON.parse(String(options?.body)) as {
        state: Record<string, unknown>
      }
      const answers =
        'message' in body.state
          ? {
              category: {
                type: 'choice',
                choice: 'talk_details',
                confidence: 0.9,
                probabilities: {
                  talk_details: 0.9,
                  proposal_status: 0.1,
                  account_and_site: 0,
                  schedule: 0,
                  travel_and_visa: 0,
                  tickets: 0,
                  other: 0,
                },
              },
            }
          : {
              abusive: { type: 'noul', noul: 0 },
              sexual: { type: 'noul', noul: 0 },
              spam: { type: 'noul', noul: 0 },
              personal_info: { type: 'noul', noul: 0 },
            }
      return Response.json({
        model: 'synthetic-model',
        usage: { cost: 0.01 },
        answers,
      })
    })
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const directory = mkdtempSync(join(tmpdir(), 'jev-all-test-'))
    directories.push(directory)
    await main([
      '--limit',
      '2',
      '--repeats',
      '2',
      '--concurrency',
      '2',
      '--out',
      directory,
    ])
    expect(fetcher).toHaveBeenCalledTimes(12)
    expect(peak).toBe(2)
    for (const surface of [
      'wall-caption',
      'feedback-comment',
      'conversation-opening',
    ]) {
      const lines = readFileSync(
        join(directory, `raw-${surface}.jsonl`),
        'utf8',
      )
        .trim()
        .split('\n')
      expect(lines).toHaveLength(4)
    }
    const report = readFileSync(join(directory, 'report.md'), 'utf8')
    expect(report).toContain('Calls: 12; successful: 12; failed: 0')
    expect(report).toContain('$0.120000')
    expect(report.match(/Scored 2\/2 items/g)).toHaveLength(3)
  })
})

describe('wall-photo runner integration', () => {
  it('calibrates once and rejects missing or low image token usage while counting accepted responses', async () => {
    const { mkdirSync, unlinkSync } = await import('node:fs')
    const sharp = (await import('sharp')).default
    const schema = await import('./schema')
    const originalLoadData = schema.loadData
    const generator = `runner-test-${Date.now()}`
    const item = schema.wallPhotoSchema.parse({
      id: 'wp-001',
      caption: 'private synthetic fixture',
      lang: 'en',
      image: { kind: 'generated', generator },
      labels: {
        caption: {
          abusive: false,
          sexual: false,
          spam: false,
          personal_info: false,
        },
        photo: {
          abusive: false,
          sexual: false,
          spam: false,
          personal_info: false,
        },
      },
      tags: ['benign'],
    })
    const cache = new URL('./.image-cache/', import.meta.url)
    mkdirSync(cache, { recursive: true })
    const imagePath = new URL(`${generator}.png`, cache)
    await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#abcdef' },
    })
      .png()
      .toFile(imagePath.pathname)
    try {
      vi.spyOn(schema, 'loadData').mockImplementation((surface) =>
        surface === 'wall-photo' ? [item] : originalLoadData(surface),
      )
      vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
      const answers = Object.fromEntries(
        ['caption', 'photo'].flatMap((part) =>
          schema.moderationKeys.map((key) => [
            `${part}_${key}`,
            { type: 'noul', noul: 0 },
          ]),
        ),
      )
      const fetcher = vi.fn<typeof fetch>()
      for (const inputTokens of [378, 877, 878, 3000, undefined])
        fetcher.mockResolvedValueOnce(
          Response.json({
            model: 'test',
            usage: { input_tokens: inputTokens, cost: 0.01 },
            answers,
          }),
        )
      vi.stubGlobal('fetch', fetcher)
      const logs = [
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'error').mockImplementation(() => {}),
      ]
      const directory = mkdtempSync(join(tmpdir(), 'jev-photo-test-'))
      directories.push(directory)
      await main([
        '--surface',
        'wall-photo',
        '--repeats',
        '4',
        '--limit',
        '1',
        '--concurrency',
        '1',
        '--out',
        directory,
      ])
      const raw = readFileSync(join(directory, 'raw-wall-photo.jsonl'), 'utf8')
      const results = raw
        .trim()
        .split('\n')
        .map((line: string) => JSON.parse(line))
      expect(results).toHaveLength(4)
      expect(results.map((result) => result.error ?? 'accepted')).toEqual([
        'image_not_received',
        'accepted',
        'accepted',
        'image_not_received',
      ])
      expect(results.map((result) => result.cost)).toEqual([
        0.01, 0.01, 0.01, 0.01,
      ])
      expect(fetcher).toHaveBeenCalledTimes(5)
      const requests = fetcher.mock.calls.map(([, options]) =>
        JSON.parse(String(options?.body)),
      )
      expect(
        requests[0].state.map((part: { type: string }) => part.type),
      ).toEqual(['text'])
      expect(
        requests
          .slice(1)
          .map((request) =>
            request.state.map((part: { type: string }) => part.type),
          ),
      ).toEqual(Array.from({ length: 4 }, () => ['text', 'image_url']))
      expect(raw.includes(item.caption!)).toBe(false)
      expect(raw.includes('data:image')).toBe(false)
      const report = readFileSync(join(directory, 'report.md'), 'utf8')
      expect(report).toContain('Calls: 5;')
      expect(report).toContain(
        'input tokens T0: 378; minimum accepted image input tokens: 878',
      )
      expect(report).toContain('$0.050000')
      expect(report).toContain('Scored 0/1 items')
      expect(process.exitCode).toBe(1)
      const logged = logs
        .flatMap((spy) => spy.mock.calls.flat())
        .map(String)
        .join('\n')
      expect(logged).not.toContain('private synthetic fixture')
      // JPEG base64 always starts with /9j/.
      expect(logged).not.toContain('/9j/')
      expect(logged).not.toContain('data:image')
    } finally {
      unlinkSync(imagePath)
    }
  })

  it('calibrates captioned and uncaptioned posts separately', async () => {
    const { mkdirSync, unlinkSync } = await import('node:fs')
    const sharp = (await import('sharp')).default
    const schema = await import('./schema')
    const originalLoadData = schema.loadData
    const generator = `runner-shape-test-${Date.now()}`
    const clean = {
      abusive: false,
      sexual: false,
      spam: false,
      personal_info: false,
    }
    const captioned = schema.wallPhotoSchema.parse({
      id: 'wp-001',
      caption: 'private synthetic fixture',
      lang: 'en',
      image: { kind: 'generated', generator },
      labels: { caption: clean, photo: clean },
      tags: ['benign'],
    })
    const uncaptioned = schema.wallPhotoSchema.parse({
      id: 'wp-002',
      image: { kind: 'generated', generator },
      labels: { photo: clean },
      tags: ['benign', 'no_caption'],
    })
    const cache = new URL('./.image-cache/', import.meta.url)
    mkdirSync(cache, { recursive: true })
    const imagePath = new URL(`${generator}.png`, cache)
    await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#abcdef' },
    })
      .png()
      .toFile(imagePath.pathname)
    try {
      vi.spyOn(schema, 'loadData').mockImplementation((surface) =>
        surface === 'wall-photo'
          ? [captioned, uncaptioned]
          : originalLoadData(surface),
      )
      vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
      // Calibration with caption, calibration without, then one call per post.
      // 900 clears the uncaptioned floor (300 + 500) but not the captioned one.
      const tokens = [1000, 300, 1400, 900]
      const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
        const { questions } = JSON.parse(String(options?.body))
        return Response.json({
          model: 'test',
          usage: { input_tokens: tokens.shift(), cost: 0.01 },
          answers: Object.fromEntries(
            Object.keys(questions).map((key) => [
              key,
              { type: 'noul', noul: 0 },
            ]),
          ),
        })
      })
      vi.stubGlobal('fetch', fetcher)
      const logs = [
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'error').mockImplementation(() => {}),
      ]
      const directory = mkdtempSync(join(tmpdir(), 'jev-photo-test-'))
      directories.push(directory)
      await main([
        '--surface',
        'wall-photo',
        '--repeats',
        '1',
        '--concurrency',
        '1',
        '--out',
        directory,
      ])
      const requests = fetcher.mock.calls.map(([, options]) =>
        JSON.parse(String(options?.body)),
      )
      expect(
        requests.map((request) => Object.keys(request.questions).length),
      ).toEqual([8, 4, 8, 4])
      const results = readFileSync(
        join(directory, 'raw-wall-photo.jsonl'),
        'utf8',
      )
        .trim()
        .split('\n')
        .map((line: string) => JSON.parse(line))
      expect(
        results.map((result) => [result.id, result.error ?? 'accepted']),
      ).toEqual([
        ['wp-001', 'image_not_received'],
        ['wp-002', 'accepted'],
      ])
      const logged = logs
        .flatMap((spy) => spy.mock.calls.flat())
        .map(String)
        .join('\n')
      expect(logged).not.toContain('private synthetic fixture')
      // JPEG base64 always starts with /9j/.
      expect(logged).not.toContain('/9j/')
      expect(logged).not.toContain('data:image')
    } finally {
      unlinkSync(imagePath)
    }
  })
  it('stops before any photo call when calibration reports no input tokens', async () => {
    const schema = await import('./schema')
    const originalLoadData = schema.loadData
    const clean = {
      abusive: false,
      sexual: false,
      spam: false,
      personal_info: false,
    }
    vi.spyOn(schema, 'loadData').mockImplementation((surface) =>
      surface === 'wall-photo'
        ? [
            schema.wallPhotoSchema.parse({
              id: 'wp-001',
              image: { kind: 'generated', generator: 'unused-in-this-test' },
              labels: { photo: clean },
              tags: ['benign', 'no_caption'],
            }),
          ]
        : originalLoadData(surface),
    )
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      const { questions } = JSON.parse(String(options?.body))
      return Response.json({
        model: 'test',
        usage: { cost: 0.01 },
        answers: Object.fromEntries(
          Object.keys(questions).map((key) => [key, { type: 'noul', noul: 0 }]),
        ),
      })
    })
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const directory = mkdtempSync(join(tmpdir(), 'jev-photo-test-'))
    directories.push(directory)
    await expect(
      main(['--surface', 'wall-photo', '--repeats', '1', '--out', directory]),
    ).rejects.toThrow()
    // Only the text-only calibration call went out; no photo was sent.
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('a private held-out text set (--data)', () => {
  const MARKER = 'private held-out wording'
  const item = (n: number, abusive: boolean) =>
    JSON.stringify({
      id: `fc-${String(n).padStart(3, '0')}`,
      text: `${MARKER} ${n}`,
      lang: 'en',
      labels: { abusive, sexual: false, spam: false, personal_info: false },
      tags: [abusive ? 'abusive' : 'benign'],
    })
  const privateSet = () => {
    const directory = mkdtempSync(join(tmpdir(), 'jev-held-out-'))
    directories.push(directory)
    writeFileSync(
      join(directory, 'feedback-comment.jsonl'),
      [item(1, true), item(2, false)].join('\n') + '\n',
    )
    return directory
  }

  it.each([['all'], ['wall-photo']])(
    'needs one text surface, not %s',
    (surface) => {
      expect(() =>
        parseOptions(['--data', tmpdir(), '--surface', surface]),
      ).toThrow('--data needs --surface')
    },
  )

  it.each([
    ['the repository root', '.'],
    ['the public data directory', 'evals/content-judgement/data'],
  ])('refuses %s', (_name, path) => {
    expect(() =>
      parseOptions(['--data', path, '--surface', 'feedback-comment']),
    ).toThrow('outside this repository')
  })

  it('accepts a directory outside the repository', () => {
    const directory = privateSet()
    expect(
      parseOptions(['--data', directory, '--surface', 'feedback-comment']).data,
    ).toBe(directory)
  })

  it('scores the private items, keeps raw results next to them, and writes only numbers to --out', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-test-key')
    const data = privateSet()
    const out = mkdtempSync(join(tmpdir(), 'jev-held-out-out-'))
    directories.push(out)
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      const { state } = JSON.parse(String(options?.body)) as {
        state: { comment: string }
      }
      const abusive = state.comment.endsWith(' 1') ? 0.95 : 0.01
      return Response.json({
        model: 'typesafe/jev-1.14-20261014',
        usage: { cost: 0 },
        answers: {
          abusive: { type: 'noul', noul: abusive },
          sexual: { type: 'noul', noul: 0 },
          spam: { type: 'noul', noul: 0 },
          personal_info: { type: 'noul', noul: 0 },
        },
      })
    })
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await main([
      '--data',
      data,
      '--surface',
      'feedback-comment',
      '--repeats',
      '1',
      '--out',
      out,
    ])
    // The private items were the ones sent, not the public set.
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(readdirSync(out)).toEqual(['report.md'])
    expect(readdirSync(data).sort()).toEqual([
      'feedback-comment.jsonl',
      'raw-feedback-comment.jsonl',
    ])
    const report = readFileSync(join(out, 'report.md'), 'utf8')
    expect(report).toContain('private held-out set')
    expect(report).toContain('Scored 2/2 items')
    expect(report).not.toContain(MARKER)
    expect(report).not.toMatch(/fc-00\d/)
  })
})
