'use client'

import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { RichTextContentEditor } from '@/components/admin/RichTextContentEditor'
import { SECTION_LABELS, nextKey, type EditorRow } from '@/lib/homepage/editor'
import { VariantPicker, variantOptions } from './VariantPicker'
import { inputClass, rowBtnClass } from './styles'

/**
 * The per-section config panel of the composer rail — the variant picker first
 * (every type has one), then that type's own copy fields.
 *
 * MOVED, NOT REWRITTEN, out of the retired `HomepageSectionsEditor` modal. The
 * forms are unchanged on purpose: they are the surface organizers already know,
 * and the workspace's job is to put a real render next to them, not to
 * re-litigate every field.
 *
 * WHY THESE STAY FORMS rather than becoming inline editing in the preview: FAQ
 * item lists, CTA label+href pairs, a rich-text editor with its own toolbar and
 * a `datetime-local` countdown target are genuinely form-shaped. Editing only
 * the easy strings in the preview would give one section two editing grammars,
 * and editable twins of thirteen section types would forfeit the byte-identical
 * render that makes the preview worth trusting.
 */
export function SectionConfig({
  row,
  onChange,
}: {
  row: EditorRow
  onChange: (patch: Partial<EditorRow>) => void
}) {
  return (
    <div className="space-y-2">
      <VariantPicker
        sectionLabel={SECTION_LABELS[row._type]}
        options={variantOptions(row._type)}
        value={row.variant}
        onChange={(variant) => onChange({ variant })}
      />
      <SectionFields row={row} onChange={onChange} />
    </div>
  )
}

