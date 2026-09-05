import clsx from 'clsx'
import { BackgroundImage } from '@/components/BackgroundImage'
import type { HeroCtaOverride } from '@/lib/homepage'
import { resolveVariant, type SectionVariant } from '@/lib/homepage/variants'
import { Button } from '@/components/Button'
import { CollapsibleDescription } from '@/components/CollapsibleDescription'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { Container } from '@/components/Container'
import { iconForLink } from '@/components/SocialIcons'
import { TypewriterEffect } from '@/components/TypewriterEffect'
import {
  InformationCircleIcon,
  UserGroupIcon,
  MicrophoneIcon,
  CalendarDaysIcon,
  MapPinIcon,
  PlayCircleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { isSeekingSponsors } from '@/lib/conference/state'
import {
  resolveHomepageLifecycle,
  type HomepageLifecycle,
} from '@/lib/homepage/lifecycle'
import { PIRSCH_EVENTS } from '@/lib/analytics'
import { formatDatesSafe } from '@/lib/time'
import { PortableText } from '@portabletext/react'
import { toSafeRichTextHref } from '@/lib/portabletext/safeHref'
import { TypedObject } from 'sanity'

interface PortableTextChild {
  _type: string
  text?: string
}

interface PortableTextBlock extends TypedObject {
  _type: 'block'
  children?: PortableTextChild[]
}

function isPortableTextEmpty(content?: TypedObject[]): boolean {
  if (!content || !Array.isArray(content) || content.length === 0) {
    return true
  }

  return content.every((block) => {
    if (block._type === 'block') {
      const typedBlock = block as PortableTextBlock
      if (!typedBlock.children || !Array.isArray(typedBlock.children)) {
        return true
      }
      return typedBlock.children.every((child: PortableTextChild) => {
        return !child.text || child.text.trim() === ''
      })
    }
    return false
  })
}

/**
 * How a variant lays out the CTA row and the price caption beneath it.
 *
 * `center` is what `classic` has always done and is the DEFAULT, so its class
 * strings are byte-identical to the pre-variant literals. `minimal` sets its
 * whole column flush left; `emblem` centres the stacked mobile composition and
 * goes flush left once the mark moves beside the text at `lg`.
 */
type HeroAlign = 'center' | 'start' | 'center-until-lg'

const CTA_ROW_ALIGN: Record<HeroAlign, string> = {
  center: 'sm:justify-center',
  start: 'sm:justify-start',
  'center-until-lg': 'sm:justify-center lg:justify-start',
}

const CTA_CAPTION_ALIGN: Record<HeroAlign, string> = {
  center: 'text-center',
  start: 'text-left',
  'center-until-lg': 'text-center lg:text-left',
}

function ActionButtons({
  conference,
  lifecycle,
  ticketsFromPrice,
  ctaOverrides,
  align = 'center',
}: {
  conference: Conference
  lifecycle: HomepageLifecycle
  ticketsFromPrice?: string | null
  /**
   * F1 homepage-builder override. When non-empty, these buttons REPLACE the
   * phase-aware CTA row entirely; absent leaves the smart phase behaviour intact.
   */
  ctaOverrides?: HeroCtaOverride[]
  align?: HeroAlign
}) {
  if (ctaOverrides && ctaOverrides.length > 0) {
    return (
      <div
        className={clsx(
          'mt-6 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:flex-wrap',
          CTA_ROW_ALIGN[align],
          'lg:flex-nowrap',
        )}
      >
        {ctaOverrides.map((cta, idx) => (
          <Button
            key={cta._key ?? `${cta.href}-${idx}`}
            href={cta.href}
            variant={idx === 0 ? 'primary' : 'outline'}
            className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
          >
            <span>{cta.label}</span>
          </Button>
        ))}
      </div>
    )
  }

  const buttons: Array<{
    label: string
    href: string
    variant:
      'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'outline'
    icon: React.ComponentType<{ className?: string }>
    event: string
  }> = [
    {
      label: 'Practical Info',
      href: '/info',
      variant: 'outline',
      icon: InformationCircleIcon,
      event: PIRSCH_EVENTS.infoHero,
    },
  ]

  if (isSeekingSponsors(conference)) {
    buttons.push({
      label: 'Become a Sponsor',
      href: '/sponsor',
      variant: 'success',
      icon: UserGroupIcon,
      event: PIRSCH_EVENTS.sponsorHero,
    })
  }

  if (lifecycle.cfp === 'open') {
    buttons.push({
      label: 'Submit to Speak',
      href: '/cfp',
      variant: 'warning',
      icon: MicrophoneIcon,
      event: PIRSCH_EVENTS.cfpHero,
    })
  }

  // Gated on programme CONTENT, not on the publish date having passed: linking
  // "View Program" at an empty programme page is the same broken promise as the
  // zero-statistics band. After the event the label follows what is actually
  // there — "Watch the talks" only when a recording exists.
  if (lifecycle.content.hasProgramme) {
    buttons.push({
      label:
        lifecycle.stage === 'post-event' && lifecycle.content.hasRecordings
          ? 'Watch the talks'
          : 'View Program',
      href: '/program',
      variant: 'primary',
      icon:
        lifecycle.stage === 'post-event' && lifecycle.content.hasRecordings
          ? PlayCircleIcon
          : CalendarDaysIcon,
      event: PIRSCH_EVENTS.programHero,
    })
  }

  // A sold-out or not-yet-opened sale renders no ticket button at all — the
  // save-the-date roadmap and the sold-out notice carry that information
  // instead, rather than a button that leads to a dead end.
  if (lifecycle.tickets === 'on-sale') {
    buttons.push({
      // Checkin.no prices are excl. VAT — disclosed in the caption rendered
      // under the button row, consistent with the note on /tickets
      label: ticketsFromPrice
        ? `Get tickets — from ${ticketsFromPrice} kr`
        : 'Tickets',
      href: '/tickets',
      variant: 'primary',
      icon: TicketIcon,
      event: PIRSCH_EVENTS.ticketsHero,
    })
  }

  const reversedButtons = buttons.reverse()

  const hasTickets = reversedButtons.find((b) => b.href === '/tickets')
  const hasProgram = reversedButtons.find((b) => b.href === '/program')

  let displayButtons = reversedButtons
  if (hasTickets && hasProgram) {
    displayButtons = [
      hasTickets,
      hasProgram,
      ...reversedButtons.filter(
        (b) => b.href !== '/tickets' && b.href !== '/program',
      ),
    ].slice(0, 3)
  } else {
    displayButtons = reversedButtons.slice(0, 3)
  }

  // On a page with no CFP, no programme and no tickets — day one — the reversal
  // above leaves "Become a Sponsor" as the first and loudest thing a visitor
  // sees. Asking for money is the wrong opening move for an event nobody has
  // heard of yet, so the visitor-facing link leads and the sponsor pitch is
  // demoted to an outline button beside it.
  const hasVisitorCta = displayButtons.some(
    (b) => b.href !== '/sponsor' && b.href !== '/info',
  )
  if (!hasVisitorCta && displayButtons.some((b) => b.href === '/sponsor')) {
    displayButtons = [
      ...displayButtons
        .filter((b) => b.href === '/info')
        // Promoted, or the row would be two outline buttons with no lead.
        .map((b) => ({ ...b, variant: 'primary' as const })),
      ...displayButtons
        .filter((b) => b.href === '/sponsor')
        .map((b) => ({ ...b, variant: 'outline' as const })),
    ]
  }

  const showsPrice =
    ticketsFromPrice && displayButtons.some((b) => b.href === '/tickets')

  return (
    <>
      <div
        className={clsx(
          'mt-6 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:flex-wrap',
          CTA_ROW_ALIGN[align],
          'lg:flex-nowrap',
        )}
      >
        {displayButtons.map((button) => {
          const Icon = button.icon
          return (
            <Button
              key={button.label}
              href={button.href}
              variant={button.variant}
              className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
              data-pirsch-event={button.event}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{button.label}</span>
            </Button>
          )
        })}
      </div>
      {showsPrice && (
        <p
          className={clsx(
            'mt-2',
            CTA_CAPTION_ALIGN[align],
            'text-xs text-brand-slate-gray/70 dark:text-gray-400',
          )}
        >
          Ticket prices excl. VAT
        </p>
      )}
    </>
  )
}

/**
 * The organizer's announcement banner. Shared by every variant: it carries
 * time-critical information ("the venue has moved"), so no variant may drop it.
 *
 * Extracted verbatim from the pre-variant hero — same element tree, same
 * classes — so `classic` keeps rendering byte-identically.
 */
function HeroAnnouncement({ conference }: { conference: Conference }) {
  if (!conference.announcement || isPortableTextEmpty(conference.announcement))
    return null

  return (
    <div className="mb-8 rounded-lg border border-accent-yellow bg-brand-sunbeam-yellow/20 p-6 shadow-sm dark:border-brand-sunbeam-yellow dark:bg-brand-sunbeam-yellow/20 dark:shadow-md">
      <div className="flex items-center">
        <div className="font-space-grotesk text-brand-slate-gray dark:text-white">
          <PortableText
            value={conference.announcement}
            components={{
              block: {
                normal: ({ children }) => (
                  <p className="text-lg leading-relaxed font-medium text-brand-slate-gray dark:text-white">
                    {children}
                  </p>
                ),
                h1: ({ children }) => (
                  <h2 className="font-space-grotesk mb-2 text-xl font-bold text-brand-slate-gray dark:text-white">
                    {children}
                  </h2>
                ),
                h2: ({ children }) => (
                  <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                    {children}
                  </h3>
                ),
              },
              marks: {
                strong: ({ children }) => (
                  <strong className="font-bold text-brand-slate-gray dark:text-white">
                    {children}
                  </strong>
                ),
                link: ({ children, value }) => {
                  // Gated like every other link mark: the announcement is
                  // author-supplied, so a stored `javascript:`/`data:` href
                  // must degrade to an inert anchor rather than render live.
                  // Derive `target`/`rel` from the SAFE href, not the raw one,
                  // so a refused scheme cannot still open a new context.
                  const href = toSafeRichTextHref(
                    (value as { href?: string })?.href,
                  )
                  const external = href.startsWith('http')
                  return (
                    <a
                      href={href}
                      className="font-semibold text-brand-cloud-blue underline decoration-brand-cloud-blue/30 underline-offset-2 transition-colors hover:decoration-brand-cloud-blue"
                      target={external ? '_blank' : undefined}
                      rel={external ? 'noopener noreferrer' : undefined}
                    >
                      {children}
                    </a>
                  )
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * What the hero's `<h1>` says, and where it came from.
 *
 * `tagline` is OPTIONAL on a real conference document — `@/lib/onboarding/create.ts`
 * provisions a brand-new tenant without one — and the headline used to render
 * the tagline unconditionally. A fresh tenant therefore shipped an EMPTY `<h1>`
 * (a blank fixed-height block in `classic`) as the most prominent element on
 * its homepage, with the conference name reachable only by screen readers.
 * Falling back to the title means the page always names the event.
 *
 * `source` is what the variants key their surrounding chrome on: both the
 * `sr-only` prefix in `classic`/`minimal` and the eyebrow in `emblem` exist to
 * add the title BESIDE the tagline, so they must disappear when the title has
 * become the headline itself — otherwise the page says the name twice.
 */
type HeroHeadlineSource = 'override' | 'tagline' | 'title'

interface HeroHeadline {
  text: string
  source: HeroHeadlineSource
}

function resolveHeroHeadline(
  conference: Conference,
  headlineOverride?: string,
): HeroHeadline {
  // Trimmed only for the emptiness TEST — a stored "  " is as absent as an
  // unset field, but the value itself is rendered as the organizer wrote it.
  if (headlineOverride?.trim())
    return { text: headlineOverride, source: 'override' }
  if (conference.tagline?.trim())
    return { text: conference.tagline, source: 'tagline' }
  return { text: conference.title ?? '', source: 'title' }
}

/**
 * The headline TEXT only — the `<h1>` wrapper belongs to the variant, because
 * the type treatment is most of what makes the variants different. Precedence
 * (override → typewriter tagline → plain tagline → title) is shared.
 */
function HeroHeadlineText({ headline }: { headline: HeroHeadline }) {
  // The typewriter is a TAGLINE treatment: an override that happens to start
  // with "Real " stays plain text, as it always has.
  if (headline.source === 'tagline' && headline.text.startsWith('Real ')) {
    return (
      <TypewriterEffect
        prefix="Real "
        words={['Cases.', 'People.', 'Cloud Native.']}
        animation={true}
        typingSpeed={100}
        deletingSpeed={50}
        pauseDuration={2000}
      />
    )
  }
  return <>{headline.text}</>
}

/** The description column, with the same override precedence as the headline. */
function HeroDescription({
  conference,
  subheadlineOverride,
}: {
  conference: Conference
  subheadlineOverride?: string
}) {
  if (subheadlineOverride)
    return (
      <CollapsibleDescription paragraphs={subheadlineOverride.split('\n')} />
    )
  if (conference.description && typeof conference.description === 'string')
    return (
      <CollapsibleDescription paragraphs={conference.description.split('\n')} />
    )
  return null
}

/**
 * "27.–28. oktober 2026 · Bergen" — the one-line when/where that the two new
 * variants set typographically instead of giving the venue its own block.
 *
 * `place` deliberately stops at the CITY: the full venue name and street
 * address are the Venue section's job, and repeating them in a hero that exists
 * to be uncluttered is the duplication these variants are meant to remove.
 */
function heroMetaLine(conference: Conference): string[] {
  const dates =
    conference.startDate && conference.endDate
      ? formatDatesSafe(conference.startDate, conference.endDate)
      : null
  const place = conference.city?.trim() || conference.venueName?.trim() || null
  return [dates, place].filter((part): part is string => Boolean(part))
}

/** The mobile-only social row. Identical markup in every variant that keeps it. */
function HeroSocialLinks({ conference }: { conference: Conference }) {
  if (!conference.socialLinks || conference.socialLinks.length === 0)
    return null
  return (
    <div className="mt-10 flex justify-center space-x-4 sm:hidden">
      {conference.socialLinks.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-cloud-blue hover:text-brand-slate-gray"
        >
          {iconForLink(link, 'h-12 w-12')}
        </a>
      ))}
    </div>
  )
}

interface HeroVariantProps {
  conference: Conference
  lifecycle: HomepageLifecycle
  ticketsFromPrice?: string | null
  headlineOverride?: string
  subheadlineOverride?: string
  ctaOverrides?: HeroCtaOverride[]
}

/**
 * `classic` — the DEFAULT, and the pre-variant hero reproduced element for
 * element: patterned background wash, oversized JetBrains tagline, description,
 * phase-aware CTA row, venue line, vanity-metric row and the mobile social row.
 *
 * BACK-COMPAT: three live conference editions store no variant and therefore
 * render this. Its markup is pinned by snapshots in `Hero.test.tsx` that were
 * generated BEFORE the variant prop existed. Do not "tidy" anything here.
 */
function ClassicHero({
  conference,
  lifecycle,
  ticketsFromPrice,
  headlineOverride,
  subheadlineOverride,
  ctaOverrides,
}: HeroVariantProps) {
  const headline = resolveHeroHeadline(conference, headlineOverride)

  return (
    <div className="relative py-10 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <HeroAnnouncement conference={conference} />
          {/*
            The fixed height reserves room for the typewriter so the page does
            not jump as it types — a TAGLINE concern. A title headline is
            static, and a long conference name is exactly what the clamp would
            cut in half, so that path lets the heading size itself.
          */}
          <h1
            className={
              headline.source === 'title'
                ? 'font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl'
                : // Spelled out rather than composed: this exact string is what
                  // the back-compat snapshots pin for every existing edition.
                  'font-jetbrains h-[5.5rem] overflow-hidden text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:h-[8.5rem] sm:text-6xl lg:h-auto lg:overflow-visible'
            }
          >
            {headline.source !== 'title' && (
              <span className="sr-only">{conference.title} - </span>
            )}
            <HeroHeadlineText headline={headline} />
          </h1>
          <HeroDescription
            conference={conference}
            subheadlineOverride={subheadlineOverride}
          />

          <ActionButtons
            conference={conference}
            lifecycle={lifecycle}
            ticketsFromPrice={ticketsFromPrice}
            ctaOverrides={ctaOverrides}
          />

          {lifecycle.tickets === 'sold-out' && (
            <p className="font-jetbrains mt-4 text-center text-sm font-semibold tracking-wide text-brand-slate-gray/80 uppercase dark:text-gray-300">
              Tickets are sold out
            </p>
          )}

          {conference.venueName && (
            <p className="font-jetbrains mt-6 flex items-start justify-center gap-x-2 text-sm text-brand-cloud-blue sm:mt-8 dark:text-blue-400">
              <MapPinIcon
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                {conference.venueName}
                {conference.venueAddress
                  ? `, ${conference.venueAddress}`
                  : conference.city
                    ? `, ${conference.city}`
                    : ''}
              </span>
            </p>
          )}

          {conference.vanityMetrics && conference.vanityMetrics.length > 0 && (
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:mt-16 sm:grid-cols-3 lg:grid-cols-6 lg:justify-start lg:text-left">
              {conference.vanityMetrics.slice(0, 6).map((metric) => (
                <div
                  key={metric.label}
                  className="text-center sm:text-center lg:text-left"
                >
                  <dt className="font-jetbrains text-sm text-brand-cloud-blue">
                    {metric.label}
                  </dt>
                  <dd className="font-space-grotesk mt-0.5 text-2xl font-semibold tracking-tight text-brand-slate-gray sm:text-3xl dark:text-gray-200">
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <HeroSocialLinks conference={conference} />
        </div>
      </Container>
    </div>
  )
}

/**
 * `minimal` — the restrained, typographic hero.
 *
 * What it removes: the patterned `BackgroundImage` wash (no background
 * treatment at all — the page colour shows through), the venue line, the
 * vanity-metric row and the social row. Tenants who want those place the Venue
 * and Metrics SECTIONS lower down, which is exactly the duplication this
 * variant exists to end.
 *
 * What it adds: a mono, letterspaced eyebrow carrying dates · city — the whole
 * when/where in one restrained line — and a headline set in the house display
 * face in INK rather than oversized brand-coloured display type. The brand
 * shows in the eyebrow, the hairline rule and the primary button, so a themed
 * tenant is still unmistakably itself, quietly.
 *
 * Rhythm is tight (`py-14 sm:py-20` against classic's `sm:pt-36 sm:pb-24`) and
 * the whole column is flush left, so the section reads as a page opening rather
 * than a full-height splash. A hairline rule at the bottom is the only chrome —
 * without the background wash the hero needs SOMETHING to separate it from the
 * band below.
 */
function MinimalHero({
  conference,
  lifecycle,
  ticketsFromPrice,
  headlineOverride,
  subheadlineOverride,
  ctaOverrides,
}: HeroVariantProps) {
  const meta = heroMetaLine(conference)
  const headline = resolveHeroHeadline(conference, headlineOverride)

  return (
    <div className="relative border-b border-brand-slate-gray/10 py-14 sm:py-20 dark:border-white/10">
      <Container>
        <div className="max-w-3xl lg:max-w-4xl">
          <HeroAnnouncement conference={conference} />

          {meta.length > 0 && (
            <p className="font-jetbrains flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium tracking-[0.2em] text-brand-cloud-blue uppercase sm:text-sm">
              {meta.map((part, index) => (
                <span key={part} className="flex items-center gap-x-3">
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-brand-slate-gray/30 dark:text-white/30"
                    >
                      /
                    </span>
                  )}
                  {part}
                </span>
              ))}
            </p>
          )}

          <h1 className="font-space-grotesk mt-4 text-4xl font-bold tracking-tight text-balance text-brand-slate-gray sm:mt-6 sm:text-5xl lg:text-6xl dark:text-white">
            {headline.source !== 'title' && (
              <span className="sr-only">{conference.title} - </span>
            )}
            <HeroHeadlineText headline={headline} />
          </h1>

          <div className="max-w-2xl [&_p]:sm:text-xl">
            <HeroDescription
              conference={conference}
              subheadlineOverride={subheadlineOverride}
            />
          </div>

          <ActionButtons
            conference={conference}
            lifecycle={lifecycle}
            ticketsFromPrice={ticketsFromPrice}
            ctaOverrides={ctaOverrides}
            align="start"
          />

          {lifecycle.tickets === 'sold-out' && (
            <p className="font-jetbrains mt-4 text-sm font-semibold tracking-wide text-brand-slate-gray/80 uppercase dark:text-gray-300">
              Tickets are sold out
            </p>
          )}
        </div>
      </Container>
    </div>
  )
}

/**
 * `emblem` — the hero that leads with the conference MARK.
 *
 * On mobile the mark comes first, centred, sitting in a soft brand-tinted halo,
 * with the name, headline, when/where line, description and CTAs stacked
 * beneath it. From `lg` the composition splits: text flush left, the mark large
 * on the right, vertically centred against it.
 *
 * The mark is `ConferenceLogo variant="mark"`, so a tenant with an uploaded
 * logomark gets their own artwork (light/dark aware) and a tenant without one
 * gets the generated `BrandMonogram` — an initials badge painted from the
 * `--brand-*` custom properties, which is a genuinely usable focal element
 * rather than a placeholder.
 *
 * The venue line becomes the compact meta line beside the name, and the vanity
 * metrics move BELOW the composition as a ruled strip spanning the container —
 * the numbers are supporting evidence here, not the headline act.
 */
function EmblemHero({
  conference,
  lifecycle,
  ticketsFromPrice,
  headlineOverride,
  subheadlineOverride,
  ctaOverrides,
}: HeroVariantProps) {
  const meta = heroMetaLine(conference)
  const metrics = conference.vanityMetrics?.slice(0, 4) ?? []
  const headline = resolveHeroHeadline(conference, headlineOverride)

  return (
    <div className="relative py-12 sm:py-20 lg:py-28">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-3xl lg:max-w-none">
          <HeroAnnouncement conference={conference} />
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          {/* The mark leads on mobile and moves beside the text from `lg`. */}
          <div className="order-first flex justify-center lg:order-last">
            <div className="relative flex items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute size-44 rounded-full bg-brand-cloud-blue/20 blur-3xl sm:size-56 lg:size-72 dark:bg-brand-cloud-blue/30"
              />
              <ConferenceLogo
                conference={pickConferenceLogoProps(conference)}
                variant="mark"
                className="relative size-32 drop-shadow-lg sm:size-40 lg:size-56 xl:size-64"
              />
            </div>
          </div>

          <div className="text-center lg:text-left">
            {/*
              The eyebrow names the event ABOVE the tagline. When the tagline
              is missing the title has become the headline, so the eyebrow
              would just print the same words twice, stacked.
            */}
            {headline.source !== 'title' && (
              <p className="font-jetbrains text-xs font-semibold tracking-[0.25em] text-brand-cloud-blue uppercase sm:text-sm">
                {conference.title}
              </p>
            )}

            <h1 className="font-space-grotesk mt-3 text-3xl font-bold tracking-tight text-balance text-brand-slate-gray sm:text-5xl lg:text-6xl dark:text-white">
              <HeroHeadlineText headline={headline} />
            </h1>

            {meta.length > 0 && (
              <p className="font-jetbrains mt-4 flex flex-wrap items-center justify-center gap-x-2 text-sm text-brand-slate-gray/80 lg:justify-start dark:text-gray-300">
                <CalendarDaysIcon
                  className="h-4 w-4 shrink-0 text-brand-cloud-blue"
                  aria-hidden="true"
                />
                <span>{meta.join(' · ')}</span>
              </p>
            )}

            <div className="mx-auto max-w-2xl lg:mx-0">
              <HeroDescription
                conference={conference}
                subheadlineOverride={subheadlineOverride}
              />
            </div>

            <ActionButtons
              conference={conference}
              lifecycle={lifecycle}
              ticketsFromPrice={ticketsFromPrice}
              ctaOverrides={ctaOverrides}
              align="center-until-lg"
            />

            {lifecycle.tickets === 'sold-out' && (
              <p className="font-jetbrains mt-4 text-center text-sm font-semibold tracking-wide text-brand-slate-gray/80 uppercase lg:text-left dark:text-gray-300">
                Tickets are sold out
              </p>
            )}
          </div>
        </div>

        {metrics.length > 0 && (
          <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-brand-slate-gray/10 pt-8 sm:mt-16 sm:grid-cols-4 dark:border-white/10">
            {metrics.map((metric) => (
              <div key={metric.label} className="text-center sm:text-left">
                <dd className="font-space-grotesk text-2xl font-semibold tracking-tight text-brand-slate-gray sm:text-3xl dark:text-gray-200">
                  {metric.value}
                </dd>
                <dt className="font-jetbrains mt-0.5 text-xs tracking-wide text-brand-cloud-blue uppercase sm:text-sm">
                  {metric.label}
                </dt>
              </div>
            ))}
          </dl>
        )}

        <HeroSocialLinks conference={conference} />
      </Container>
    </div>
  )
}

export function Hero({
  conference,
  ticketsFromPrice,
  headlineOverride,
  subheadlineOverride,
  ctaOverrides,
  lifecycle,
  variant,
}: {
  conference: Conference
  /** Lowest ticket price formatted for display (e.g. "1 234"), excl. VAT */
  ticketsFromPrice?: string | null
  /**
   * F1 homepage-builder overrides. All optional; when ABSENT the Hero renders
   * exactly today's tagline/description/phase-aware CTAs (pixel-identical
   * default). `headlineOverride` replaces the tagline (plain text, no
   * typewriter); `subheadlineOverride` replaces the description; `ctaOverrides`
   * replaces the phase-aware CTA row.
   */
  headlineOverride?: string
  subheadlineOverride?: string
  ctaOverrides?: HeroCtaOverride[]
  /**
   * Resolved lifecycle state. The renderer resolves it once for the whole page
   * and passes it down; standalone use (stories) may omit it and the Hero
   * derives it from the conference itself.
   */
  lifecycle?: HomepageLifecycle
  /**
   * Presentation variant. ABSENT resolves to `classic`, which is today's hero
   * byte for byte; an UNRECOGNISED value also falls back to `classic` (with a
   * once-per-process warn) rather than rendering nothing, so a page saved by a
   * newer deploy still shows its hero on an older one.
   */
  variant?: SectionVariant<'homepageHero'>
}) {
  const resolved = lifecycle ?? resolveHomepageLifecycle(conference)
  const props: HeroVariantProps = {
    conference,
    lifecycle: resolved,
    ticketsFromPrice,
    headlineOverride,
    subheadlineOverride,
    ctaOverrides,
  }

  switch (resolveVariant('homepageHero', variant)) {
    case 'minimal':
      return <MinimalHero {...props} />
    case 'emblem':
      return <EmblemHero {...props} />
    default:
      return <ClassicHero {...props} />
  }
}
