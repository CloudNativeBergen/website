import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { BackgroundPatternProvider } from '@/components/BackgroundPatternProvider'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { Conference } from '@/lib/conference/types'

export async function Layout({
  children,
  conference,
  showFooter = true,
}: {
  children: React.ReactNode
  conference: Conference
  showFooter?: boolean
}) {
  return (
    <BackgroundPatternProvider
      pattern={normalizeBackgroundPattern(conference.backgroundPattern)}
    >
      <Header c={conference} />
      <main className="flex-auto">{children}</main>
      {showFooter && <Footer c={conference} />}
    </BackgroundPatternProvider>
  )
}
