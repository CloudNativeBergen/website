import { Layout } from '@/components/Layout'
import { ConditionalLightModeThemeProvider } from '@/components/providers/ConditionalLightModeThemeProvider'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conference, error } = await getConferenceForCurrentDomain()
  return (
    <ConditionalLightModeThemeProvider>
      <Layout conference={conference}>{children}</Layout>
    </ConditionalLightModeThemeProvider>
  )
}
