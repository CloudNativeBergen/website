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
 * contact when there is exactly one — `hasPrimaryContact`'s rule, restricted
 * to contacts that can actually receive mail. A primary contact WITHOUT an
 * email is therefore never the default (nothing could be sent to them), and
 * when they are the only primary the only other mailable contact stands in.
 */
export function defaultRecipientKey(
  contacts: readonly ContactPerson[] | undefined,
): string | undefined {
  const withEmail = (contacts ?? []).filter((c) => !!c.email)
  const primary = withEmail.find((c) => c.isPrimary)
  if (primary) return primary._key
  if (withEmail.length === 1) return withEmail[0]._key
  return undefined
}

/**
 * Shared between the router (which throws it) and the Send modal (which
 * recovers from it by dropping the stale provenance and sending again).
 */
export const TEMPLATE_NOT_FOUND_MESSAGE = 'Template not found'

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
  const unique = Array.from(new Set(keys))
  if (unique.length === 0) {
    throw new CommunicationRecipientError('Choose at least one recipient')
  }
  const defaultKey = defaultRecipientKey(contacts)
  return unique.map((key) => {
    const contact = (contacts ?? []).find((c) => c._key === key)
    if (!contact) {
      throw new CommunicationRecipientError(
        'A chosen recipient is not a contact on this sponsor',
      )
    }
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
