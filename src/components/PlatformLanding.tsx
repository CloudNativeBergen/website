import { PLATFORM_NAME } from '@/lib/branding/platform'

export interface PlatformLandingProps {
  /**
   * Optional onboarding target. When set, a muted "Claim it" line links here so
   * a prospective organizer can start configuring their domain. Omitted from
   * the UI entirely when unset (e.g. `process.env.PLATFORM_SIGNUP_URL`).
   */
  signupUrl?: string
}

/**
 * The single platform-level experience shown for any Host that resolves to no
 * conference. Rendered by the (main) layout in place of the tenant chrome, so
 * every public page shares ONE well-designed unknown-host screen instead of a
 * grab-bag of per-page "Conference not found" errors.
 */
export function PlatformLanding({ signupUrl }: PlatformLandingProps) {
  // Scheme hardening: the URL comes from env config, but a misconfigured
  // value must never become a javascript:/data: anchor. https only.
  const safeSignupUrl =
    signupUrl && /^https:\/\//i.test(signupUrl) ? signupUrl : undefined
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-brand-glacier-white px-6 py-16 dark:bg-gray-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-sky-mist/60 via-transparent to-transparent dark:from-blue-950/40"
      />
      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        {/* This screen is the PLATFORM's own, not any tenant's, so it carries
            the platform's lockup — reproduced from konf.app's, which is the
            authority (RunKonf/landingpage `index.html`, `.brand-lockup`).

            The lockup is a badge MARK plus the word as LIVE TEXT, not a single
            piece of vector art: the mark is stroked ember on both grounds while
            the word takes the ground's foreground, and the trailing dot is
            ember in both. Geometry, stroke widths and the `#e8823c` ember are
            copied verbatim from konf.app; the font stack mirrors its
            `--display`. Redrawing the word as paths (what this used to do)
            produced a lockup that was subtly not the brand's — no dot, wrong
            letterforms. */}
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="h-14 w-14 flex-none"
            fill="none"
            stroke="#e8823c"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="28" y="20" width="44" height="60" rx="9" strokeWidth="7" />
            <line x1="44" y1="31" x2="56" y2="31" strokeWidth="6" />
            <line x1="42" y1="44" x2="42" y2="70" strokeWidth="7" />
            <path d="M58 44 L45 57 L58 70" strokeWidth="7" />
          </svg>
          <span
            className="text-5xl leading-none font-semibold tracking-[0.01em] text-brand-slate-gray dark:text-[#e9f0f4]"
            style={{
              fontFamily:
                "Futura, 'Avenir Next', 'Century Gothic', system-ui, sans-serif",
            }}
          >
            {PLATFORM_NAME.toLowerCase()}
            <span className="text-[#e8823c]">.</span>
          </span>
        </div>

        <h1 className="font-jetbrains mt-10 text-3xl font-bold tracking-tighter text-brand-slate-gray sm:text-4xl dark:text-white">
          No conference here yet
        </h1>

        <p className="font-inter mt-4 text-lg leading-relaxed text-brand-slate-gray/80 dark:text-gray-300">
          No conference is configured for this domain. If you reached this page
          by mistake, double-check the address.
        </p>

        {safeSignupUrl && (
          <p className="font-inter mt-8 text-sm text-brand-slate-gray/60 dark:text-gray-500">
            Is this your domain?{' '}
            <a
              href={safeSignupUrl}
              className="font-medium text-brand-cloud-blue underline underline-offset-4 hover:text-brand-cloud-blue-hover dark:text-blue-400 dark:hover:text-blue-300"
            >
              Claim it
            </a>
          </p>
        )}
      </div>
    </main>
  )
}
