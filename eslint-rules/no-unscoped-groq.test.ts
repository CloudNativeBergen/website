import { RuleTester } from 'eslint'
// The rule is a CommonJS module (loaded by eslint.config.js via require); import
// it through esModuleInterop for the test.
import rule from './no-unscoped-groq'

// RuleTester drives ESLint's own engine over fixture snippets. With Vitest
// globals enabled it binds to the global describe/it, so this runs as a normal
// test. `filename` is set per-case because the rule allowlists paths (builder
// module, tests, scripts, migrations); most fixtures use a `src/**` filename so
// the rule is active.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

ruleTester.run(
  'no-unscoped-groq',
  rule as unknown as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      // Scoped through the builder — no bare `*[_type ==` literal.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = scopedQuery({ conferenceId }, someBody)',
      },
      // A predicate-constant query has no `*[_type ==` literal either.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const base = `_type == "conversation" && ${CONFERENCE_FILTER}`',
      },
      // A `*[_type ==` body passed directly to scopedFetch is scoped at runtime.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await scopedFetch(client, { conferenceId }, `*[_type == "notification" && recipient._ref == $id]`, { id })',
      },
      // Recognized through a member call too (e.g. re-exported builder).
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await api.scopedFetch(client, { orgId }, `*[_type == "talk"]._id`)',
      },
      // Reviewed-global: suppressed by the convention comment above the query.
      {
        filename: 'src/lib/speaker/sanity.ts',
        code: [
          '// groq-global: cross-tenant identity join',
          'const q = `*[_type == "speaker" && $id in providers][0]`',
        ].join('\n'),
      },
      // Reviewed-global: suppression on the SAME line.
      {
        filename: 'src/lib/speaker/sanity.ts',
        code: 'const q = `*[_type == "speaker"]` // groq-global: organizer count',
      },
      // REGRESSION (#731): a MULTI-LINE rationale is N separate comment nodes, so
      // the annotation on its first line is ≥2 lines above the query. Suppression
      // used to accept only `matchLine` and `matchLine - 1`, which silently
      // un-suppressed 7 of the repo's annotated sites.
      {
        filename: 'src/lib/speaker/sanity.ts',
        code: [
          '// groq-global: cross-tenant identity join — a returning global person',
          '// must be found by provider id before we know which tenant they are',
          '// about to sign in to.',
          'const q = `*[_type == "speaker" && $id in providers][0]`',
        ].join('\n'),
      },
      // REGRESSION (#731): the `groq-global-scoped:` variant does not contain the
      // substring `groq-global:` and was never recognized at all.
      {
        filename: 'src/server/tenancy.ts',
        code: [
          '// groq-global-scoped: the tenant predicate IS `organization._ref == $orgId`.',
          'const q = `*[_type == "topic" && organization._ref == $orgId]`',
        ].join('\n'),
      },
      {
        filename: 'src/server/tenancy.ts',
        code: [
          '// groq-global-scoped: multi-line rationale, scoped variant, both fixes',
          '// exercised at once.',
          'const q = `*[_type == "topic" && organization._ref == $orgId]`',
        ].join('\n'),
      },
      // Allowlisted paths are never flagged.
      {
        filename: 'src/lib/sanity/scoped.ts',
        code: 'const idx = body.indexOf(`*[_type == "x"]`)',
      },
      {
        filename: 'migrations/044-backfill/index.ts',
        code: 'const q = `*[_type == "conference"]`',
      },
      {
        filename: 'scripts/report-duplicate-speakers.ts',
        code: 'const q = `*[_type == "speaker"]`',
      },
      {
        filename: 'src/lib/x/sanity.test.ts',
        code: 'const q = `*[_type == "speaker"]`',
      },
      // An interpolated root filter routed through the builder is fine.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await scopedFetch(client, { orgId }, `*[${filter}]`)',
      },
      // An interpolated root filter can be annotated like any other global read.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// groq-global: aggregate across tenants for the platform console',
          'const q = `*[${filter}]`',
        ].join('\n'),
      },
      // A non-null scope argument keeps scopedFetch bodies exempt.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await scopedFetch(client, { orgId: resolved }, `*[_type == "talk"]`)',
      },
    ],
    invalid: [
      // A bare unscoped template-literal query in app source.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `*[_type == "notification" && recipient._ref == $id]`',
        errors: [{ messageId: 'unscoped' }],
      },
      // Plain string literal (not a template) is flagged too.
      {
        filename: 'src/server/routers/x.ts',
        code: 'const q = "*[_type == \\"talk\\"]._id"',
        errors: [{ messageId: 'unscoped' }],
      },
      // An unrelated comment does not suppress.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// just a normal comment',
          'const q = `*[_type == "speaker"]`',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      // INTERPOLATED root filter — the predicate is invisible to review (#616).
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `*[${filter}] | order(date asc)`',
        errors: [{ messageId: 'interpolatedFilter' }],
      },
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `*[ ${predicate} && _id == $id][0]`',
        errors: [{ messageId: 'interpolatedFilter' }],
      },
      // CONDITIONAL tenant predicate: no id ⇒ every tenant (the gallery leak).
      {
        filename: 'src/lib/gallery/sanity.ts',
        code: 'const q = `*[_type == "imageGallery" && (!defined($conferenceId) || conference._ref == $conferenceId)]`',
        errors: [
          { messageId: 'unscoped' },
          { messageId: 'optionalTenantFilter' },
        ],
      },
      // Documents with NO tenant ref must not be handed to every tenant.
      {
        filename: 'src/lib/gallery/sanity.ts',
        code: 'const q = `*[_type == "imageGallery" && (conference._ref == $conferenceId || !defined(conference))]`',
        errors: [
          { messageId: 'unscoped' },
          { messageId: 'optionalTenantFilter' },
        ],
      },
      // …reported even inside scopedFetch, whose prefix cannot undo a fail-open
      // predicate inside the body.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await scopedFetch(client, { orgId }, `*[_type == "imageGallery" && (!defined($orgId) || organization._ref == $orgId)]`)',
        errors: [{ messageId: 'optionalTenantFilter' }],
      },
      // A scoped-looking call with a NULL tenant key reads globally at runtime.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await scopedFetch(client, { orgId: null }, `*[_type == "talk"]`)',
        errors: [
          // The call itself is flagged…
          { messageId: 'nullScope' },
          // …and the body is no longer treated as scoped.
          { messageId: 'unscoped' },
        ],
      },
      // `!defined($featured)` is an ordinary optional FILTER, not a tenant one:
      // the query is still reported as `unscoped` (no builder, no annotation),
      // but exactly once — the optional-tenant check must NOT fire on it.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `*[_type == "imageGallery" && conference._ref == $conferenceId && (!defined($featured) || featured == $featured)]`',
        errors: [{ messageId: 'unscoped' }],
      },
      // Multi-line template: the query opener is several lines below the backtick;
      // a `groq-global` string INSIDE the template is not a real code comment and
      // must not suppress.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          'const q = `',
          '  groq-global: this is inside the string, not a suppression',
          '  *[_type == "talk"]',
          '`',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      // The comment block must be CONTIGUOUS with the query: an annotation
      // separated from it by a line of code annotates something else, and
      // widening suppression must not swallow the next query down the file.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// groq-global: this rationale belongs to the query below it',
          'const scoped = await scopedFetch(client, { orgId }, `*[_type == "talk"]`)',
          'const q = `*[_type == "speaker"]`',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      // An annotation BELOW the query does not suppress it.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          'const q = `*[_type == "speaker"]`',
          '// groq-global: too late — this is under the query, not above it',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
    ],
  },
)
