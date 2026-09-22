/**
 * THE PAGE PICKER (spec §3.4): the site paths a publishing Task's tagged link
 * may point at — our own pages, a page for the Task's subject, or a custom
 * path on our own domain. Pure; the router derives the link from the pick.
 */

export interface PagePickerOption {
  key: string
  label: string
  /** A site path starting with `/`. */
  path: string
}

export interface TaskSubjectRef {
  type: 'speaker' | 'sponsor' | 'talk'
  name: string
  slug: string | null
}

export const OWN_PAGES: readonly PagePickerOption[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'tickets', label: 'Tickets', path: '/tickets' },
  { key: 'cfp', label: 'Call for papers', path: '/cfp' },
  { key: 'program', label: 'Programme', path: '/program' },
  { key: 'speakers', label: 'Speakers', path: '/speaker' },
  { key: 'sponsors', label: 'Sponsors', path: '/sponsor' },
  { key: 'info', label: 'Practical information', path: '/info' },
]

/** The subject's own page, when the site has one. */
function subjectOption(subject: TaskSubjectRef): PagePickerOption | null {
  switch (subject.type) {
    case 'speaker':
      return subject.slug
        ? {
            key: 'subject',
            label: `Speaker: ${subject.name}`,
            path: `/speaker/${subject.slug}`,
          }
        : null
    // No per-talk page exists; the programme is where a talk is read.
    case 'talk':
      return {
        key: 'subject',
        label: `Talk: ${subject.name}`,
        path: '/program',
      }
    case 'sponsor':
      return {
        key: 'subject',
        label: `Sponsor: ${subject.name}`,
        path: '/sponsor',
      }
  }
}

export function pagePickerOptions(
  subject: TaskSubjectRef | null,
): PagePickerOption[] {
  const own = [...OWN_PAGES]
  const extra = subject ? subjectOption(subject) : null
  return extra ? [...own, extra] : own
}

export const SITE_PATH_MAX_LENGTH = 500

/**
 * Why a string is not a site path on our own domain, or null when it is.
 * The same rule the Zod schema applies; `taggedUrl` re-checks the origin
 * after URL resolution as the last line.
 */
export function sitePathIssue(path: string): string | null {
  if (path.length === 0) return 'Pick a page or enter a path.'
  if (path.length > SITE_PATH_MAX_LENGTH) {
    return `The path is limited to ${SITE_PATH_MAX_LENGTH} characters.`
  }
  if (!path.startsWith('/')) return 'The path must start with "/".'
  if (/^\/[/\\]/.test(path)) return 'The path must stay on this site.'
  if (/\s/.test(path)) return 'The path must not contain whitespace.'
  // §2.3: "a link never points at a link". `/go/<code>` is itself a redirect,
  // so a destination under it makes the route resolve to another short link —
  // and a Task pointing at its OWN code, or two Tasks pointing at each
  // other's, is a redirect loop the visitor's browser has to break.
  if (/^\/go(\/|$)/i.test(path)) {
    return 'The path must not be a short link (/go/…).'
  }
  return null
}
