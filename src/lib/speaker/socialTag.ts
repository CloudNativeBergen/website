/**
 * "Don't tag me in social posts" — the speaker's opt-out from being
 * @-mentioned in marketing posts (#1148, `docs/MARKETING_TAGGING_SPEC.md`
 * §3.2). NOTHING READS IT YET, by design: it ships before the first tag so
 * there is never a version that tags people who cannot say no.
 *
 * This module holds the rule, as a pure function, so that both speaker paths
 * (`speaker.update`) and the organizer path (`speaker.admin.update`) get the
 * same answer — they reach the same writer, and the writer asks this.
 */

/**
 * WHO is asking for the change. There is no default: a caller that does not
 * say is a caller that has not thought about it, and the whole point of this
 * field is that an organizer's powers over it differ from the speaker's.
 */
export type SpeakerUpdateActor = 'self' | 'organizer'

/**
 * An organizer tried to clear a speaker's opt-out. Thrown BEFORE any write, so
 * a refusal leaves the stored value exactly as it was.
 *
 * A distinct class rather than a message: `speaker.admin.update` maps it to a
 * `FORBIDDEN`, and every other failure in that path is an infrastructure error
 * that must stay a 500.
 */
export class SocialTagOptOutClearForbiddenError extends Error {
  constructor() {
    super(
      'Only the speaker can withdraw their own opt-out from social-post tags.',
    )
    this.name = 'SocialTagOptOutClearForbiddenError'
  }
}

/** The opt-out half of a speaker patch, in Sanity patch operations. */
export interface SocialTagOptOutPatch {
  set: { socialTagOptOut?: boolean }
  /**
   * `setIfMissing`, not `set`, so re-saving a profile that is ALREADY opted out
   * keeps the original timestamp. The field means "when it was set", and a
   * profile save that changes nothing about the opt-out must not restamp it.
   * Clearing unsets it, so a later re-opt-out stamps afresh.
   */
  setIfMissing: { socialTagOptOutAt?: string }
  unset: string[]
}

const NO_CHANGE: SocialTagOptOutPatch = Object.freeze({
  set: {},
  setIfMissing: {},
  unset: [],
})

/**
 * Resolve what a speaker patch should do about the opt-out.
 *
 * `stored` is consulted ONLY on the organizer-clear branch, which is why the
 * writer only has to read it there. That is not an optimisation: the organizer
 * path never emits a clear under ANY stored value, so the read cannot race a
 * clear into place — it only decides between refusing loudly and doing nothing.
 *
 * @throws SocialTagOptOutClearForbiddenError when an organizer tries to clear
 * an opt-out that is actually set.
 */
export function resolveSocialTagOptOut({
  actor,
  requested,
  stored,
  now,
}: {
  actor: SpeakerUpdateActor
  requested: boolean
  /** The value currently in Sanity. Only meaningful for an organizer clear. */
  stored: boolean
  /** Server clock, ISO 8601. Never a client-supplied value. */
  now: string
}): SocialTagOptOutPatch {
  if (requested) {
    // Both actors may SET it. An organizer doing so on a speaker's behalf is
    // the supported way to honour a request made by email or in person.
    return {
      set: { socialTagOptOut: true },
      setIfMissing: { socialTagOptOutAt: now },
      unset: [],
    }
  }

  if (actor === 'organizer') {
    if (stored) throw new SocialTagOptOutClearForbiddenError()
    // Not opted out, and the admin form submits the whole profile on every
    // save — so this is an ordinary save, not an attempt to clear anything.
    return NO_CHANGE
  }

  // The speaker withdraws their own opt-out. Both fields go: the timestamp
  // records when an opt-out was set, and there is no longer one.
  return {
    set: {},
    setIfMissing: {},
    unset: ['socialTagOptOut', 'socialTagOptOutAt'],
  }
}
