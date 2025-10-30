import { Layout } from '@/components/Layout'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { conference } = await getConferenceForCurrentDomain()
  return <Layout conference={conference}>{children}</Layout>
}
