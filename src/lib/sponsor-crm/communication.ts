/**
 * Sent-communication helpers shared by the server send path and the admin UI
 * (#1261). Pure: no Sanity, no Resend, no React — safe to import anywhere.
 */
import type { ContactPerson } from '@/lib/sponsor/types'
import { canonicalEmail } from '@/lib/speaker/email'
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
 * Normalize PortableText for comparison: drop editor-assigned `_key`s and the
 * defaults a rich-text editor adds to untouched content (`marks: []`,
 * `markDefs: []`, `style: 'normal'`), so a template that merely passed
 * through the editor is not mistaken for an edited one. Shared by the
 * composer (preview of the flag) and the server (the flag that is STORED).
 */
export function withoutKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutKeys)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // A block with link annotations: `markDefs[]._key` is referenced from
    // `children[].marks`. An editor may re-key both together, so the keys are
    // renumbered and the references rewritten to match — then a
    // re-keyed-but-identical block compares equal, while swapping which text
    // carries which link still reads as a change. Renumbered in CANONICAL
    // order (by the annotation's own content), not array position: a message
    // merged in two passes (the composer before the portal link was known,
    // the server after, #1263) appends its annotations in a different order
    // than a single merge, and that order is not an edit.
    const rawMarkDefs = Array.isArray(obj.markDefs)
      ? (obj.markDefs as Array<Record<string, unknown>>)
      : undefined
    const markDefs = rawMarkDefs
      ? [...rawMarkDefs]
          .map((d) => ({ d, canonical: JSON.stringify(withoutKeys(d)) }))
          .sort((a, b) =>
            a.canonical < b.canonical ? -1 : a.canonical > b.canonical ? 1 : 0,
          )
          .map(({ d }) => d)
      : undefined
    const keyMap = new Map<string, string>()
    markDefs?.forEach((d, i) => {
      if (typeof d._key === 'string') keyMap.set(d._key, `m${i}`)
    })
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_key') continue
      if (
        (k === 'marks' || k === 'markDefs') &&
        Array.isArray(v) &&
        v.length === 0
      )
        continue
      if (k === 'style' && v === 'normal') continue
      if (k === 'markDefs' && markDefs) {
        out[k] = markDefs.map((d, i) => ({
          ...(withoutKeys(d) as object),
          _key: `m${i}`,
        }))
        continue
      }
      if (k === 'marks' && Array.isArray(v) && keyMap.size > 0) {
        out[k] = (v as string[]).map((m) => keyMap.get(m) ?? m)
        continue
      }
      if (k === 'children' && Array.isArray(v) && keyMap.size > 0) {
        out[k] = (v as Array<Record<string, unknown>>).map((child) => {
          const c = withoutKeys(child) as Record<string, unknown>
          if (Array.isArray(child.marks)) {
            const marks = (child.marks as string[]).map(
              (m) => keyMap.get(m) ?? m,
            )
            if (marks.length > 0) c.marks = marks
          }
          return c
        })
        continue
      }
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
        // Canonical (trimmed, lowercased; never NFKC — it is delivered to):
        // the ONE form the erasure's GROQ read can match with `lower()`
        // (#1265, `erasure-recipients.ts`). A contact typed with stray
        // whitespace is still mailed, and still findable.
        email: canonicalEmail(contact.email),
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
