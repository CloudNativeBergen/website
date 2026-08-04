import { Container } from '@/components/Container'
import { FaqAccordion, type FaqEntry } from '@/components/FaqAccordion'
import { DEFAULT_FAQ_HEADING, type FaqSection } from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'
import { resolveVariant } from '@/lib/homepage/variants'

/**
 * Every question and its answer, open, with NO disclosure widget at all.
 *
 * MARKUP, deliberately chosen. The obvious shortcut — reuse {@link FaqAccordion}
 * and put `open` on every `<details>` — is wrong: an open `<details>` still
 * exposes a `summary` button and is still announced as expandable/collapsible,
 * so assistive tech would offer an interaction this variant does not have, and a
 * keyboard user would tab through controls that do nothing but re-hide content
 * the organizer asked to keep visible. Instead each entry is a plain heading
 * plus a paragraph: `<h3>` under the block's `<h2>`, so the questions join the
 * document's heading outline and a screen-reader user can jump question to
 * question — which is the whole point of a variant meant to be SKIMMED. The
 * `<ul role="list">` gives the set a count ("list, 6 items"); the explicit role
 * is required because Tailwind's reset strips list semantics in Safari/VoiceOver.
 *
 * Two columns from `md` up via CSS multi-column — the house pattern already used
 * on the staff page — with `break-inside-avoid` so a question is never split
 * across the column (or page) break. One column on a phone. Multi-column rather
 * than a grid because a grid's rows are as tall as their tallest cell, which
 * leaves ragged gaps between answers of unequal length.
 *
 * The per-entry chrome is the accordion's, unchanged, so a tenant switching
 * variants keeps a surface they recognise — what moves is that nothing is
 * hidden and nothing is clickable.
 */
function FaqOpenList({ faqs }: { faqs: FaqEntry[] }) {
  return (
    <ul
      role="list"
      className="mx-auto max-w-3xl columns-1 gap-6 md:max-w-5xl md:columns-2"
    >
      {faqs.map((faq) => (
        <li
          key={faq._key || faq.question}
          className="mb-6 break-inside-avoid rounded-xl bg-white/80 shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-gray-700"
        >
          <h3 className="font-space-grotesk px-5 py-4 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
            {faq.question}
          </h3>
          <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-700">
            <p className="font-inter text-sm leading-relaxed whitespace-pre-line text-brand-slate-gray/80 dark:text-gray-300">
              {faq.answer}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * FAQ block (front-page builder F4). Renders EITHER this block's own items or —
 * when `source === 'ticketFaqs'` — the existing `conference.ticketFaqs`, so
 * ticket FAQs are not duplicated. Renders nothing when there are no entries.
 *
 * VARIANTS. `accordion` (the default) is today's rendering, unchanged: the
 * shared {@link FaqAccordion} disclosure list, so the look matches the tickets
 * page. `list` opens every answer at once and drops the disclosure entirely (see
 * {@link FaqOpenList}) — the right shape for a short FAQ, or a page meant to be
 * skimmed or printed, where clicking six times to read six answers is the only
 * thing standing between a visitor and the information.
 *
 * The `source` toggle is orthogonal to the variant: either source renders in
 * either variant.
 */
export function FaqBlock({
  section,
  conference,
}: {
  section: FaqSection
  conference: Conference
}) {
  const variant = resolveVariant('homepageFaq', section.variant)
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
        {variant === 'list' ? (
          <FaqOpenList faqs={faqs} />
        ) : (
          <FaqAccordion faqs={faqs} />
        )}
      </Container>
    </section>
  )
}
