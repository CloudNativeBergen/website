/**
 * THE SENDER POLICY — which `From:` the platform Resend account may actually use
 * (RunKonf/platform#20).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 * `resolveConferenceFrom` picks a tenant-shaped sender — `contactEmail`, or
 * `<localPart>@<the conference's own domain>`. That is the right IDENTITY, but
 * it is not necessarily a DELIVERABLE one: on the shared email tier every send
 * goes through the PLATFORM's Resend account, and Resend rejects any `From:` on
 * a domain that is not verified for THAT account. A freshly provisioned tenant's
 * domain never is. Its mail is refused outright — and because the sign-in flow
 * is deliberately opaque (see `auth/email-link/request.ts`), nobody finds out.
 *
 * This was masked for as long as the platform had one tenant, whose domain IS
 * verified on the platform account.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE
 * ─────────────────────────────────────────────────────────────────────────────
 * The identity a tenant wants and the envelope Resend will accept are separated:
 *
 *   From:     <tenant display name> <noreply@[a platform-verified domain]>
 *   Reply-To: <the tenant's own address>
 *
 * so the recipient still sees the conference's name, and a reply still lands in
 * the organizers' inbox — while the message is one the platform account is
 * allowed to send. When the tenant's own domain IS verified on the platform
 * account (see {@link platformSendingDomains}) nothing is rewritten and it sends
 * as itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OPERATOR CONTRACT (two env vars)
 * ─────────────────────────────────────────────────────────────────────────────
 * - `EMAIL_FALLBACK_FROM` — the platform's own sender, as a full
 *   `"Name <address>"` header. Its address MUST be on a domain verified in the
 *   platform Resend account; it is the address every unverified tenant sends
 *   from. Unset ⇒ there is no deliverable sender to fall back to, so nothing is
 *   rewritten and every send from an unverified domain is logged loudly rather
 *   than silently replaced with something equally undeliverable.
 * - `EMAIL_SENDING_DOMAINS` — comma-separated list of every domain verified on
 *   the platform Resend account (the `EMAIL_FALLBACK_FROM` domain is always
 *   included implicitly). A tenant listed here keeps its own `From:`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SEAM: a tenant's OWN verified sender
 * ─────────────────────────────────────────────────────────────────────────────
 * Two paths exist for a tenant to send as itself, and both are already open:
 *
 * 1. VERIFIED ON THE PLATFORM ACCOUNT — add the tenant's sending domain to
 *    `EMAIL_SENDING_DOMAINS` once its DKIM/SPF records are verified in Resend.
 *    Today that list is static config; the seam for making it self-service is
 *    {@link platformSendingDomains}, which is the ONE place that answers "may
 *    the platform account send as this domain?". Replacing its body with a
 *    cached `resend.domains.list()` lookup (filtering `status === 'verified'`)
 *    is the whole change — no call site moves. What it additionally needs:
 *    per-tenant DNS instructions in the admin UI, a verification poller, and a
 *    cache with an invalidation hook, because a live API call must never sit in
 *    the path of an outbound send.
 * 2. A DEDICATED RESEND ACCOUNT — per-org credentials in `TENANT_SECRETS_JSON`
 *    (`resolveEmailSender`). That client is the tenant's own, so this policy
 *    does not apply to it at all (`'dedicated'`). Gating that on the
 *    `dedicated-email` PRO entitlement rather than on the mere presence of a
 *    secret is RunKonf/platform#26 — deliberately NOT done here.
 */

/** A parsed `"Name <address>"` (or bare `address`) header. */
export interface HeaderAddress {
  name?: string
  address: string
}

/**
 * Strip anything that could smuggle an extra header or nest brackets when a
 * value is re-interpolated into a `"Name <address>"` header.
 */
function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n<>]/g, '').trim()
}

/** Parse a `"Name <address>"` header; a bare address yields no name. */
export function parseAddress(header: string): HeaderAddress {
  const match = header.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (match) {
    const name = sanitizeHeaderText(match[1].replace(/^"|"$/g, ''))
    return { name: name || undefined, address: match[2].trim() }
  }
  return { address: header.trim() }
}

/** Render a `"Name <address>"` header (bare address when there is no name). */
export function formatAddress({ name, address }: HeaderAddress): string {
  const safeName = name ? sanitizeHeaderText(name) : ''
  const safeAddress = sanitizeHeaderText(address)
  return safeName ? `${safeName} <${safeAddress}>` : safeAddress
}

/** The domain part of an address, lowercased. `''` when there is none. */
export function addressDomain(address: string): string {
  const at = address.lastIndexOf('@')
  return at === -1
    ? ''
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase()
}

/**
 * The platform's own sender (`"Name <address>"`), or `null` when unconfigured.
 * This is the ONE reader of `EMAIL_FALLBACK_FROM`.
 */
