import { BrandWordmark } from '@/components/BrandWordmark'
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
        {/* This screen is the PLATFORM's own, not any tenant's — so it carries
            the platform wordmark. It used to render the Cloud Native Days mark
            under an aria-label that already said "Konf". */}
        <BrandWordmark
          name={PLATFORM_NAME}
          variant="monochrome"
          className="h-16 w-auto text-brand-cloud-blue dark:text-white"
        />

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
