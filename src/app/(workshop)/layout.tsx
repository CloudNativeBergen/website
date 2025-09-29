import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components'
import { Layout } from '@/components/Layout'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { notFound } from 'next/navigation'
import { TRPCProvider } from '@/components/providers/TRPCProvider'

export default async function WorkshopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { conference, error } = await getConferenceForCurrentDomain()

  if (error || !conference?._id) {
    notFound()
  }

  return (
    <Layout conference={conference}>
      <AuthKitProvider>
        <TRPCProvider>
          {children}
        </TRPCProvider>
      </AuthKitProvider>
    </Layout>
  )
}