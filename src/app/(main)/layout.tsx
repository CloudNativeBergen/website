import { Layout } from '@/components/Layout'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conference, error } = await getConferenceForCurrentDomain()
  return <Layout conference={conference}>{children}</Layout>
}
