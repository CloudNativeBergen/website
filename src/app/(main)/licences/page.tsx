import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import type { Metadata } from 'next'
import { canonicalAlternates } from '@/lib/seo/canonical'
import { resolveMetadataBrand } from '@/lib/seo/brand'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMetadataBrand()
  return {
    title: { absolute: `Open-source licences - ${brand}` },
    description: `Notices for open-source software ${brand} ships to your browser.`,
    alternates: await canonicalAlternates('/licences'),
  }
}

/**
 * Notices the licences of software we ship require. There are none today:
 * the one that needed a notice — the FFmpeg-based AAC encoder for browsers
 * without their own — is no longer shipped, since we cannot provide the
 * source its LGPL requires (docs/MARKETING_STUDIO_VIDEO_PROOF.md §8). The
 * page stays, so a notice has somewhere to go when one is needed again.
 */
export default function LicencesPage() {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-4xl">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Open-source licences
          </h1>
          <div className="font-inter mt-6 space-y-6 text-lg tracking-tight text-brand-slate-gray dark:text-gray-300">
            <p>
              This site is built on open-source software. Most of it asks only
              for credit in its source, which it has there.
            </p>
            <p>
              None of the software we send to your browser currently asks us to
              show a notice here. When some does, its notice will be on this
              page.
            </p>
          </div>
        </div>
      </Container>
    </div>
  )
}
