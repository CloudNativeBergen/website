/**
 * Pure parsing and discovery helpers for Checkin / ticketing questionnaire fields.
 *
 * Checkin returns questionnaire data across two ticket arrays:
 *  - `fields`: [{ key: string, value: string }]
 *    Standard profile fields, e.g. `work_title`, `company`.
 *  - `additionals`: [{ name: string, value: string }]
 *    Event add-ons and questionnaire questions. Often encoded as choice/radio pairs:
 *    e.g. `name: "Will you attend the Monday workshops? - Yes"`, `value: "1"`,
 *    or `name: "Will you attend the speaker dinner? - Yes, I will attend"`, `value: "1"`.
 */

export interface DiscoveredTicketQuestion {
  /** Unique stable identifier, e.g. "field:company" or "additional:monday-workshops" */
  id: string
  /** Source bucket on the ticket */
  source: 'field' | 'additional'
  /** Raw key/prefix name */
  rawKey: string
  /** Human-readable clean question label for table header */
  label: string
  /** Inferred type */
  type: 'choice' | 'text'
  /** Known options if choice question */
  options?: string[]
}

/**
 * Normalizes question strings by trimming, stripping excessive whitespace,
 * and normalizing question titles.
 */
export function cleanQuestionLabel(raw: string): string {
  let cleaned = raw.trim()
  // If Checkin has a question prompt like "Will you attend the Monday workshops?",
  // shorten or clean common verbose phrasing for table headers:
  // e.g. "Will you attend the Monday workshops?" -> "Monday workshops"
  // "Will you attend the speaker dinner?" -> "Speaker dinner"
  const willYouAttendMatch = cleaned.match(/^will you attend (the )?(.+?)\??$/i)
  if (willYouAttendMatch && willYouAttendMatch[2]) {
    const topic = willYouAttendMatch[2].trim()
    cleaned = topic.charAt(0).toUpperCase() + topic.slice(1)
  }

  // Common field key beautification: "work_title" -> "Work Title", "company" -> "Company"
  const lower = cleaned.toLowerCase()
  if (lower === 'work_title') return 'Work Title'
  if (lower === 'company') return 'Company'

  return cleaned.replace(/\?+$/, '')
}

/**
 * Splits an additional name like "Question - Option" into [question, option].
 * Handles cases where the option is separated by " - ".
 */
export function splitQuestionAndOption(rawName: string): {
  questionPrompt: string
  optionText?: string
} {
  const delimiterIndex = rawName.lastIndexOf(' - ')
  if (delimiterIndex !== -1) {
    const questionPrompt = rawName.slice(0, delimiterIndex).trim()
    const optionText = rawName.slice(delimiterIndex + 3).trim()
    return { questionPrompt, optionText }
  }
  return { questionPrompt: rawName.trim() }
}

/**
 * Normalizes an answer value (e.g. "Yes, I will attend: 1" -> "Yes", "1" -> "Yes", "0" -> "No").
 */
export function normalizeChoiceValue(
  optionText: string | undefined,
  rawValue: string,
): string | null {
  const trimmedVal = (rawValue ?? '').trim().toLowerCase()

  // If there's an option text like "Yes, I will attend" or "No" and value is truthy ("1", "true")
  if (optionText) {
    if (
      trimmedVal === '1' ||
      trimmedVal === 'true' ||
      trimmedVal === 'yes' ||
      trimmedVal === 'ja'
    ) {
      const optLower = optionText.toLowerCase()
      if (
        optLower.startsWith('yes') ||
        optLower === 'ja' ||
        optLower.startsWith('ja ') ||
        optLower.startsWith('ja,')
      ) {
        return 'Yes'
      }
      if (
        optLower.startsWith('no') ||
        optLower === 'nei' ||
        optLower.startsWith('nei ') ||
        optLower.startsWith('nei,')
      ) {
        return 'No'
      }
      return optionText
    }
    // If value is explicitly falsey for this option, it's not selected
    return null
  }

  // Bare value without option text
  if (
    trimmedVal === '1' ||
    trimmedVal === 'true' ||
    trimmedVal === 'yes' ||
    trimmedVal === 'ja'
  ) {
    return 'Yes'
  }
  if (
    trimmedVal === '0' ||
    trimmedVal === 'false' ||
    trimmedVal === 'no' ||
    trimmedVal === 'nei'
  ) {
    return 'No'
  }
  return rawValue.trim() || null
}

/**
 * Discovers all distinct questions from ticket candidate items (fields and additionals).
 */
