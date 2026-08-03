import { Container } from '@/components/Container'
import { RichTextContent } from './RichTextContent'
import {
  isRichTextContentEmpty,
  sanitizeRichTextContent,
} from '@/lib/homepage/richText'
import type { RichTextSection } from '@/lib/homepage'

/**
 * The homepage's constrained escape hatch (front-page builder F2).
 *
 * The section registry stays CLOSED — there is still no raw-HTML or embed block
 * — but this one block carries an allowlisted rich-content vocabulary (prose,
 * lists, safe links, code/preformatted, images from our own asset pipeline,
 * small tables, callouts) so a conference can express its one distinctive thing
 * without the platform growing a `dangerouslySetInnerHTML`. The vocabulary and
 * the reasoning live in `@/lib/homepage/richText`; {@link RichTextContent}
 * sanitizes before rendering. Renders nothing when the content is empty.
 */
export function RichTextBlock({ section }: { section: RichTextSection }) {
  const { heading, content } = section
  const blocks = sanitizeRichTextContent(content)
  if (blocks.length === 0 || isRichTextContentEmpty(blocks)) return null
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
            <RichTextContent content={blocks} />
          </div>
        </div>
      </Container>
    </section>
  )
}
