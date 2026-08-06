import { PlatformLockup } from './PlatformLockup'

/**
 * Shown when the conference read FAILED — when we do not know whether this Host
 * has a conference (#848).
 *
 * This screen exists because the alternative was a lie. A total Sanity/network
 * failure used to be indistinguishable from "no conference matched", so every
 * live tenant's site collapsed into `PlatformLanding` — "No conference here
 * yet… Is this your domain? Claim it" — and during an outage we invited
 * strangers to claim a paying customer's domain.
 *
 * Nothing here asserts anything about the Host: not that it is unclaimed, not
 * that it is claimed. It states only what is true — that we could not load the
 * site — and says to try again.
 *
 * NOINDEX is deliberate. A crawler that samples a tenant's homepage mid-outage
 * must not bank this page as that domain's content.
 */
export function PlatformUnavailable() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-brand-glacier-white px-6 py-16 dark:bg-gray-950">
      <meta name="robots" content="noindex, nofollow" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-sky-mist/60 via-transparent to-transparent dark:from-blue-950/40"
      />
      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        <PlatformLockup />

        <h1 className="font-jetbrains mt-10 text-3xl font-bold tracking-tighter text-brand-slate-gray sm:text-4xl dark:text-white">
          Temporarily unavailable
        </h1>

        <p className="font-inter mt-4 text-lg leading-relaxed text-brand-slate-gray/80 dark:text-gray-300">
          We couldn&apos;t load this site just now. This is a problem on our
          side, not with the address you used &mdash; please try again in a few
          minutes.
        </p>
      </div>
    </main>
  )
}
