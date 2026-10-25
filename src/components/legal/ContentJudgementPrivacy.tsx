import { ScaleIcon } from '@heroicons/react/24/outline'

/**
 * Automatic checks on /privacy (Content judgement spec §13.2). Unlike the
 * Photo Wall and Session Feedback cards this one is CONDITIONAL: the page
 * renders it exactly when the subprocessor disclosure lists OpenRouter, i.e.
 * while the organization has content judgement on or still stores any
 * Judgement (a failed read renders it rather than hiding it).
 */
export function ContentJudgementPrivacy() {
  return (
    <div
      id="automatic-checks"
      className="scroll-mt-24 rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20"
    >
      <h3 className="mb-4 flex items-center text-lg font-semibold text-amber-900 dark:text-amber-200">
        <ScaleIcon className="mr-3 size-5" />
        Automatic checks on what you write
      </h3>
      <div className="space-y-3 text-sm text-amber-900 dark:text-amber-200">
        <p>
          The organizers of this conference use an automatic classifier to help
          them moderate. It reads photo-wall posts (the photo and its caption),
          comments on session feedback, and the first message of a conversation
          with the organizers, and gives the organizers advice: whether the
          content may be abusive, sexual, spam or contain personal details, and
          which topic a message is about.
        </p>
        <p>
          The content is sent through OpenRouter to TypeSafe&apos;s Jev
          classifier in the United States, under the EU Standard Contractual
          Clauses, with zero data retention: neither keeps it after answering,
          and it is not used to train models. We store the classifier&apos;s
          scores and the message topic, a fingerprint of what was checked, which
          version of the classifier answered, when, and whether an organizer
          kept a flagged comment, but never a copy of your text or photo. We
          delete it within a day after the content itself is deleted.
        </p>
        <p>
          The advice is shown to organizers only. A person always decides; the
          organizers may have chosen to hide a comment or hold a photo
          automatically until one of them has looked at it. The legal basis is
          the organizers&apos; legitimate interest in keeping the
          conference&apos;s spaces safe.
        </p>
      </div>
    </div>
  )
}
