/**
 * Sent-communication helpers shared by the server send path and the admin UI
 * (#1261). Pure: no Sanity, no Resend, no React — safe to import anywhere.
 */
import type { ContactPerson } from '@/lib/sponsor/types'
import type { CommunicationKind, CommunicationRecipient } from './types'

export const COMMUNICATION_KINDS: readonly CommunicationKind[] = [
  'information',
  'contract',
  'registration',
  'discount',
] as const

export const COMMUNICATION_KIND_LABELS: Record<CommunicationKind, string> = {
  information: 'Information',
  contract: 'Contract',
  registration: 'Registration',
  discount: 'Discount codes',
}

/**
 * The default recipient is the contact flagged `isPrimary`, or the only
 * contact when there is exactly one — `hasPrimaryContact`'s rule (spec #1260
 * Q3), restricted to a contact that can actually receive mail. A primary
 * contact WITHOUT an email is never the default; nothing could be sent to
 * them, and nobody else is silently promoted in their place.
 */
export function defaultRecipientKey(
  contacts: readonly ContactPerson[] | undefined,
): string | undefined {
  const all = contacts ?? []
  const primary = all.find((c) => c.isPrimary)
  if (primary) return primary.email ? primary._key : undefined
  if (all.length === 1 && all[0].email) return all[0]._key
  return undefined
}

/**
 * Strip editor-assigned `_key`s so a re-keyed but otherwise identical body
 * compares equal. Shared by the composer (preview of the edited flag) and the
 * server (the flag that is actually STORED).
 */
export function withoutKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '_key') continue
      out[k] = withoutKeys(v)
    }
    return out
  }
  return value
}

/**
 * Whether what was sent differs from what the template produced. Compared on
 * normalized content, so merely re-keyed blocks are not an edit.
 */
export function isTemplateEdited(
  applied: { subject: string; body: unknown },
  sent: { subject: string; message: unknown },
): boolean {
  if (applied.subject.trim() !== sent.subject.trim()) return true
  return (
    JSON.stringify(withoutKeys(applied.body)) !==
    JSON.stringify(withoutKeys(sent.message))
  )
}

export const TEMPLATE_NOT_FOUND_MESSAGE = 'Template not found'
export const TEMPLATE_WRONG_KIND_MESSAGE =
  'Template is for another kind of email'

export class CommunicationRecipientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommunicationRecipientError'
  }
}

/**
 * Resolve client-supplied contact KEYS against the sponsor's stored contacts.
 * The client never supplies an address: a key that is not on this sponsor, or
 * names a contact without an email, refuses the whole send before anything is
 * rendered or sent. Duplicate keys collapse to one recipient.
 */
export function resolveRecipients(
  contacts: readonly ContactPerson[] | undefined,
  keys: readonly string[],
): CommunicationRecipient[] {
  const unique = new Set(keys)
  if (unique.size === 0) {
    throw new CommunicationRecipientError('Choose at least one recipient')
  }
  const all = contacts ?? []
  for (const key of unique) {
    if (!all.some((c) => c._key === key)) {
      throw new CommunicationRecipientError(
        'A chosen recipient is not a contact on this sponsor',
      )
    }
  }
  const defaultKey = defaultRecipientKey(contacts)
  // CONTACT order, not the order the keys arrived in: the composer merges
  // `CONTACT_NAMES` in contact order, and the server re-merges the same way
  // to compute `templateEdited`, so both must agree on who comes first.
  return all
    .filter((c) => unique.has(c._key))
    .map((contact) => {
      if (!contact.email) {
        throw new CommunicationRecipientError(
          `${contact.name} has no email address`,
        )
      }
      return {
        contactKey: contact._key,
        name: contact.name,
        email: contact.email,
        ...(contact.role ? { role: contact.role } : {}),
        isDefault: contact._key === defaultKey,
      }
    })
}

/** The compact timeline line: "Information sent to Kari Nordmann (+1)". */
export function describeCommunication(
  kind: CommunicationKind,
  recipients: readonly Pick<CommunicationRecipient, 'name'>[],
  status: 'sent' | 'failed' = 'sent',
): string {
  const label = COMMUNICATION_KIND_LABELS[kind]
  const first = recipients[0]?.name ?? 'nobody'
  const rest = recipients.length > 1 ? ` (+${recipients.length - 1})` : ''
  const verb = status === 'failed' ? 'failed to send to' : 'sent to'
  return `${label} ${verb} ${first}${rest}`
}
