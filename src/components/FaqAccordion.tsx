import { ChevronDownIcon } from '@heroicons/react/24/outline'

/** One FAQ entry. Structurally matches `TicketFaq` and `HomepageFaqItem`. */
export interface FaqEntry {
  _key?: string
  question: string
  answer: string
}

/**
 * Shared FAQ accordion — the native `<details>` disclosure list used on the
 * tickets page and by the homepage FAQ block, so both render an identical look
 * from a single source. Plain-text answers (matching how `ticketFaqs` models
 * them). Renders nothing when there are no entries.
 */
export function FaqAccordion({ faqs }: { faqs: FaqEntry[] }) {
  if (!faqs || faqs.length === 0) return null
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {faqs.map((faq) => (
        <details
          key={faq._key || faq.question}
          className="group rounded-xl bg-white/80 shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-gray-700"
        >
          <summary className="flex min-h-[44px] cursor-pointer items-center justify-between px-5 py-4">
            <span className="font-space-grotesk pr-4 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
              {faq.question}
            </span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-brand-cloud-blue transition-transform group-open:rotate-180 dark:text-blue-400" />
          </summary>
          <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-700">
            <p className="font-inter text-sm leading-relaxed whitespace-pre-line text-brand-slate-gray/80 dark:text-gray-300">
              {faq.answer}
            </p>
          </div>
        </details>
      ))}
    </div>
  )
}
