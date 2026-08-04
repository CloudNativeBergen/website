import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import type { CtaBannerSection } from '@/lib/homepage'
import { resolveVariant } from '@/lib/homepage/variants'

/**
 * Generic call-to-action banner block (front-page builder F2). A closed-registry
 * primitive: heading + optional body + exactly ONE house {@link Button}. No raw
 * HTML — the copy and destination are the only tenant-controlled inputs.
 *
 * VARIANTS. `plain` (the default) is the centred heading/body/button sitting
 * directly on the page background, unchanged. `panel` boxes exactly the same
 * three elements in the rounded gradient card the sponsor pitch already uses
 * (Sponsors.tsx) — a louder call-out for a page whose neighbouring bands are
 * also plain, where the default banner is easy to scroll past. ONE button in
 * both: the variant changes the frame, never the primitive.
 */
export function CtaBanner({ section }: { section: CtaBannerSection }) {
  const variant = resolveVariant('homepageCtaBanner', section.variant)
  const { heading, body, buttonLabel, buttonHref } = section

  const content = (
    <>
      <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
        {heading}
      </h2>
      {body ? (
        <p className="font-inter mt-4 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
          {body}
        </p>
      ) : null}
      {buttonLabel && buttonHref ? (
        <div className="mt-10 flex justify-center">
          <Button
            href={buttonHref}
            variant="primary"
            className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
          >
            <span>{buttonLabel}</span>
          </Button>
        </div>
      ) : null}
    </>
  )

  if (variant === 'panel') {
    return (
      <section className="py-20 sm:py-32">
        <Container>
          {/* CONTAINED, deliberately: the panel stops at the reading width so it
              reads as a call-out on the page rather than a second hero. The
              gradient is alpha shades of the tenant's brand and accent hues, so
              a themed conference gets its own panel; the dark pair keeps the
              same two hues at a surface weight that text still sits on. */}
          <div className="mx-auto max-w-4xl rounded-2xl bg-linear-to-r from-brand-cloud-blue/10 to-brand-fresh-green/10 p-8 text-center ring-1 ring-brand-cloud-blue/10 sm:p-12 dark:from-blue-950/70 dark:to-emerald-950/60 dark:ring-blue-900/60">
            {content}
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-20 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">{content}</div>
      </Container>
    </section>
  )
}
