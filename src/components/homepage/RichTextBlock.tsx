import { PortableText } from '@portabletext/react'
import { Container } from '@/components/Container'
import { portableTextComponents } from '@/lib/portabletext/components'
import type { RichTextSection } from '@/lib/homepage/sections'

/**
 * Generic portable-text block (front-page builder F2), rendered with the shared
 * {@link portableTextComponents} used elsewhere on the site. The registry is
 * closed to portable text only — no raw HTML/embeds — so brand styling and
 * safety stay under our control. Renders nothing when the content is empty.
 */
export function RichTextBlock({ section }: { section: RichTextSection }) {
  const { heading, content } = section
  if (!Array.isArray(content) || content.length === 0) return null
  return (
    <section className="py-20 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl lg:max-w-4xl">
          {heading ? (
            <h2 className="font-space-grotesk mb-6 text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
              {heading}
            </h2>
          ) : null}
          <div className="font-inter text-lg text-brand-slate-gray dark:text-gray-300">
            <PortableText value={content} components={portableTextComponents} />
          </div>
        </div>
      </Container>
    </section>
  )
}
