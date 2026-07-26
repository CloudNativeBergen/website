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
    ],
  },
)
