import type {
  CreateBroadcastOptions,
  CreateBroadcastRequestOptions,
  CreateBroadcastResponse,
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
  Resend,
} from 'resend'
import { applySenderPolicy, type SenderPolicyDecision } from './sender-policy'

/**
 * THE CHOKE POINT (RunKonf/platform#20).
 *
 * There are twenty-odd `resend.emails.send(...)` call sites in this codebase.
 * Some resolve their `From:` through `resolveConferenceFrom`, several build it
 * inline (`${conference.organizer} <${conference.cfpEmail}>`), and each handles
 * a failed send in its own way — a few return `false`, some log, some throw, and
 * at least one swallows the error into a boolean nobody reads. A sender policy
 * enforced by "every author remembers to call the helper" is not enforced, and
 * an observability rule spread over twenty error branches is not a rule.
 *
 * So both live HERE, wrapped around the Resend client itself:
 *
 * 1. THE SENDER POLICY (`applySenderPolicy`) is applied to every outbound
 *    message on the platform account, so a tenant on an unverified domain sends
 *    from the platform sender with its own address in `Reply-To:` — whatever the
 *    call site asked for. A tenant with its OWN Resend account is exempt: its
 *    domain is verified on ITS account, and rewriting would be wrong.
 * 2. EVERY FAILURE IS LOGGED, once, with enough context to name the tenant —
 *    whether Resend returns `{ error }` or the call throws, and no matter what
 *    the caller then does with the result. A call site can still choose to
 *    swallow a failure; it can no longer make it invisible.
 *
 * WHAT IS AND IS NOT LOGGED: the `From:`/`Reply-To:` (tenant-identifying, and
 * not personal data), the policy decision, the Resend error name/message, and
 * the recipients' DOMAINS only. Never a recipient address, never a subject —
 * a sign-in email's subject and recipient are exactly what the anti-enumeration
 * design refuses to disclose, and logs are read by more people than the mailbox.
 */

export interface EmailClientContext {
  /** The organization this client sends for, when known. */
  orgId?: string | null
  /**
   * `false` for a tenant's OWN Resend account (per-org credentials): its
   * sending domains are verified there, so the platform policy does not apply.
   */
  enforceSenderPolicy: boolean
}

/** Recipient DOMAINS only — never the addresses. */
function recipientDomains(to: CreateEmailOptions['to']): string[] {
  const list = Array.isArray(to) ? to : [to]
  const domains = new Set<string>()
  for (const address of list) {
    if (typeof address !== 'string') continue
    const at = address.lastIndexOf('@')
    if (at !== -1)
      domains.add(
        address
          .slice(at + 1)
          .trim()
          .toLowerCase(),
      )
  }
  return [...domains]
}

function errorSummary(error: unknown): { name?: string; message: string } {
  if (error && typeof error === 'object') {
    const err = error as { name?: string; message?: string }
    return { name: err.name, message: err.message ?? String(error) }
  }
  return { message: String(error) }
}

/**
 * Log a failed send with tenant-identifying context.
 *
 * This is the line that matters most where the CALLER is required to stay
 * silent: `lib/auth/email-link/send.ts` reports into a deliberately opaque
 * anti-enumeration response, so this — plus its own `[email-link]` line, which
 * adds the conference name — is the only trace that a tenant cannot sign in.
 *
 * Exported so a caller with richer context can report a failure it detected
 * outside a send call in the same shape.
 */
export function logEmailSendFailure(
  context: {
    orgId?: string | null
    /** Absent only for a Resend-template send, which carries its own sender. */
    from?: string
    replyTo?: string | string[]
    to?: CreateEmailOptions['to']
    /**
     * `'dedicated'` — a tenant's own Resend account, exempt from the policy.
     * `'template-default'` — a Resend-template send with no explicit sender.
     */
    decision?: SenderPolicyDecision | 'dedicated' | 'template-default'
  },
  error: unknown,
): void {
  console.error('[email] send failed', {
    orgId: context.orgId ?? undefined,
    from: context.from,
    replyTo: context.replyTo,
    recipientDomains: context.to ? recipientDomains(context.to) : undefined,
    senderPolicy: context.decision,
    error: errorSummary(error),
  })
}

/**
 * Wrap a Resend client's send methods with the sender policy and failure
 * logging. Mutates and returns the client so that every existing call site —
 * including the ones that import the `resend` singleton directly — is covered
 * without moving.
 */
export function instrumentResendClient(
  client: Resend,
  context: EmailClientContext,
): Resend {
  const emails = client.emails
  const guard = (
    original: (
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ) => Promise<CreateEmailResponse>,
  ) => {
    return async (
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): Promise<CreateEmailResponse> => {
      // `from` is optional in Resend's type ONLY for a template-driven send,
      // which carries its own stored sender: there is nothing here to judge, so
      // it passes through untouched — but it is still covered by the logging.
      const policy =
        context.enforceSenderPolicy && typeof payload.from === 'string'
          ? applySenderPolicy({ from: payload.from, replyTo: payload.replyTo })
          : {
              from: payload.from,
              replyTo: payload.replyTo,
              decision: context.enforceSenderPolicy
                ? ('template-default' as const)
                : ('dedicated' as const),
            }

      const message = {
        ...payload,
        ...(policy.from === undefined ? {} : { from: policy.from }),
        ...(policy.replyTo === undefined ? {} : { replyTo: policy.replyTo }),
      } as CreateEmailOptions

      const failureContext = {
        orgId: context.orgId,
        from: message.from,
        replyTo: message.replyTo,
        to: message.to,
        decision: policy.decision,
      }

      let result: CreateEmailResponse
      try {
        result = await original(message, options)
      } catch (error) {
        logEmailSendFailure(failureContext, error)
        throw error
      }
      if (result?.error) logEmailSendFailure(failureContext, result.error)
      return result
    }
  }

  // `create` is Resend's alias for `send`; both are guarded so neither is a way
  // around the policy. `create` is probed rather than assumed so a test double
  // (or an SDK that drops the alias) cannot turn instrumentation into a crash.
  emails.send = guard(emails.send.bind(emails))
  if (typeof emails.create === 'function') {
    emails.create = guard(emails.create.bind(emails))
  }

  // BROADCASTS are a second send API with its own `from`/`replyTo`, used by the
  // audience broadcast path (`lib/email/broadcast.ts`) — an unguarded broadcast
  // would be a hole in exactly the policy this module exists to make
  // unbypassable. Same guard, different payload type.
  const broadcasts = client.broadcasts
  if (broadcasts && typeof broadcasts.create === 'function') {
    const originalCreate = broadcasts.create.bind(broadcasts)
    broadcasts.create = (async (
      payload: CreateBroadcastOptions,
      options?: CreateBroadcastRequestOptions,
    ) => {
      const policy = context.enforceSenderPolicy
        ? applySenderPolicy({ from: payload.from, replyTo: payload.replyTo })
        : {
            from: payload.from,
            replyTo: payload.replyTo,
            decision: 'dedicated' as const,
          }
      const message = {
        ...payload,
        from: policy.from,
        ...(policy.replyTo === undefined ? {} : { replyTo: policy.replyTo }),
      } as CreateBroadcastOptions

      const failureContext = {
        orgId: context.orgId,
        from: message.from,
        replyTo: message.replyTo,
        decision: policy.decision,
      }
      let result: CreateBroadcastResponse
      try {
        result = await originalCreate(message, options)
      } catch (error) {
        logEmailSendFailure(failureContext, error)
        throw error
      }
      if (result?.error) logEmailSendFailure(failureContext, result.error)
      return result
    }) as typeof broadcasts.create
  }

  return client
}
