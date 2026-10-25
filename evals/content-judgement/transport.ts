import { z } from 'zod'
import { categories, type Surface } from './schema'
import { type DecisionRequest } from './questions'

const probability = z.number().finite().min(0).max(1)
export const noulAnswerSchema = z
  .object({ type: z.literal('noul'), noul: probability })
  .strict()
const choiceAnswerSchema = z
  .object({
    type: z.literal('choice'),
    choice: z.enum(categories),
    probabilities: z.record(z.enum(categories), probability),
    confidence: probability,
  })
  .strict()
const usageSchema = z.object({
  cost: z.number().finite().nonnegative().optional(),
  input_tokens: z.number().int().nonnegative().optional(),
})
const envelope = z.object({ model: z.string().min(1), usage: usageSchema })
const moderationResponse = envelope.extend({
  answers: z
    .object({
      abusive: noulAnswerSchema,
      sexual: noulAnswerSchema,
      spam: noulAnswerSchema,
      personal_info: noulAnswerSchema,
    })
    .strict(),
})
const conversationResponse = envelope.extend({
  answers: z.object({ category: choiceAnswerSchema }).strict(),
})
export type ModerationResponse = z.infer<typeof moderationResponse>
export type ConversationResponse = z.infer<typeof conversationResponse>
export type DecisionResponse = ModerationResponse | ConversationResponse
export type RawResult = {
  id: string
  repeat: number
  model: string
  latencyMs: number
  cost: number | null
} & (
  | { answers: DecisionResponse['answers']; error?: never }
  | { answers: null; error: string }
)

export function parseResponse(
  surface: Surface,
  value: unknown,
): DecisionResponse {
  return (
    surface === 'conversation-opening'
      ? conversationResponse
      : moderationResponse
  ).parse(value)
}

export class ItemError extends Error {
  constructor(readonly category: string) {
    super(category)
  }
}

/** Never include remote error bodies: they can contain submitted content. */
export async function requestDecision(
  surface: Surface,
  request: DecisionRequest,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<DecisionResponse> {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response
    try {
      response = await fetcher('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      throw new ItemError('network_or_timeout')
    }
    if (!response.ok) {
      await response.body?.cancel()
      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < 3) {
        await pause(1_000 * 2 ** attempt)
        continue
      }
      throw new ItemError(`http_${response.status}`)
    }
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new ItemError('invalid_json')
    }
    const parsed = (
      surface === 'conversation-opening'
        ? conversationResponse
        : moderationResponse
    ).safeParse(value)
    if (!parsed.success) throw new ItemError('invalid_response')
    return parsed.data
  }
  throw new ItemError('retry_exhausted')
}
