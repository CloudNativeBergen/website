import { Footer } from '@/components/Footer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conference, error } = await getConferenceForCurrentDomain()

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">{children}</main>
      <Footer c={conference} />
    </div>
  )
}
