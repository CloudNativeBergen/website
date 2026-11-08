/**
 * ESLint rule: no-sanity-d1-conference-fields.
 *
 * Conference metadata fields (title, tagline, city, country, venueName,
 * venueAddress, startDate, endDate, visibility, backgroundPattern, theme,
 * registrationLink, socialLinks, and the settings phase 1, 2 and 3 fields) are owned
 * by D1/Cloudflare and should not
 * be read from Sanity conference documents. Instead, they should be read
 * from D1 via merge.ts or konf-api.ts.
 *
 * ---------------------------------------------------------------------------
 * HEURISTIC DESIGN AND SCOPE
 * ---------------------------------------------------------------------------
 *
 * This is a lightweight, text-based lint rule (no groq-js AST dependency).
 *
 * Several D1-owned field names — especially `title` and `startDate` — are common
 * property names across other document types in Sanity (proposals, talks,
 * schedules, speakerBadges, sponsors). A naive search for these field names
 * across all GROQ queries would produce catastrophic false positive rates.
 *
 * Therefore, this rule flags ONLY conference-shaped reads:
 *
 *  (a) A direct dereference: `conference->title` (field directly following `conference->`).
 *  (b) A conference dereference projection: `conference->{ ... }`.
 *  (c) A projection `{...}` immediately following (optionally after a `[0]`
 *      or `[...]` slice) a filter containing `_type == "conference"` or
 *      `_type=="conference"` (single or double quotes).
 *
 * For projections ((b) and (c)):
 *  - Extract balanced braces.
 *  - Remove string literals ("..." and '...').
 *  - Keep only depth-0 text (stripping nested {...}, [...], (...) so nested
 *    subqueries like `talks: *[_type == "talk"]{ title, startDate }` or function
 *    calls inside a conference projection are not misattributed to conference).
 *  - Match bare identifiers against the D1-owned fields set. An identifier after
 *    `.`, `->` or `$` is another document's field or a parameter, so it is skipped
 *    (`organization->title` is not a conference read).
 *
 * Known holes (false negatives, by design of a text heuristic): fields read
 * inside a function call (`coalesce(title, ...)`), `...` spreads, `_type in
 * ["conference"]` filters, and queries assembled from several strings.
 *
 * Each field is reported at most once per query string node.
 *
 * ---------------------------------------------------------------------------
 * OPT-IN: IMPORT THE MERGE LAYER
 * ---------------------------------------------------------------------------
 *
 * The correct #1997 pattern still READS these fields from Sanity, then passes
 * the row through `mergeConference` / `mergeConferences` / `purgeEndDate`
 * (src/lib/conference/merge.ts) or `mergeKonfApiConference` (konf-api.ts),
 * which overlay D1. A file that imports from `@/lib/conference/merge`, or
 * imports `mergeKonfApiConference`, is therefore not reported at all. This is
 * deliberately FILE-LEVEL: it does not prove each query's row reaches the
 * merge, so a file that merges one read and leaks another passes.
 *
 * ---------------------------------------------------------------------------
 * SELF-EXEMPT FILES
 * ---------------------------------------------------------------------------
 *
 * The following files/directories are exempt from this rule:
 *  - src/lib/conference/merge.ts (merges Sanity conference documents with D1 data)
 *  - src/lib/conference/konf-api.ts (D1 conference API consumer)
 *  - *.test.* (test files)
 *  - *.stories.* (Storybook stories)
 *  - scripts/ (offline scripts and tooling)
 *  - migrations/ (dataset migrations)
 */

'use strict'

const path = require('node:path')

/** Repo root, so allowlist segments are matched from the ROOT of the path. */
const REPO_ROOT = `${path.resolve(__dirname, '..').replace(/\\/g, '/')}/`

/**
 * D1-owned conference fields that should not be read from Sanity conference
 * documents.
 */
