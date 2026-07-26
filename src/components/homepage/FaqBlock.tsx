import { Container } from '@/components/Container'
import { FaqAccordion } from '@/components/FaqAccordion'
import { DEFAULT_FAQ_HEADING, type FaqSection } from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'

/**
 * FAQ accordion block (front-page builder F4). Renders EITHER this block's own
 * items or — when `source === 'ticketFaqs'` — the existing `conference.ticketFaqs`,
 * so ticket FAQs are not duplicated. Uses the shared {@link FaqAccordion} so the
 * look matches the tickets page. Renders nothing when there are no entries.
 */
export function FaqBlock({
  section,
  conference,
}: {
  section: FaqSection
  conference: Conference
}) {
  const faqs =
    section.source === 'ticketFaqs'
      ? (conference.ticketFaqs ?? [])
      : (section.items ?? [])
  if (faqs.length === 0) return null
  const heading = section.heading?.trim() || DEFAULT_FAQ_HEADING
  return (
    <section className="py-20 sm:py-32">
      <Container>
        <h2 className="font-space-grotesk mb-10 text-center text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
          {heading}
        </h2>
        <FaqAccordion faqs={faqs} />
      </Container>
    </section>
  )
}
