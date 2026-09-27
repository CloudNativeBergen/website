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

const link =
  'text-brand-cloud-blue underline hover:text-brand-slate-gray dark:text-blue-400'

/**
 * Notices the licences of software we ship require. Today that is one: the
 * studio's AAC encoder for browsers without their own (the studio video
 * proof, docs/MARKETING_STUDIO_VIDEO_PROOF.md §2 and §8), which is FFmpeg's
 * libavcodec under the LGPL.
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
              for credit in its source; the notices below are the ones its
              licences ask us to show you.
            </p>
            <section aria-labelledby="aac-encoder" className="space-y-4">
              <h2
                id="aac-encoder"
                className="font-jetbrains text-2xl font-bold text-brand-slate-gray dark:text-white"
              >
                AAC audio encoder (FFmpeg libavcodec)
              </h2>
              <p>
                When an organizer exports a studio video with music in a browser
                that cannot encode AAC audio itself, such as Firefox, the
                browser loads{' '}
                <a
                  className={link}
                  href="https://github.com/Vanilagy/mediabunny/tree/main/packages/aac-encoder"
                >
                  @mediabunny/aac-encoder
                </a>{' '}
                1.59.0 (MPL-2.0). It contains a WebAssembly build of the AAC
                encoder from{' '}
                <a className={link} href="https://ffmpeg.org">
                  FFmpeg
                </a>
                &apos;s libavcodec (version 62.23.103), which is licensed under
                the{' '}
                <a
                  className={link}
                  href="https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html"
                >
                  GNU Lesser General Public License, version 2.1
                </a>{' '}
                or later.
              </p>
              <p>
                libavcodec is free software: you can redistribute it and/or
                modify it under the terms of that licence. It is distributed in
                the hope that it will be useful, but WITHOUT ANY WARRANTY;
                without even the implied warranty of MERCHANTABILITY or FITNESS
                FOR A PARTICULAR PURPOSE. See the licence for more details.
              </p>
              <p>
                The source code of FFmpeg is available from{' '}
                <a className={link} href="https://ffmpeg.org/download.html">
                  ffmpeg.org
                </a>
                , and the build scripts for this encoder from{' '}
                <a
                  className={link}
                  href="https://github.com/Vanilagy/mediabunny/tree/main/packages/aac-encoder"
                >
                  Mediabunny&apos;s repository
                </a>
                . The encoder is a separate file your browser fetches on its
                own, so it can be replaced with a modified version.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </div>
  )
}