const D1_FIELDS = new Set([
  'title',
  'tagline',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'visibility',
  'backgroundPattern',
  'theme',
  'registrationLink',
  'socialLinks',
  // Settings phase 1 (#2019). ticketCustomization.showVanityMetrics is not
  // listed: only its parent is a bare identifier here, and the parent holds
  // Sanity-owned fields too.
  'cfpStartDate',
  'cfpEndDate',
  'cfpNotifyDate',
  'programDate',
  'travelSupportPaymentDate',
  'earlyBirdEndDate',
  'registrationCloseDate',
  'speakersAnnouncedDate',
  'sponsorDeadlineDate',
  'recordingsLiveDate',
  'travelSupportBudget',
  'registrationEnabled',
  'organizer',
  'organizerAddress',
  'organizerOrgNumber',
  'socialHashtag',
  'analyticsPirschCode',
  // Settings phase 3 (#2080), ticket setup.
  'ticketingProvider',
  'checkinCustomerId',
  'checkinEventId',
  'titoAccountSlug',
  'titoEventSlug',
  'ticketCapacity',
  'ticketTargets',
  'ticketTypeRoles',
  'publicFreeTicketIds',
  'workshopRegistrationSponsorStart',
  'workshopRegistrationStart',
  'workshopRegistrationEnd',
  'workshopEarlyAccessTicketTypes',
  'workshopReminderLastSentAt',
  'workshopReminderLastSentCount',
  'workshopReminderReservedAt',
  // Settings phase 2 (#2038): contact emails, registration links, Slack.
  'contactEmail',
  'cfpEmail',
  'sponsorEmail',
  'volunteerRegistrationLink',
  'sponsorRegistrationLink',
  'speakerRegistrationLink',
  'salesNotificationChannel',
  'cfpNotificationChannel',
  'speakerSlackChannel',
  'speakerSlackInviteUrl',
  'volunteerSlackInviteUrl',
])

const CONFERENCE_FILTER_RE = /_type\s*==\s*["']conference["']/

function isAllowlisted(filename) {
  if (!filename) return false
  const abs = filename.replace(/\\/g, '/')
  const f = abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length) : abs
  return (
    /^(migrations|scripts)\//.test(f) ||
    /\.test\./.test(f) ||
    /\.stories\./.test(f) ||
    /(^|\/)src\/lib\/conference\/(merge|konf-api)\.ts$/.test(f)
  )
}

/**
 * Extract balanced opening and closing delimiters (e.g. '{' ... '}' or '[' ... ']'),
 * properly respecting string literals so delimiters inside quotes do not affect depth.
 */
function extractBalanced(text, startIndex, openChar, closeChar) {
  if (text[startIndex] !== openChar) return null
  let depth = 0
  let inString = null
  let escape = false
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      continue
    }
    if (ch === openChar) {
      depth++
    } else if (ch === closeChar) {
      depth--
      if (depth === 0) {
        return {
          start: startIndex,
          end: i,
          content: text.slice(startIndex + 1, i),
        }
      }
    }
  }
  return null
}

/**
 * Strip string literals ("..." and '...') from text, replacing them with whitespace
 * to preserve token boundaries.
 */
function removeStringLiterals(text) {
  let result = ''
  let inString = null
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === inString) {
        inString = null
        result += ' '
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      continue
    }
    result += ch
  }
  return result
}

/**
 * Keep only depth-0 text by removing nested {...}, [...], and (...) blocks.
 */
function getDepth0Text(text) {
  let result = ''
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
    } else if (ch === '}' || ch === ']' || ch === ')') {
      if (depth > 0) depth--
    } else if (depth === 0) {
      result += ch
    }
  }
  return result
}

/**
 * Remove nested brackets [...] from filter text, keeping strings intact.
 * Used so subqueries inside filters (e.g. `*[_type == "talk" && conf in *[_type == "conference"][]._id]`)
 * do not falsely cause the outer filter to appear as a conference filter.
 */
function removeNestedBrackets(text) {
  let result = ''
  let depth = 0
  let inString = null
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === inString) {
        inString = null
      }
      if (depth === 0) result += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      if (depth === 0) result += ch
      continue
    }
    if (ch === '[') {
      depth++
    } else if (ch === ']') {
      if (depth > 0) depth--
    } else if (depth === 0) {
      result += ch
    }
  }
  return result
}

/**
 * Extract D1-owned fields present at depth-0 in a projection body.
 */
function findD1FieldsInProjection(projectionContent) {
  const stripped = removeStringLiterals(projectionContent)
  const depth0 = getDepth0Text(stripped)
  const found = []
  const matches = depth0.matchAll(/(?<![\w$.>])[a-zA-Z_][a-zA-Z0-9_]*\b/g)
  for (const m of matches) {
    const word = m[0]
    if (D1_FIELDS.has(word) && !found.includes(word)) {
      found.push(word)
    }
  }
  return found
}

