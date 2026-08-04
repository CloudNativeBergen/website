'use client'

import type { ReactNode } from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { RichTextContentEditor } from '@/components/admin/RichTextContentEditor'
import { SECTION_LABELS, nextKey, type EditorRow } from '@/lib/homepage/editor'
import { VariantPicker, variantOptions } from './VariantPicker'
import { inputClass, rowBtnClass } from './styles'

/**
 * The per-section config panel of the composer rail — the layout picker first
 * (every type has one), then that type's own copy fields.
 *
 * MOVED, NOT REWRITTEN, out of the retired `HomepageSectionsEditor` modal. The
 * forms are unchanged in SHAPE on purpose: they are the surface organizers
 * already know, and the workspace's job is to put a real render next to them,
 * not to re-litigate every field.
 *
 * What DID change is that every field now carries a visible label. They used to
 * be bare boxes whose only name was an `aria-label`, which meant a sighted
 * organizer read the VALUE as the label — the featured-speakers panel showed a
 * box containing "Who you will hear" and nothing to say that this was the
 * heading rather than a stray line of page content. The `aria-label`s stay
 * alongside, because they carry the section name ("Featured Speakers heading")
 * that keeps every control on a thirteen-card rail uniquely addressable; each
 * one contains its visible label, so the accessible name still matches what is
 * on screen.
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
    <div className="space-y-3">
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

/**
 * One labelled control. The `<label>` wraps its input, so no id plumbing is
 * needed for a form that is rendered thirteen times over on one page.
 */
