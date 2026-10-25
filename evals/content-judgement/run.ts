import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareImage } from './images/prepare'
import { buildRequest, DEFAULT_MODEL } from './questions'
import { buildReport, type SurfaceRun } from './report'
import { loadData, surfaces, type Surface } from './schema'
import {
  ItemError,
  requestDecision,
  type DecisionResponse,
  type RawResult,
} from './transport'

// Probe on 2026-10-25: 2,762 input tokens with image vs 378 without.
export const IMAGE_TOKEN_MARGIN = 500

export interface Options {
  surface: Surface | 'all'
  repeats: number
  limit?: number
  concurrency: number
  out: string
  dryRun: boolean
  model: string
}
export function parseOptions(args: string[]): Options {
  let surface: Options['surface'] = 'all'
  let repeats = 3
  let limit: number | undefined
  let concurrency = 4
  let out: string | undefined
  let dryRun = false
  let model = DEFAULT_MODEL
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (flag === '--dry-run') {
      dryRun = true
      continue
    }
    if (
      ![
        '--surface',
        '--repeats',
        '--limit',
        '--concurrency',
        '--out',
        '--model',
      ].includes(flag)
    )
      throw new Error(`Unknown option: ${flag}`)
    const value = args[++index]
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag}`)
    if (flag === '--surface') {
      if (value !== 'all' && !surfaces.some((name) => name === value))
        throw new Error('Invalid --surface')
      surface = value as Options['surface']
    } else if (flag === '--model') model = value
    else if (flag === '--out') out = value
    else {
      const number = Number(value)
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1)
        throw new Error(`${flag} must be a positive integer`)
      if (flag === '--repeats') repeats = number
      else if (flag === '--limit') limit = number
      else concurrency = number
    }
  }
  const modelDirectory = model.replace(/[^a-zA-Z0-9._-]/g, '-')
  return {
    surface,
    repeats,
    limit,
    concurrency,
    dryRun,
    model,
    out:
      out ??
      `evals/content-judgement/results/${modelDirectory}-${new Date().toISOString().slice(0, 10)}`,
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseOptions(args)
  // Validate every file even when selecting one surface or limiting paid calls.
  const datasets = surfaces.map((surface) => ({
    surface,
    items: loadData(surface),
  }))
  if (options.dryRun) {
    for (const { surface, items } of datasets) {
      console.log(`${surface}: validated ${items.length} items`)
      // Print request shapes only for the selected surfaces.
      if (options.surface !== 'all' && options.surface !== surface) continue
      const item = items[0]
      // Only an explicit --surface wall-photo reads the cache; `all` shows the
      // text-only request shape so a fresh checkout can dry-run.
      const image =
        'image' in item && options.surface === surface
          ? await prepareImage(item)
          : undefined
      const request = buildRequest(surface, item, options.model, image?.base64)
      console.log(
        JSON.stringify({
          questions: Object.keys(request.questions),
          stateParts: Array.isArray(request.state)
            ? request.state.map((part) => part.type)
            : ['text'],
          requestBytes: Buffer.byteLength(JSON.stringify(request)),
          ...(image
            ? {
                imageWidth: image.width,
                imageHeight: image.height,
                imageBase64Length: image.base64.length,
              }
            : {}),
        }),
      )
    }
    return
  }
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey?.trim())
    throw new Error(
      'OPENROUTER_API_KEY is required. Use --dry-run to validate without paid API calls.',
    )
  mkdirSync(options.out, { recursive: true })
  const runs: SurfaceRun[] = datasets
    .filter(
      ({ surface }) => options.surface === 'all' || surface === options.surface,
    )
    .map(({ surface, items }) => ({
      surface,
      items: items.slice(0, options.limit),
      results: [],
    }))
  for (const run of runs) {
    const rawPath = resolve(options.out, `raw-${run.surface}.jsonl`)
    writeFileSync(rawPath, '')
    // One text-only call per request shape: a caption adds four questions,
    // so captioned and uncaptioned posts need their own baseline.
    const minimumInputTokens = new Map<boolean, number>()
    if (run.surface === 'wall-photo') {
      run.calibrations = []
      for (const captioned of [true, false]) {
        const item = run.items.find(
          (candidate) =>
            'image' in candidate &&
            (candidate.caption !== undefined) === captioned,
        )
        if (item === undefined) continue
        const start = performance.now()
        const response = await requestDecision(
          run.surface,
          buildRequest(run.surface, item, options.model),
          apiKey,
        )
        const inputTokens = response.usage.input_tokens
        run.calibrations.push({
          shape: captioned ? 'caption' : 'no_caption',
          model: response.model,
          latencyMs: performance.now() - start,
          cost: response.usage.cost ?? null,
          inputTokens,
          minimumInputTokens:
            inputTokens === undefined
              ? undefined
              : inputTokens + IMAGE_TOKEN_MARGIN,
        })
        if (inputTokens === undefined)
          throw new ItemError('calibration_missing_input_tokens')
        minimumInputTokens.set(captioned, inputTokens + IMAGE_TOKEN_MARGIN)
      }
    }
    const images = new Map<string, ReturnType<typeof prepareImage>>()
    const jobs = run.items.flatMap((item) =>
      Array.from({ length: options.repeats }, (_, index) => ({
        item,
        repeat: index + 1,
      })),
    )
    let cursor = 0
    await Promise.all(
      Array.from(
        { length: Math.min(options.concurrency, jobs.length) },
        async () => {
          while (cursor < jobs.length) {
            const { item, repeat } = jobs[cursor++]
            const start = performance.now()
            let result: RawResult
            let response: DecisionResponse | undefined
            try {
              let imageBase64: string | undefined
              if ('image' in item) {
                let image = images.get(item.id)
                if (!image) {
                  image = prepareImage(item)
                  images.set(item.id, image)
                }
                imageBase64 = (await image).base64
              }
              response = await requestDecision(
                run.surface,
                buildRequest(run.surface, item, options.model, imageBase64),
                apiKey,
              )
              const minimum =
                'image' in item
                  ? minimumInputTokens.get(item.caption !== undefined)
                  : undefined
              if (
                minimum !== undefined &&
                (response.usage.input_tokens === undefined ||
                  response.usage.input_tokens < minimum)
              )
                throw new ItemError('image_not_received')
              result = {
                id: item.id,
                repeat,
                model: response.model,
                answers: response.answers,
                latencyMs: performance.now() - start,
                cost: response.usage.cost ?? null,
              }
            } catch (error) {
              const category =
                error instanceof ItemError ? error.category : 'unexpected_error'
              result = {
                id: item.id,
                repeat,
                model: response?.model ?? options.model,
                answers: null,
                latencyMs: performance.now() - start,
                cost: response?.usage.cost ?? null,
                error: category,
              }
              console.error(
                `${run.surface}/${item.id} repeat ${repeat}: ${category}`,
              )
            }
            // One synchronous append per line avoids interleaved concurrent writes.
            appendFileSync(rawPath, JSON.stringify(result) + '\n')
            run.results.push(result)
          }
        },
      ),
    )
    console.log(`${run.surface}: ${run.results.length} attempts recorded`)
  }
  writeFileSync(
    resolve(options.out, 'report.md'),
    buildReport(runs, options.model, options.repeats),
  )
  console.log(`Report: ${resolve(options.out, 'report.md')}`)
  if (runs.some((run) => run.results.some((result) => result.answers === null)))
    process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Evaluation failed')
    process.exitCode = 1
  })
}