/** Per-type copy/behaviour fields. `null` for a block with nothing but a variant. */
function SectionFields({
  row,
  onChange,
}: {
  row: EditorRow
  onChange: (patch: Partial<EditorRow>) => void
}) {
  if (row._type === 'homepageHero') {
    const ctas = row.ctaOverrides ?? []
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heroHeadline ?? ''}
          onChange={(e) => onChange({ heroHeadline: e.target.value })}
          placeholder="Headline override (optional)"
          aria-label="Hero headline override"
          className={inputClass}
        />
        <textarea
          value={row.heroSubheadline ?? ''}
          onChange={(e) => onChange({ heroSubheadline: e.target.value })}
          placeholder="Subheadline override (optional)"
          aria-label="Hero subheadline override"
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          CTA button overrides (optional — leave empty for smart phase buttons):
        </p>
        {ctas.map((cta, i) => (
          <div key={cta._key} className="flex items-start gap-1">
            <input
              type="text"
              value={cta.label}
              onChange={(e) =>
                onChange({
                  ctaOverrides: ctas.map((c, j) =>
                    j === i ? { ...c, label: e.target.value } : c,
                  ),
                })
              }
              placeholder="Label"
              aria-label={`CTA ${i + 1} label`}
              className={inputClass}
            />
            <input
              type="text"
              value={cta.href}
              onChange={(e) =>
                onChange({
                  ctaOverrides: ctas.map((c, j) =>
                    j === i ? { ...c, href: e.target.value } : c,
                  ),
                })
              }
              placeholder="/tickets"
              aria-label={`CTA ${i + 1} link`}
              className={inputClass}
            />
            <button
              type="button"
              className={`${rowBtnClass} hover:text-red-600`}
              onClick={() =>
                onChange({ ctaOverrides: ctas.filter((_, j) => j !== i) })
              }
              aria-label={`Remove CTA ${i + 1}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ctaOverrides: [...ctas, { _key: nextKey(), label: '', href: '' }],
            })
          }
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-cloud-blue"
        >
          <PlusIcon className="h-4 w-4" /> Add CTA
        </button>
      </div>
    )
  }

  if (row._type === 'homepageCtaBanner') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading *"
          aria-label="CTA banner heading"
          className={inputClass}
        />
        <textarea
          value={row.body ?? ''}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder="Body (optional)"
          aria-label="CTA banner body"
          rows={2}
          className={inputClass}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={row.buttonLabel ?? ''}
            onChange={(e) => onChange({ buttonLabel: e.target.value })}
            placeholder="Button label *"
            aria-label="CTA banner button label"
            className={inputClass}
          />
          <input
            type="text"
            value={row.buttonHref ?? ''}
            onChange={(e) => onChange({ buttonHref: e.target.value })}
            placeholder="Button link *"
            aria-label="CTA banner button link"
            className={inputClass}
          />
        </div>
      </div>
    )
  }

  if (row._type === 'homepageRichText') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Rich text heading"
          className={inputClass}
        />
        <RichTextContentEditor
          value={row.content}
          onChange={(content) => onChange({ content })}
        />
      </div>
    )
  }

  if (row._type === 'homepageSaveTheDate') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Save the date”)"
          aria-label="Save the date heading"
          className={inputClass}
        />
        <textarea
          rows={2}
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional — extra copy, no default)"
          aria-label="Save the date description"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Shows the dates, venue, a countdown, and what happens next (call for
          speakers, programme, tickets) from the dates already configured. Steps
          with no date are left out rather than shown as unknown. The
          description is an extra line on top of that — leave it empty and the
          card simply shows no extra line.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageMetrics') {
    return (
      <div>
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Metrics heading"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Uses the vanity metrics configured elsewhere on this page.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageFaq') {
    const source = row.source ?? 'own'
    const items = row.faqItems ?? []
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Frequently asked questions”)"
          aria-label="FAQ heading"
          className={inputClass}
        />
        <select
          value={source}
          onChange={(e) =>
            onChange({ source: e.target.value as 'own' | 'ticketFaqs' })
          }
          aria-label="FAQ source"
          className={inputClass}
        >
          <option value="own">Use this block&rsquo;s own items</option>
          <option value="ticketFaqs">Reuse the ticket FAQs</option>
        </select>
        {source === 'ticketFaqs' ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Renders the FAQs configured on the tickets page — nothing to edit
            here.
          </p>
        ) : (
          <>
            {items.map((item, i) => (
              <div
                key={item._key}
                className="space-y-1 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
              >
                <div className="flex items-start gap-1">
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) =>
                      onChange({
                        faqItems: items.map((it, j) =>
                          j === i ? { ...it, question: e.target.value } : it,
                        ),
                      })
                    }
                    placeholder="Question"
                    aria-label={`FAQ ${i + 1} question`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    className={`${rowBtnClass} hover:text-red-600`}
                    onClick={() =>
                      onChange({ faqItems: items.filter((_, j) => j !== i) })
                    }
                    aria-label={`Remove FAQ ${i + 1}`}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <textarea
                  value={item.answer}
                  onChange={(e) =>
                    onChange({
                      faqItems: items.map((it, j) =>
                        j === i ? { ...it, answer: e.target.value } : it,
                      ),
                    })
                  }
                  placeholder="Answer"
                  aria-label={`FAQ ${i + 1} answer`}
                  rows={2}
                  className={inputClass}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  faqItems: [
                    ...items,
                    { _key: nextKey(), question: '', answer: '' },
                  ],
                })
              }
              className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-cloud-blue"
            >
              <PlusIcon className="h-4 w-4" /> Add FAQ item
            </button>
          </>
        )}
      </div>
    )
  }

  if (row._type === 'homepageCountdown') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Countdown heading"
          className={inputClass}
        />
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          Target date/time override (optional — defaults to the conference
          start)
          <input
            type="datetime-local"
            value={row.targetOverride ?? ''}
            onChange={(e) => onChange({ targetOverride: e.target.value })}
            aria-label="Countdown target override"
            className={`${inputClass} mt-1`}
          />
        </label>
        <input
          type="text"
          value={row.liveMessage ?? ''}
          onChange={(e) => onChange({ liveMessage: e.target.value })}
          placeholder="Live message after the target (blank to hide)"
          aria-label="Countdown live message"
          className={inputClass}
        />
      </div>
    )
  }

  if (
    row._type === 'homepageFeaturedSpeakers' ||
    row._type === 'homepageOrganizers' ||
    row._type === 'homepageGallery'
  ) {
    const label = SECTION_LABELS[row._type]
    const headingPlaceholder =
      row._type === 'homepageFeaturedSpeakers'
        ? 'Heading (optional — default “Featured Speakers”)'
        : row._type === 'homepageOrganizers'
          ? 'Heading (optional — default “Meet Our Organizers”)'
          : 'Heading (optional — default “Conference Moments”)'
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder={headingPlaceholder}
          aria-label={`${label} heading`}
          className={inputClass}
        />
        <textarea
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Sub-heading (optional — leave blank for the default)"
          aria-label={`${label} sub-heading`}
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Copy only — the {label.toLowerCase()} themselves come from the
          conference configuration.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageSponsors') {
    const showCta = row.showCta !== false
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Our sponsors”)"
          aria-label="Sponsors heading"
          className={inputClass}
        />
        <textarea
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Sub-heading (optional — leave blank for the default)"
          aria-label="Sponsors sub-heading"
          rows={2}
          className={inputClass}
        />
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showCta}
            onChange={(e) => onChange({ showCta: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600"
          />
          Show the “Become a Sponsor” call-to-action
        </label>
        {showCta ? (
          <>
            <input
              type="text"
              value={row.ctaHeading ?? ''}
              onChange={(e) => onChange({ ctaHeading: e.target.value })}
              placeholder="Call-to-action heading (optional — default “Become a Sponsor”)"
              aria-label="Sponsors call-to-action heading"
              className={inputClass}
            />
            <textarea
              value={row.ctaDescription ?? ''}
              onChange={(e) => onChange({ ctaDescription: e.target.value })}
              placeholder="Call-to-action body (optional — leave blank for the default)"
              aria-label="Sponsors call-to-action body"
              rows={3}
              className={inputClass}
            />
          </>
        ) : null}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Copy only — sponsor logos and tiers come from the conference
          configuration.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageVenue') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Venue”)"
          aria-label="Venue heading"
          className={inputClass}
        />
        <textarea
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional)"
          aria-label="Venue description"
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Venue name and address come from the conference configuration. “Get
          directions” links to a map built from the address.
        </p>
      </div>
    )
  }

  return null
}
