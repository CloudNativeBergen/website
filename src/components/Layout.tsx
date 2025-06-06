import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
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
    <>
      <Header c={conference} />
      <main className="flex-auto">{children}</main>
      {showFooter && <Footer c={conference} />}
    </>
  )
}
