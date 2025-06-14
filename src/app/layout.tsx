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
import clsx from 'clsx'

import '@/styles/tailwind.css'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'

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

export const metadata: Metadata = {
  title: {
    template: '%s - Cloud Native Day Bergen',
    default:
      'Cloud Native Day Bergen - A community-driven Kubernetes and Cloud conference',
  },
  description:
    'At Cloud Native Day Bergen, we bring together the community to share knowledge and experience on Kubernetes, Cloud Native, and related technologies.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session?.user) {
    // TODO: Look into https://react.dev/reference/react/experimental_taintObjectReference
    // filter out sensitive data before passing to client.
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
        'h-full bg-white antialiased',
        inter.variable,
        jetbrainsMono.variable,
        spaceGrotesk.variable,
        ibmPlexSans.variable,
        ibmPlexMono.variable,
        bricolageGrotesque.variable,
      )}
    >
      <body className="flex min-h-full">
        <div className="flex w-full flex-col">
          <SessionProvider session={session}>{children}</SessionProvider>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