/**
 * `import ... from '@/lib/conference/merge'` (or a relative `./merge`), or
 * `import { mergeKonfApiConference } from '.../konf-api'`.
 */
function isMergeImport(node) {
  if (node.type !== 'ImportDeclaration') return false
  const src = String(node.source.value)
  if (/(^|\/)lib\/conference\/merge$|^\.\/merge$/.test(src)) return true
  return (
    /(^|\/)konf-api$/.test(src) &&
    node.specifiers.some(
      (sp) =>
        sp.type === 'ImportSpecifier' &&
        sp.imported.name === 'mergeKonfApiConference',
    )
  )
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reading D1-owned conference fields from Sanity conference documents.',
      recommended: false,
    },
    schema: [],
    messages: {
      d1Field:
        "Field '{{field}}' is owned by D1/Cloudflare and should not be read from Sanity conference documents. Read it from D1 via merge.ts or konf-api.ts instead.",
    },
  },

  create(context) {
    const filename =
      (context.filename || (context.getFilename && context.getFilename())) ?? ''
    if (isAllowlisted(filename)) return {}
    // Opt-in: a file that imports the merge layer is assumed to pass its Sanity
    // rows through it (the #1997 pattern), so its reads are not reported.
    const ast = (context.sourceCode ?? context.getSourceCode()).ast
    if (ast.body.some(isMergeImport)) return {}

    function checkQueryString(node, text) {
      if (!text || typeof text !== 'string') return
      if (!text.includes('conference')) return

      const flaggedFields = new Set()

      // (a) deref `conference->title` (field directly after `conference->`)
      // (b) `conference->{ ... }` projection
      const derefRegex = /\bconference\s*->/g
      let match
      while ((match = derefRegex.exec(text)) !== null) {
        let ptr = match.index + match[0].length
        while (ptr < text.length && /\s/.test(text[ptr])) {
          ptr++
        }
        if (ptr >= text.length) continue

        if (text[ptr] === '{') {
          // Shape (b): conference->{ ... } projection
          const projection = extractBalanced(text, ptr, '{', '}')
          if (projection) {
            const fields = findD1FieldsInProjection(projection.content)
            for (const f of fields) {
              flaggedFields.add(f)
            }
          }
        } else if (/[a-zA-Z_$]/.test(text[ptr])) {
          // Shape (a): field directly after conference->
          const idMatch = text.slice(ptr).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/)
          if (idMatch) {
            const field = idMatch[0]
            if (D1_FIELDS.has(field)) {
              flaggedFields.add(field)
            }
          }
        }
      }

      // (c) a projection `{...}` immediately following (optionally after a `[0]` or `[...]` slice)
      // a filter containing `_type == "conference"` or `_type=="conference"` (single or double quotes).
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '[') {
          const filter = extractBalanced(text, i, '[', ']')
          if (!filter) continue

          const filterTopLevel = removeNestedBrackets(filter.content)
          if (CONFERENCE_FILTER_RE.test(filterTopLevel)) {
            let ptr = filter.end + 1
            while (ptr < text.length && /\s/.test(text[ptr])) {
              ptr++
            }

            // Optional slice: [0] or [...]
            if (ptr < text.length && text[ptr] === '[') {
              const slice = extractBalanced(text, ptr, '[', ']')
              if (slice) {
                ptr = slice.end + 1
                while (ptr < text.length && /\s/.test(text[ptr])) {
                  ptr++
                }
              }
            }

            // Projection: {...}
            if (ptr < text.length && text[ptr] === '{') {
              const projection = extractBalanced(text, ptr, '{', '}')
              if (projection) {
                const fields = findD1FieldsInProjection(projection.content)
                for (const f of fields) {
                  flaggedFields.add(f)
                }
              }
            }
          }
        }
      }

      for (const field of flaggedFields) {
        context.report({
          node,
          messageId: 'd1Field',
          data: { field },
        })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkQueryString(node, node.value)
        }
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((q) => q.value.raw).join('$x')
        checkQueryString(node, text)
      },
    }
  },
}