function Field({
  label,
  optional = false,
  children,
}: {
  label: string
  /** Renders a quiet "optional" marker rather than leaving it to guesswork. */
  optional?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
        {optional ? (
          <span className="font-normal text-gray-400 dark:text-gray-500">
            optional
          </span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

/** The grey explanatory line under a group of fields. */
function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-600 dark:text-gray-300">{children}</p>
}

/** Per-type copy/behaviour fields. `null` for a block with nothing but a layout. */
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
      <div className="space-y-3">
        <Field label="Headline" optional>
          <input
            type="text"
            value={row.heroHeadline ?? ''}
            onChange={(e) => onChange({ heroHeadline: e.target.value })}
            placeholder="Your conference name"
            aria-label="Hero headline override"
            className={inputClass}
          />
        </Field>
        <Field label="Sub-headline" optional>
          <textarea
            value={row.heroSubheadline ?? ''}
            onChange={(e) => onChange({ heroSubheadline: e.target.value })}
            placeholder="Your tagline"
            aria-label="Hero subheadline override"
            rows={2}
            className={inputClass}
          />
        </Field>
        <div className="space-y-2">
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Buttons{' '}
            <span className="font-normal text-gray-400 dark:text-gray-500">
              optional
            </span>
          </span>
          <Note>
            Leave these empty and the page picks the right buttons on its own as
            your conference moves from a call for speakers to selling tickets.
          </Note>
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
                ctaOverrides: [
                  ...ctas,
                  { _key: nextKey(), label: '', href: '' },
                ],
              })
            }
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300"
          >
            <PlusIcon className="h-4 w-4" /> Add a button
          </button>
        </div>
      </div>
    )
  }

  if (row._type === 'homepageCtaBanner') {
    return (
      <div className="space-y-3">
        <Field label="Heading">
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="Ready to join us?"
            aria-label="CTA banner heading"
            className={inputClass}
          />
        </Field>
        <Field label="Body" optional>
          <textarea
            value={row.body ?? ''}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder="A line or two under the heading"
            aria-label="CTA banner body"
            rows={2}
            className={inputClass}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Field label="Button label">
              <input
                type="text"
                value={row.buttonLabel ?? ''}
                onChange={(e) => onChange({ buttonLabel: e.target.value })}
                placeholder="Get tickets"
                aria-label="CTA banner button label"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Button link">
              <input
                type="text"
                value={row.buttonHref ?? ''}
                onChange={(e) => onChange({ buttonHref: e.target.value })}
                placeholder="/tickets"
                aria-label="CTA banner button link"
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </div>
    )
  }

  if (row._type === 'homepageRichText') {
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="A heading above your text"
            aria-label="Rich text heading"
            className={inputClass}
          />
        </Field>
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Text
          </span>
          <RichTextContentEditor
            value={row.content}
            onChange={(content) => onChange({ content })}
          />
        </div>
      </div>
    )
  }

  if (row._type === 'homepageSaveTheDate') {
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="Save the date"
            aria-label="Save the date heading"
            className={inputClass}
          />
        </Field>
        <Field label="Extra line" optional>
          <textarea
            rows={2}
            value={row.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Anything you want to add"
            aria-label="Save the date description"
            className={inputClass}
          />
        </Field>
        <Note>
          Shows your dates, venue, a countdown and what happens next — the call
          for speakers, the programme, tickets — from the dates you have already
          set. Steps with no date are left out rather than shown as unknown.
        </Note>
      </div>
    )
  }

  if (row._type === 'homepageMetrics') {
    return (
      <div className="space-y-2">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="A heading above the numbers"
            aria-label="Metrics heading"
            className={inputClass}
          />
        </Field>
        <Note>
          Shows the key numbers from your conference settings. Up to six of
          them.
        </Note>
      </div>
    )
  }

  if (row._type === 'homepageFaq') {
    const source = row.source ?? 'own'
    const items = row.faqItems ?? []
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="Frequently asked questions"
            aria-label="FAQ heading"
            className={inputClass}
          />
        </Field>
        <Field label="Questions to show">
          <select
            value={source}
            onChange={(e) =>
              onChange({ source: e.target.value as 'own' | 'ticketFaqs' })
            }
            aria-label="FAQ source"
            className={inputClass}
          >
            <option value="own">The ones written here</option>
            <option value="ticketFaqs">The ones from your tickets page</option>
          </select>
        </Field>
        {source === 'ticketFaqs' ? (
          <Note>
            Shows the questions from your tickets page — nothing to write here.
          </Note>
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
              className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300"
            >
              <PlusIcon className="h-4 w-4" /> Add a question
            </button>
          </>
        )}
      </div>
    )
  }

  if (row._type === 'homepageCountdown') {
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="A heading above the counter"
            aria-label="Countdown heading"
            className={inputClass}
          />
        </Field>
        <Field label="Count down to" optional>
          <input
            type="datetime-local"
            value={row.targetOverride ?? ''}
            onChange={(e) => onChange({ targetOverride: e.target.value })}
            aria-label="Countdown target override"
            className={inputClass}
          />
        </Field>
        <Note>Leave the date empty to count down to your start date.</Note>
        <Field label="Message once the date arrives" optional>
          <input
            type="text"
            value={row.liveMessage ?? ''}
            onChange={(e) => onChange({ liveMessage: e.target.value })}
            placeholder="We are live!"
            aria-label="Countdown live message"
            className={inputClass}
          />
        </Field>
        <Note>
          Leave the message empty and the counter disappears once the date has
          passed.
        </Note>
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
        ? 'Featured Speakers'
        : row._type === 'homepageOrganizers'
          ? 'Meet Our Organizers'
          : 'Conference Moments'
    // "the featured speakers themselves come from the conference configuration"
    // named a screen no organizer has ever seen. Each of these says what is set
    // here and where the content itself lives, in the words the admin uses.
    const note =
      row._type === 'homepageFeaturedSpeakers'
        ? 'Sets the wording only. Which speakers appear is chosen under Featured speakers.'
        : row._type === 'homepageOrganizers'
          ? 'Sets the wording only. Who appears comes from your list of organizers.'
          : 'Sets the wording only. Which photos appear is chosen in your photo gallery.'
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder={headingPlaceholder}
            aria-label={`${label} heading`}
            className={inputClass}
          />
        </Field>
        <Field label="Intro" optional>
          <textarea
            value={row.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="A line under the heading"
            aria-label={`${label} sub-heading`}
            rows={2}
            className={inputClass}
          />
        </Field>
        <Note>{note}</Note>
      </div>
    )
  }

  if (row._type === 'homepageSponsors') {
    const showCta = row.showCta !== false
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="Our sponsors"
            aria-label="Sponsors heading"
            className={inputClass}
          />
        </Field>
        <Field label="Intro" optional>
          <textarea
            value={row.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="A line under the heading"
            aria-label="Sponsors sub-heading"
            rows={2}
            className={inputClass}
          />
        </Field>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showCta}
            onChange={(e) => onChange({ showCta: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600"
          />
          Invite new sponsors at the end of the band
        </label>
        {showCta ? (
          <>
            <Field label="Invitation heading" optional>
              <input
                type="text"
                value={row.ctaHeading ?? ''}
                onChange={(e) => onChange({ ctaHeading: e.target.value })}
                placeholder="Become a Sponsor"
                aria-label="Sponsors call-to-action heading"
                className={inputClass}
              />
            </Field>
            <Field label="Invitation text" optional>
              <textarea
                value={row.ctaDescription ?? ''}
                onChange={(e) => onChange({ ctaDescription: e.target.value })}
                placeholder="Why someone should sponsor you"
                aria-label="Sponsors call-to-action body"
                rows={3}
                className={inputClass}
              />
            </Field>
          </>
        ) : null}
        <Note>
          Sets the wording only. Logos and tiers come from your sponsor list.
        </Note>
      </div>
    )
  }

  if (row._type === 'homepageVenue') {
    return (
      <div className="space-y-3">
        <Field label="Heading" optional>
          <input
            type="text"
            value={row.heading ?? ''}
            onChange={(e) => onChange({ heading: e.target.value })}
            placeholder="Venue"
            aria-label="Venue heading"
            className={inputClass}
          />
        </Field>
        <Field label="Description" optional>
          <textarea
            value={row.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Anything visitors should know about getting there"
            aria-label="Venue description"
            rows={2}
            className={inputClass}
          />
        </Field>
        <Note>
          The name and address come from your conference settings. “Get
          directions” links to a map built from the address.
        </Note>
      </div>
    )
  }

  return null
}
