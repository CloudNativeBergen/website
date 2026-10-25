import 'server-only'
import { z } from 'zod'
import { categories, decisionBody, type DecisionRequest } from './questions'
import { isContentJudgementEnabled } from './settings'

/**
 * The OpenRouter client for Jev (Content judgement spec §4.1).
 *
 * The ONLY way to get a caller is `judgeForOrganization`, which first asks
 * whether the organization has content judgement on (a live read). With the
 * setting off, or the read failing, there is no judge and nothing is sent:
 * no code path can reach OpenRouter for an organization that hasn't opted in.
 *
 * A judge never throws for a failed call: it answers `{ ok: false }` and the
 * content stays not judged. Nothing about the request or the response body is
 * ever logged, only a category (the bodies hold user-written content).
 */

export const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions'

const TIMEOUT_MS = 20_000
const ATTEMPTS = 3
const BACKOFF_MS = 1_000

const probability = z.number().finite().min(0).max(1)
const answerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('noul'), noul: probability }),
  z.strictObject({
    type: z.literal('choice'),
    choice: z.enum(categories),
    probabilities: z.partialRecord(z.enum(categories), probability),
    confidence: probability,
  }),
])
const responseSchema = z.object({
  model: z.string().min(1),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      cost: z.number().finite().nonnegative().optional(),
    })
    .optional(),
  answers: z.record(z.string(), answerSchema),
})

export type JevAnswer = z.infer<typeof answerSchema>

export type JudgeOutcome =
  | {
      ok: true
      /** The dated build that answered, e.g. `typesafe/jev-1.14-20261014`. */
      model: string
      answers: Record<string, JevAnswer>
      /** From `usage`, for the image guard and cost; `null` when absent. */
      inputTokens: number | null
      cost: number | null
    }
  | { ok: false; why: 'failed' | 'spendCap' }

export interface Judge {
  judge(request: DecisionRequest): Promise<JudgeOutcome>
}

interface Dependencies {
  fetcher?: typeof fetch
  pause?: (ms: number) => Promise<void>
}

/**
 * A judge for this organization, or `null` when it hasn't turned content
 * judgement on (or that can't be read). Throws only when the setting is on
 * and `OPENROUTER_API_KEY` is missing, a deployment error worth surfacing;
 * a judging task catches it like any other failure (never-fail, spec §6).
 *
 * Get one per piece of content and never hold on to it: the setting is read
 * here, so a judge kept across content would outlive turning it off.
 */
export async function judgeForOrganization(
  orgId: string | null | undefined,
  { fetcher = fetch, pause = sleep }: Dependencies = {},
): Promise<Judge | null> {
  if (!orgId) return null
  if (!(await isContentJudgementEnabled(orgId))) return null
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set, but content judgement is on for an organization',
    )
  }
  return { judge: (request) => callJev(request, apiKey, fetcher, pause) }
}

async function callJev(
  request: DecisionRequest,
  apiKey: string,
  fetcher: typeof fetch,
  pause: (ms: number) => Promise<void>,
): Promise<JudgeOutcome> {
  const body = decisionBody(request)
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const result = await attemptOnce(fetcher, apiKey, body)
    if (result.kind === 'answer') {
      // Zod issues can quote the response; only the category is logged.
      const parsed = responseSchema.safeParse(result.value)
      if (
        !parsed.success ||
        !answersMatch(parsed.data.answers, request.questions)
      )
        return failed('invalid_response', attempt)
      return {
        ok: true,
        model: parsed.data.model,
        answers: parsed.data.answers,
        inputTokens: parsed.data.usage?.input_tokens ?? null,
        cost: parsed.data.usage?.cost ?? null,
      }
    }
    if (result.kind === 'error') return failed(result.category, attempt)
    if (result.status === 402) {
      warn('spend_cap', attempt)
      return { ok: false, why: 'spendCap' }
    }
    const retryable = result.status === 429 || result.status >= 500
    if (!retryable || attempt === ATTEMPTS)
      return failed(`http_${result.status}`, attempt)
    warn(`http_${result.status}`, attempt)
    await pause(BACKOFF_MS * 2 ** (attempt - 1))
  }
  // Unreachable (the last attempt always returns), but TypeScript needs it.
  return failed('retry_exhausted', ATTEMPTS)
}

type Attempt =
  | { kind: 'answer'; value: unknown }
  | { kind: 'status'; status: number }
  | { kind: 'error'; category: string }

/** One request, with the timeout covering the response body too. */
async function attemptOnce(
  fetcher: typeof fetch,
  apiKey: string,
  body: string,
): Promise<Attempt> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetcher(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      })
    } catch {
      // The error can quote the request; only the category is logged.
      return { kind: 'error', category: 'network_or_timeout' }
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      return { kind: 'status', status: response.status }
    }
    try {
      // Raced against the abort, so a body that stalls after the headers is
      // cut off at the same 20 seconds whatever the fetch implementation does
      // with the signal.
      const aborted = new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error())),
      )
      return {
        kind: 'answer',
        value: await Promise.race([response.json(), aborted]),
      }
    } catch {
      return {
        kind: 'error',
        category: controller.signal.aborted ? 'timeout' : 'invalid_json',
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Every question answered with its own answer type (a `noul` answer to a
 * `choice` question would read as `undefined` downstream), and nothing
 * answered that wasn't asked.
 */
function answersMatch(
  answers: Record<string, JevAnswer>,
  questions: DecisionRequest['questions'],
): boolean {
  const asked: Record<string, { type: string }> = questions
  const keys = Object.keys(asked)
  return (
    Object.keys(answers).length === keys.length &&
    keys.every((key) => answers[key]?.type === asked[key].type)
  )
}

function failed(category: string, attempt: number): JudgeOutcome {
  warn(category, attempt)
  return { ok: false, why: 'failed' }
}

function warn(category: string, attempt: number): void {
  console.warn(
    `[content-judgement] Jev call: ${category} (attempt ${attempt} of ${ATTEMPTS})`,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
