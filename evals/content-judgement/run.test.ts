import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from './run'

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
  it('dry-run validates every dataset without a key or fetch', async () => {
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
    ])
    expect(fetcher).not.toHaveBeenCalled()
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
            abusive: { noul: 0.1 },
            sexual: { noul: 0 },
            spam: { noul: 0 },
            personal_info: { noul: 0 },
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
              abusive: { noul: 0 },
              sexual: { noul: 0 },
              spam: { noul: 0 },
              personal_info: { noul: 0 },
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
