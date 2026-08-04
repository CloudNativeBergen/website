import type {
  CreateBroadcastOptions,
  CreateBroadcastRequestOptions,
  CreateBroadcastResponse,
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
  Resend,
} from 'resend'
import {
  applySenderPolicy,
  formatAddress,
  parseAddress,
  type SenderPolicyDecision,
} from './sender-policy'

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
 * So all THREE guarantees live HERE, wrapped around the Resend client itself:
 *
 * 1. HEADER SANITISATION, on EVERY send, on EVERY client, unconditionally —
 *    see {@link sanitizeOutboundHeaders}.
 * 2. THE SENDER POLICY (`applySenderPolicy`) on the platform account, so a
 *    tenant on an unverified domain sends from the platform sender with its own
 *    address in `Reply-To:` — whatever the call site asked for. A tenant with
 *    its OWN Resend account is exempt from the POLICY (its domain is verified
 *    on ITS account, and rewriting would be wrong) but NOT from (1).
 * 3. EVERY FAILURE IS LOGGED, once, with enough context to name the tenant —
 *    whether Resend returns `{ error }` or the call throws, and no matter what
 *    the caller then does with the result. A call site can still choose to
 *    swallow a failure; it can no longer make it invisible.
 *
 * WHY (1) IS HERE AND NOT ONLY IN THE POLICY. Sanitisation used to happen as a
 * side effect of `applySenderPolicy` rebuilding the header — which meant it did
 * not happen at all on the DEDICATED-client path, where the policy is skipped by
 * design. The tenant-editable fields and the raw-interpolating send sites are
 * identical on both paths, so the injection was still open for exactly the
 * tenants who pay for their own Resend account. The lesson generalises: the
 * source is not a function the policy happens to call, it is the BOUNDARY where
 * a message leaves for Resend. Everything crossing it is sanitised, whichever
 * branch produced it.
 *
 * EVERY FROM-BEARING METHOD is wrapped — `emails.send`/`create`,
 * `batch.send`/`create`, `broadcasts.create`/`update` — not just the ones this
 * codebase happens to call today, so adopting one later cannot silently reopen
 * the hole. (`broadcasts.send` takes only an id.)
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
 * THE BOUNDARY GUARANTEE: no header leaving for Resend carries a CR/LF.
 *
 * Applied to every outbound `from`/`replyTo` on every client, INDEPENDENT of
 * the sender policy — the dedicated-client path skips the policy by design, and
 * it must not skip this. `formatAddress(parseAddress(x))` is the identity for a
 * well-formed header and a sanitising round-trip for anything else; it
 * TRUNCATES at the first break rather than deleting breaks, because deletion
 * splices the payload onto the value and, for an address, hands the attacker the
 * resulting domain (`a@evil.example\r\nb@verified.test` would collapse into one
 * address reading as `verified.test`). See `sanitizeHeaderText`.
 */
function sanitizeOutboundHeaders<
  T extends { from?: string; replyTo?: string | string[] },
>(payload: T): T {
  const clean = (value: string) => formatAddress(parseAddress(value))
  return {
    ...payload,
    ...(typeof payload.from === 'string' ? { from: clean(payload.from) } : {}),
    ...(payload.replyTo === undefined
      ? {}
      : {
          replyTo: Array.isArray(payload.replyTo)
            ? payload.replyTo.map(clean)
            : clean(payload.replyTo),
        }),
  }
}

/**
 * Decide the sender for one outbound message and sanitise its headers.
 *
 * The policy is skipped for a dedicated client; the sanitisation never is.
 */
function guardMessage<T extends { from?: string; replyTo?: string | string[] }>(
  payload: T,
  context: EmailClientContext,
): {
  message: T
  decision: SenderPolicyDecision | 'dedicated' | 'template-default'
} {
  // `from` is optional in Resend's type ONLY for a template-driven send, which
  // carries its own stored sender: there is nothing there to judge, so the
  // policy passes it through — but it is still sanitised and still logged.
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

  const message = sanitizeOutboundHeaders({
    ...payload,
    ...(policy.from === undefined ? {} : { from: policy.from }),
    ...(policy.replyTo === undefined ? {} : { replyTo: policy.replyTo }),
  } as T)

  return { message, decision: policy.decision }
}

/**
 * Wrap a Resend client's send methods with header sanitisation, the sender
 * policy and failure logging. Mutates and returns the client so that every
 * existing call site — including the ones that import the `resend` singleton
 * directly — is covered without moving.
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
      const { message, decision } = guardMessage(payload, context)

      const failureContext = {
        orgId: context.orgId,
        from: message.from,
        replyTo: message.replyTo,
        to: message.to,
        decision,
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

  // BATCH is a third send API: one call, an ARRAY of messages, each with its own
  // `from`. Unused by this codebase today — wrapped so that adopting it later
  // cannot silently reopen the hole.
  const batch = client.batch
  if (batch) {
    for (const method of ['send', 'create'] as const) {
      const original = batch[method]
      if (typeof original !== 'function') continue
      const bound = original.bind(batch) as (
        payload: CreateEmailOptions[],
        options?: unknown,
      ) => Promise<{ error?: unknown }>
      batch[method] = (async (
        payload: CreateEmailOptions[],
        options?: unknown,
      ) => {
        const guarded = payload.map((item) => guardMessage(item, context))
        const messages = guarded.map((g) => g.message)
        const failureContext = {
          orgId: context.orgId,
          from: messages[0]?.from,
          replyTo: messages[0]?.replyTo,
          decision: guarded[0]?.decision,
        }
        let result: { error?: unknown }
        try {
          result = await bound(messages, options)
        } catch (error) {
          logEmailSendFailure(failureContext, error)
          throw error
        }
        if (result?.error) logEmailSendFailure(failureContext, result.error)
        return result
      }) as typeof batch.send as typeof original
    }
  }

  // BROADCASTS are a fourth send API with their own `from`/`replyTo`, used by
  // the audience broadcast path (`lib/email/broadcast.ts`). `update` carries a
  // `from` too — a broadcast created clean and updated poisoned would otherwise
  // slip past — while `send` takes only an id and needs no guard.
  const broadcasts = client.broadcasts
  if (broadcasts) {
    const guardBroadcast = <P extends CreateBroadcastOptions>(
      original: (
        payload: P,
        options?: CreateBroadcastRequestOptions,
      ) => unknown,
    ) => {
      return async (payload: P, options?: CreateBroadcastRequestOptions) => {
        const { message, decision } = guardMessage(payload, context)
        const failureContext = {
          orgId: context.orgId,
          from: message.from,
          replyTo: message.replyTo,
          decision,
        }
        let result: CreateBroadcastResponse
        try {
          result = (await original(
            message,
            options,
          )) as unknown as CreateBroadcastResponse
        } catch (error) {
          logEmailSendFailure(failureContext, error)
          throw error
        }
        if (result?.error) logEmailSendFailure(failureContext, result.error)
        return result
      }
    }

    if (typeof broadcasts.create === 'function') {
      broadcasts.create = guardBroadcast(
        broadcasts.create.bind(broadcasts),
      ) as typeof broadcasts.create
    }
    if (typeof broadcasts.update === 'function') {
      const originalUpdate = broadcasts.update.bind(broadcasts)
      broadcasts.update = (async (
        id: string,
        payload: Parameters<typeof broadcasts.update>[1],
      ) => {
        const { message } = guardMessage(payload, context)
        return originalUpdate(id, message)
      }) as typeof broadcasts.update
    }
  }

  return client
}