export function discoverTicketQuestions(
  tickets: Array<{
    fields?: Array<{ key: string; value: string }>
    additionals?: Array<{ name: string; value: string }>
  }>,
): DiscoveredTicketQuestion[] {
  const discoveredMap = new Map<string, DiscoveredTicketQuestion>()

  // 1. Process fields (e.g., company, work_title)
  for (const ticket of tickets) {
    if (ticket.fields) {
      for (const f of ticket.fields) {
        if (!f.key || !f.key.trim()) continue
        const key = f.key.trim()
        const id = `field:${key.toLowerCase()}`
        if (!discoveredMap.has(id)) {
          discoveredMap.set(id, {
            id,
            source: 'field',
            rawKey: key,
            label: cleanQuestionLabel(key),
            type: 'text',
          })
        }
      }
    }

    // 2. Process additionals
    if (ticket.additionals) {
      for (const a of ticket.additionals) {
        if (!a.name || !a.name.trim()) continue
        const { questionPrompt, optionText } = splitQuestionAndOption(a.name)
        const id = `additional:${questionPrompt.trim().toLowerCase()}`
        const isChoice =
          Boolean(optionText) || a.value === '1' || a.value === '0'

        const existing = discoveredMap.get(id)
        if (existing) {
          if (isChoice && existing.type === 'text') {
            existing.type = 'choice'
            if (!optionText && !existing.options) {
              existing.options = ['Yes', 'No']
            }
          }
          if (optionText) {
            const normalizedOpt =
              normalizeChoiceValue(optionText, '1') || optionText
            if (!existing.options) {
              existing.options = [normalizedOpt]
            } else if (!existing.options.includes(normalizedOpt)) {
              existing.options.push(normalizedOpt)
            }
          }
        } else {
          const options: string[] = []
          if (optionText) {
            const normalizedOpt =
              normalizeChoiceValue(optionText, '1') || optionText
            options.push(normalizedOpt)
          } else if (isChoice) {
            options.push('Yes', 'No')
          }

          discoveredMap.set(id, {
            id,
            source: 'additional',
            rawKey: questionPrompt,
            label: cleanQuestionLabel(questionPrompt),
            type: isChoice ? 'choice' : 'text',
            options: options.length > 0 ? options : undefined,
          })
        }
      }
    }
  }

  // Sort discovered questions: high priority RSVPs first (Workshops, Dinner, Party), then fields, then others
  return Array.from(discoveredMap.values()).sort((a, b) => {
    const priority = (q: DiscoveredTicketQuestion) => {
      const l = q.label.toLowerCase()
      if (l.includes('workshop')) return 1
      if (l.includes('dinner')) return 2
      if (l.includes('party')) return 3
      if (q.source === 'field') return 10
      return 20
    }
    return priority(a) - priority(b)
  })
}

/**
 * Resolves a speaker's individual answers for a specific discovered question.
 * Preserves individual selected options for membership filtering without string splitting.
 */
export function resolveSpeakerAnswers(
  status:
    | {
        fields?: Array<{ key: string; value: string }>
        additionals?: Array<{ name: string; value: string }>
      }
    | undefined,
  question: DiscoveredTicketQuestion,
): string[] {
  if (!status) return []

  if (question.source === 'field') {
    const field = status.fields?.find(
      (f) => f.key.trim().toLowerCase() === question.rawKey.toLowerCase(),
    )
    return field && field.value.trim() ? [field.value.trim()] : []
  }

  if (question.source === 'additional') {
    if (!status.additionals) return []

    // Find all additionals matching this questionPrompt
    const matchedAnswers: string[] = []
    for (const a of status.additionals) {
      const { questionPrompt, optionText } = splitQuestionAndOption(a.name)
      if (questionPrompt.toLowerCase() === question.rawKey.toLowerCase()) {
        const normalized = normalizeChoiceValue(optionText, a.value)
        if (normalized && !matchedAnswers.includes(normalized)) {
          matchedAnswers.push(normalized)
        }
      }
    }
    return matchedAnswers
  }

  return []
}

/**
 * Resolves a speaker's display answer string for a specific discovered question.
 */
export function resolveSpeakerAnswer(
  status:
    | {
        fields?: Array<{ key: string; value: string }>
        additionals?: Array<{ name: string; value: string }>
      }
    | undefined,
  question: DiscoveredTicketQuestion,
): string | null {
  const answers = resolveSpeakerAnswers(status, question)
  return answers.length > 0 ? answers.join(', ') : null
}
