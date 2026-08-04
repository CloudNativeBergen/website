import { Container } from '@/components/Container'
import type { Conference } from '@/lib/conference/types'
import type { MetricsSection } from '@/lib/homepage'
import { resolveVariant } from '@/lib/homepage/variants'

/**
 * Standalone vanity-metrics band (front-page builder F2). Content comes from the
 * existing `conference.vanityMetrics` source — the same numbers the Hero shows —
 * so a tenant can also surface them lower on the page. Renders nothing when there
 * are no metrics configured.
 *
 * VARIANTS. `row` (the default) is the plain `dl` on the page background —
 * unchanged, byte for byte. `band` puts the same numbers on a full-bleed tinted
 * strip: the "480 attendees · 32 sessions" colour block a conference site uses
 * to break the page between two content sections. Nothing but presentation
 * differs — same source, same six-metric cap, same empty-state.
 */
export function MetricsBlock({
  section,
  conference,
}: {
  section: MetricsSection
  conference: Conference
}) {
  const variant = resolveVariant('homepageMetrics', section.variant)
  const metrics = conference.vanityMetrics ?? []
  if (metrics.length === 0) return null

  const shown = metrics.slice(0, 6)

  if (variant === 'band') {
    return (
      /*
       * The tint is painted on the SECTION, not on a box inside the Container,
       * so it runs edge to edge on every viewport — that full-bleed break is
       * the entire difference from `row`. Both the surface and the hairline are
       * alpha shades of the tenant's `--brand-primary`, so a themed conference
       * gets its own band rather than the house blue.
       */
      <section className="border-y border-brand-cloud-blue/10 bg-brand-cloud-blue/5 py-14 sm:py-20 dark:border-blue-900/60 dark:bg-blue-950/40">
        <Container>
          {section.heading ? (
            <h2 className="font-space-grotesk mb-10 text-center text-3xl font-medium tracking-tighter text-brand-cloud-blue sm:text-4xl dark:text-blue-400">
              {section.heading}
            </h2>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
            {shown.map((metric) => (
              /*
               * `dt` stays FIRST in the DOM — a `dd` before its `dt` is invalid
               * inside a `dl`, and screen readers announce the pair in document
               * order. `flex-col-reverse` does the visual flip so the number
               * reads first, which is what makes this a statistics band rather
               * than a caption list.
               */
              <div
                key={metric.label}
                className="flex flex-col-reverse items-center text-center"
              >
                <dt className="font-jetbrains mt-2 text-xs tracking-wide text-brand-slate-gray/70 uppercase sm:text-sm dark:text-gray-400">
                  {metric.label}
                </dt>
                <dd className="font-space-grotesk text-4xl font-bold tracking-tight text-brand-cloud-blue tabular-nums sm:text-5xl dark:text-blue-400">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-20 sm:py-32">
      <Container>
        {section.heading ? (
          <h2 className="font-space-grotesk mb-10 text-center text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
            {section.heading}
          </h2>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {shown.map((metric) => (
            <div key={metric.label} className="text-center">
              <dt className="font-jetbrains text-sm text-brand-cloud-blue">
                {metric.label}
              </dt>
              <dd className="font-space-grotesk mt-0.5 text-2xl font-semibold tracking-tight text-brand-slate-gray sm:text-3xl dark:text-gray-200">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}