export function platformSenderFrom(): string | null {
  const configured = process.env.EMAIL_FALLBACK_FROM?.trim()
  return configured ? configured : null
}

/**
 * Every domain the PLATFORM Resend account may send from: the configured
 * `EMAIL_SENDING_DOMAINS` list plus the platform sender's own domain.
 *
 * This is the seam described in the module comment — the single question "may
 * the platform account send as this domain?", answered from static config today
 * and from Resend's domains API when sending domains become self-service.
 */
export function platformSendingDomains(): Set<string> {
  const domains = new Set<string>()
  for (const entry of (process.env.EMAIL_SENDING_DOMAINS ?? '').split(',')) {
    const domain = entry.trim().toLowerCase()
    if (domain) domains.add(domain)
  }
  const platform = platformSenderFrom()
  if (platform) {
    const domain = addressDomain(parseAddress(platform).address)
    if (domain) domains.add(domain)
  }
  return domains
}

/** Whether the platform Resend account may send as this address. */
export function isPlatformSendableAddress(address: string): boolean {
  const domain = addressDomain(address)
  return domain !== '' && platformSendingDomains().has(domain)
}

export type SenderPolicyDecision =
  /** The From domain is verified on the platform account — sent as itself. */
  | 'tenant-verified'
  /** Rewritten to the platform sender; the tenant address moved to Reply-To. */
  | 'platform-rewritten'
  /** No platform sender configured — passed through, and this WILL be rejected. */
  | 'unconfigured'

export interface SenderPolicyResult {
  from: string
  replyTo?: string | string[]
  decision: SenderPolicyDecision
}

/**
 * `EMAIL_FALLBACK_FROM` is unset, so an unverified tenant `From:` cannot be
 * replaced with anything deliverable. Warn ONCE per From-domain per process:
 * this is a standing misconfiguration, not a per-message event, and a bulk
 * broadcast must not bury the log in thousands of identical lines.
 */
const warnedUnconfiguredDomains = new Set<string>()

/** Test seam: forget which domains have already warned. */
export function resetSenderPolicyWarnings(): void {
  warnedUnconfiguredDomains.clear()
}

/**
 * Apply the sender policy to an outbound message's `From:`/`Reply-To:`.
 *
 * An explicit `replyTo` from the caller is NEVER overwritten — a message that
 * already directs replies somewhere (a conversation thread, a sponsor contact)
 * keeps that routing, and only its envelope sender is corrected.
 */
export function applySenderPolicy(
  message: {
    from: string
    replyTo?: string | string[]
  },
  /**
   * `warn: false` for read-only inspection (the admin status page). Rendering a
   * page must never consume the once-per-domain warning that a real send needs.
   */
  { warn = true }: { warn?: boolean } = {},
): SenderPolicyResult {
  const wanted = parseAddress(message.from)

  if (isPlatformSendableAddress(wanted.address)) {
    return {
      from: message.from,
      replyTo: message.replyTo,
      decision: 'tenant-verified',
    }
  }

  const platform = platformSenderFrom()
  if (!platform) {
    const domain = addressDomain(wanted.address)
    if (warn && !warnedUnconfiguredDomains.has(domain)) {
      warnedUnconfiguredDomains.add(domain)
      console.error(
        '[email] no platform sender is configured (EMAIL_FALLBACK_FROM) and ' +
          `"${domain || wanted.address}" is not a platform sending domain — ` +
          'Resend will reject this send. Set EMAIL_FALLBACK_FROM to an address ' +
          'on a verified domain, and list every verified domain in ' +
          'EMAIL_SENDING_DOMAINS.',
      )
    }
    return {
      from: message.from,
      replyTo: message.replyTo,
      decision: 'unconfigured',
    }
  }

  const platformAddress = parseAddress(platform)
  return {
    // The tenant keeps its IDENTITY (display name); only the address — the part
    // Resend authorizes — becomes the platform's.
    from: formatAddress({
      name: wanted.name ?? platformAddress.name,
      address: platformAddress.address,
    }),
    // …and replies still reach the organizers.
    replyTo: message.replyTo ?? wanted.address,
    decision: 'platform-rewritten',
  }
}

/** Operator-facing summary of what a given `From:` will actually send as. */
export interface SenderPolicyDescription extends SenderPolicyResult {
  /** The address the tenant asked to send from. */
  requested: string
  /** Every domain the platform account may currently send from. */
  sendingDomains: string[]
}

export function describeSenderPolicy(from: string): SenderPolicyDescription {
  const result = applySenderPolicy({ from }, { warn: false })
  return {
    ...result,
    requested: parseAddress(from).address,
    sendingDomains: [...platformSendingDomains()].sort(),
  }
}
