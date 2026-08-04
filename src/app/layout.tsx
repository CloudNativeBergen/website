import { type Metadata, type Viewport } from 'next'
import {
  Inter,
  JetBrains_Mono,
  Space_Grotesk,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Bricolage_Grotesque,
} from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import Script from 'next/script'
import clsx from 'clsx'
import { headers } from 'next/headers'
import { Suspense } from 'react'

import '@/styles/tailwind.css'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isConferenceUnlisted } from '@/lib/conference/visibility'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { resolvePirschCode } from '@/lib/analytics'
import { canonicalOrigin } from '@/lib/seo/canonical'
import { DevBanner } from '@/components/DevBanner'
import {
  InstallPrompt,
  PwaInstallProvider,
  ServiceWorkerRegistrar,
} from '@/components/pwa'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { SessionProviderWrapper } from '@/components/providers/SessionProviderWrapper'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
})

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
})

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'

  // Normalize the metadata origin to the resolved edition's canonical
  // production host (its primary `domains` entry) so OpenGraph and canonical
  // URLs point at the real domain even when served from a preview or apex
  // host. When no conference resolves (e.g. localhost), this falls back to the
  // request host, keeping local development correct.
  const { conference } = await getConferenceForDomain(host)
  const metadataBase = new URL(canonicalOrigin(conference, host))
  const tenantBrand = conference?.title?.trim()
  const brand = tenantBrand || PLATFORM_NAME

  // The last-resort title/description differ by WHOSE surface this is. With a
  // tenant resolved they must stay generic-conference copy under that tenant's
  // name; with no tenant they describe the PLATFORM. They used to describe
  // Nordic Kubernetes events in both cases — one conference's subject matter
  // presented as every tenant's.
  const fallbackTagline = tenantBrand
    ? 'Program, speakers and tickets'
    : 'Run your conference'
  const fallbackDescription = tenantBrand
    ? `Program, speakers, tickets and call for papers for ${tenantBrand}.`
    : `${PLATFORM_NAME} gives conference organizers everything from call for papers to program, speakers and tickets.`

  return {
    metadataBase,
    // Unlisted (M0 trial) → tell crawlers not to index any page of this tenant.
    // The site still resolves for direct visitors; `noindex` (plus the blanket
    // robots.txt disallow) is what keeps it out of search results. ABSENT
    // visibility resolves to `live`, so this is omitted for every legacy
    // conference. Admin/portal routes set their own stricter robots metadata.
    ...(isConferenceUnlisted(conference)
      ? { robots: { index: false, follow: false } }
      : {}),
    title: {
      template: `%s - ${brand}`,
      default: `${brand} - ${conference?.tagline || fallbackTagline}`,
    },
    description: conference?.description || fallbackDescription,
    // PWA / installability. Next injects the manifest link automatically from
    // `app/manifest.ts`; here we add the iOS web-app meta and the icon links.
    // The apple-touch icon and favicons resolve per host via the dynamic
    // `/pwa/icon/*` routes, with committed static PNGs as the ultimate fallback.
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: brand,
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      ],
      apple: [{ url: '/pwa/icon/apple-touch', sizes: '180x180' }],
    },
  }
}

/**
 * Viewport-level `theme-color`, switched per color scheme so the browser UI
 * (Android status bar / desktop title bar) matches the page: white in light
 * mode, deep navy in dark mode.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
}

/**
 * Per-tenant analytics tag.
 *
 * Its own async component behind `<Suspense>`, NOT inline in the layout: reading
 * the request host is uncached data access, and doing it in the root layout body
 * would block the partial-prerender shell of every route in the app (the build
 * fails on `/speaker/[slug]` and `/cfp/admin` if you try). Streaming a `<script>`
 * in after the shell is fine — `strategy="afterInteractive"` already defers it.
 *
 * Renders NOTHING when the tenant has not configured a code. There is
 * deliberately no platform-level fallback: see `resolvePirschCode`.
 */
async function TenantAnalytics() {
  const headersList = await headers()
  const { conference } = await getConferenceForDomain(
    headersList.get('host') || 'localhost:3000',
  )
  const pirschCode = resolvePirschCode(conference?.analyticsPirschCode)
  if (!pirschCode) return null

  return (
    <Script
      defer
      src="https://api.pirsch.io/pa.js"
      id="pianjs"
      data-code={pirschCode}
      strategy="afterInteractive"
    />
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={clsx(
        'h-full antialiased',
        inter.variable,
        jetbrainsMono.variable,
        spaceGrotesk.variable,
        ibmPlexSans.variable,
        ibmPlexMono.variable,
        bricolageGrotesque.variable,
      )}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-detection"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  var activeTheme = theme === 'system' || !theme ? systemTheme : theme;

                  if (activeTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {
                  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                  }
                }
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-full bg-white dark:bg-gray-950">
        <ThemeProvider>
          <TRPCProvider>
            <PwaInstallProvider>
              <div className="flex w-full flex-col">
                <DevBanner />
                <Suspense>
                  <SessionProviderWrapper>{children}</SessionProviderWrapper>
                </Suspense>
                <InstallPrompt />
                <ServiceWorkerRegistrar />
              </div>
            </PwaInstallProvider>
          </TRPCProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        {/*
          Pirsch analytics — rendered ONLY when this tenant has configured its
          own identification code (`conference.analyticsPirschCode`). No code,
          no script: a tenant's traffic must never be collected into a property
          they do not own. The pa.js snippet also tracks custom click events
          declaratively via `data-pirsch-event` attributes — see the event
          naming scheme in src/lib/analytics.ts.
        */}
        <Suspense>
          <TenantAnalytics />
        </Suspense>
      </body>
    </html>
  )
}
