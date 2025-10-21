import { type Metadata } from 'next'
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

import '@/styles/tailwind.css'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import { DevBanner } from '@/components/DevBanner'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

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

  const protocol = host.includes('localhost') ? 'http' : 'https'
  const metadataBase = new URL(`${protocol}://${host}`)

  return {
    metadataBase,
    title: {
      template: '%s - Cloud Native Day Bergen',
      default:
        'Cloud Native Day Bergen - A community-driven Kubernetes and Cloud conference',
    },
    description:
      'At Cloud Native Day Bergen, we bring together the community to share knowledge and experience on Kubernetes, Cloud Native, and related technologies.',
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session?.user) {
    // TODO: Look into https://react.dev/reference/react/experimental_taintObjectReference

    session.user = {
      name: session.user.name,
      email: session.user.email,
      picture: session.user.picture,
    }
  }

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
          <div className="flex w-full flex-col">
            <DevBanner />
            <SessionProvider session={session}>{children}</SessionProvider>
          </div>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <Script
          defer
          src="https://api.pirsch.io/pa.js"
          id="pianjs"
          data-code="Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
