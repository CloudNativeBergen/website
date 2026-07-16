import type { Metadata } from 'next'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { InstallGuide } from '@/components/pwa/InstallGuide'
import { canonicalAlternates } from '@/lib/seo/canonical'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Install the app - Cloud Native Days Norway',
    description:
      'Install Cloud Native Days on your phone or computer for fast, full-screen, offline-ready access to the schedule — with step-by-step instructions for your device.',
    alternates: await canonicalAlternates('/install'),
  }
}

export default function InstallPage() {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Get the app
          </h1>
          <p className="font-inter mt-6 text-lg text-brand-slate-gray dark:text-gray-300">
            Add Cloud Native Days to your device for a faster, full-screen,
            offline-ready experience. Follow the steps for your browser below.
          </p>
        </div>
        <div className="mt-12">
          <InstallGuide />
        </div>
      </Container>
    </div>
  )
}
