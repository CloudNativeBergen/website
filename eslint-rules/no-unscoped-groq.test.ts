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

      // ---------------------------------------------------------------------
      // `groq-global-scoped:` — the query IS tenant-scoped, invisibly so.
      // ---------------------------------------------------------------------
      {
        filename: 'src/lib/workshop/sanity.ts',
        code: [
          '// groq-global-scoped: point read by server-derived id; conference checked by the caller',
          'const q = `*[_type == "workshop" && _id == $id][0]`',
        ].join('\n'),
      },
      // …on the query's own line.
      {
        filename: 'src/lib/workshop/sanity.ts',
        code: 'const q = `*[_type == "workshop" && _id == $id][0]` // groq-global-scoped: id from the session',
      },
      // PLACEMENT: marker on the FIRST line of a multi-line `//` block. This is
      // the ergonomics trap — the old rule only looked at the LAST comment line,
      // so an annotation written this way silently did nothing.
      {
        filename: 'src/lib/proposal/data/sanity.ts',
        code: [
          '// groq-global-scoped: the composed filter always leads with',
          '// `conference._ref == $conferenceId`; the organizer branch fails',
          '// closed (`&& false`) when the org cannot be resolved.',
          'const q = `*[_type == "talk" && _id == $id][0]`',
        ].join('\n'),
      },
      // Same trap for the pre-existing `groq-global:` marker.
      {
        filename: 'src/lib/conference/sanity.ts',
        code: [
          '// groq-global: host → conference routing resolves the tenant itself,',
          '// so it cannot be tenant-scoped.',
          'const q = `*[_type == "conference" && $domain in domains][0]`',
        ].join('\n'),
      },
      // A JSDoc-style block comment carries the marker anywhere inside it.
      {
        filename: 'src/lib/travel-support/sanity.ts',
        code: [
          '/**',
          ' * Reads one expense by id.',
          ' * groq-global-scoped: ownership enforced by verifyTravelSupportOwnership.',
          ' */',
          'const q = `*[_type == "travelExpense" && _id == $id][0]`',
        ].join('\n'),
      },
      // Blank lines between the annotation and the query are skipped.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// groq-global-scoped: scope applied by the caller',
          '',
          'const q = `*[_type == "talk"]`',
        ].join('\n'),
      },
      // A multi-line template: `*[_type ==` is two lines BELOW the annotation,
      // which sits above the opening backtick where an author would write it.
      {
        filename: 'src/lib/messaging/sanity.ts',
        code: [
          '// groq-global-scoped: correlated sub-query — bounded by the parent ^._id',
          'const q = `',
          '  *[_type == "message" && conversation._ref == ^._id]',
          '`',
        ].join('\n'),
      },
      // The interpolated-filter shape can be annotated as scoped too.
      {
        filename: 'src/lib/sponsor-crm/sanity.ts',
        code: [
          '// groq-global-scoped: filterQuery always leads with `conference._ref == $conferenceId`',
          'const q = `*[${filterQuery}]`',
        ].join('\n'),
      },

      // ---------------------------------------------------------------------
      // `references($conferenceId)` with a BOUND tenant parameter is a tenant
      // predicate — the read cannot cross tenants (#744).
      // ---------------------------------------------------------------------
      {
        filename: 'src/lib/badge/issuance.ts',
        code: 'const q = `*[_type == "badgeIssuance" && references($speakerId) && references($conferenceId)][0]`',
      },
      {
        filename: 'src/lib/badge/sanity.ts',
        code: 'const q = `*[_type == "badge" && references( $orgId )]`',
      },
      {
        filename: 'src/lib/badge/sanity.ts',
        code: 'const q = `*[_type == "badge" && references($organizationId)] | order(_createdAt desc)`',
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

      // ---------------------------------------------------------------------
      // Both markers REQUIRE a reason — a bare marker suppresses nothing.
      // ---------------------------------------------------------------------
      {
        filename: 'src/lib/x/sanity.ts',
        code: ['// groq-global-scoped:', 'const q = `*[_type == "talk"]`'].join(
          '\n',
        ),
        errors: [{ messageId: 'unscoped' }],
      },
      {
        filename: 'src/lib/x/sanity.ts',
        code: ['// groq-global:', 'const q = `*[_type == "talk"]`'].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      // A bare marker at the END of a block does not borrow the earlier prose
      // as its reason.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// Reads the talk list.',
          '// groq-global-scoped:',
          'const q = `*[_type == "talk"]`',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },

      // ---------------------------------------------------------------------
      // PLACEMENT negatives: an annotation must GOVERN the query.
      // ---------------------------------------------------------------------
      // Separated from the query by a statement.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// groq-global-scoped: scoped by the caller',
          'const unrelated = 1',
          'const q = `*[_type == "talk"]`',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// groq-global: platform aggregate',
          'const unrelated = 1',
          'const q = `*[_type == "talk"]`',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      // BELOW the query — never suppresses.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          'const q = `*[_type == "talk"]`',
          '// groq-global-scoped: scoped by the caller',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },

      // ---------------------------------------------------------------------
      // `groq-global-scoped:` clears only the "cannot see the scope" shapes.
      // ---------------------------------------------------------------------
      // A CONDITIONAL tenant predicate is visibly fail-open, so claiming "it is
      // scoped" is a false claim: `unscoped` clears, `optionalTenantFilter` stays.
      {
        filename: 'src/lib/gallery/sanity.ts',
        code: [
          '// groq-global-scoped: composed by galleryScopeClause',
          'const q = `*[_type == "imageGallery" && (!defined($conferenceId) || conference._ref == $conferenceId)]`',
        ].join('\n'),
        errors: [{ messageId: 'optionalTenantFilter' }],
      },
      // …and an explicit reviewed-global annotation still silences it.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          '// groq-global-scoped: resolved upstream',
          'const r = await scopedFetch(client, { orgId: null }, `*[_type == "talk"]`)',
        ].join('\n'),
        errors: [{ messageId: 'nullScope' }],
      },

      // ---------------------------------------------------------------------
      // `references()` counts only for a BOUND TENANT parameter.
      // ---------------------------------------------------------------------
      {
        filename: 'src/lib/badge/issuance.ts',
        code: 'const q = `*[_type == "badgeIssuance" && references($speakerId)][0]`',
        errors: [{ messageId: 'unscoped' }],
      },
      {
        filename: 'src/lib/badge/issuance.ts',
        code: 'const q = `*[_type == "badgeIssuance" && references(someConferenceRef)][0]`',
        errors: [{ messageId: 'unscoped' }],
      },
      // A tenant `references()` belonging to a NESTED sub-query does not scope
      // the root filter wrapped around it.
      {
        filename: 'src/lib/badge/sanity.ts',
        code: 'const q = `*[_type == "speaker"]{ "badges": *[_type == "badge" && references($conferenceId)] }`',
        errors: [{ messageId: 'unscoped' }],
      },
      // An interpolated filter is NOT rescued by a visible tenant `references()`:
      // the injected text can escape the bracket, so the literal proves nothing
      // about the query that actually runs.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `*[${filter} && references($conferenceId)]`',
        errors: [{ messageId: 'interpolatedFilter' }],
      },

      // ---------------------------------------------------------------------
      // BLIND SPOT 1 (#676): WHITESPACE BETWEEN `*` AND `[`.
      //
      // PERMANENT REGRESSION COVER. `* [_type == "staff"]` is valid GROQ and one
      // keystroke from the normal form; it is how the #675 cross-tenant staff
      // leak was actually written, and every pattern in this rule used to be
      // anchored on the literal two characters `*[`, so the rule reported it
      // clean. These cases must never be deleted: the repo had ZERO spaced root
      // filters when the hole was closed, so nothing else would notice a
      // regression until the next leak shipped.
      // ---------------------------------------------------------------------
      {
        filename: 'src/lib/staff/sanity.ts',
        code: 'const q = `* [_type == "staff"]`',
        errors: [{ messageId: 'unscoped' }],
      },
      // Whitespace on BOTH sides of the bracket, and more than one space.
      {
        filename: 'src/lib/staff/sanity.ts',
        code: 'const q = `*  [ _type == "staff" ]`',
        errors: [{ messageId: 'unscoped' }],
      },
      // The interpolated shape has the same hole.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `* [${filter}]`',
        errors: [{ messageId: 'interpolatedFilter' }],
      },
      // …and so does the loose opener that gates the fail-open check.
      {
        filename: 'src/lib/gallery/sanity.ts',
        code: 'const q = `* [_type == "imageGallery" && (!defined($conferenceId) || conference._ref == $conferenceId)]`',
        errors: [
          { messageId: 'unscoped' },
          { messageId: 'optionalTenantFilter' },
        ],
      },
      // ---------------------------------------------------------------------
      // BLIND SPOT 2 (#676): `_id ==` ROOT FILTERS.
      //
      // A document id is a DATASET-WIDE key, so a by-id read is not
      // self-scoping: a client-supplied id resolves documents in any tenant.
      // The rule used to require `_type ==` and never examined this class at
      // all — 11 live sites, including the tenant guard itself.
      // ---------------------------------------------------------------------
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `*[_id == $id][0]{ title }`',
        errors: [{ messageId: 'unscoped' }],
      },
      // Spaced AND by id — both holes in one query.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const q = `* [ _id == $id ][0]`',
        errors: [{ messageId: 'unscoped' }],
      },
      // A by-id read inside a `patch({ query })` conditional write.
      {
        filename: 'src/lib/sponsor-crm/activity.ts',
        code: "const p = client.patch({ query: '*[_id == $id && status in $stages]' })",
        errors: [{ messageId: 'unscoped' }],
      },
      // A by-id root filter nested in a projection is a root filter too: it
      // reads the whole dataset, not the enclosing document.
      {
        filename: 'src/lib/messaging/sanity.ts',
        code: 'const q = `*[_type == "conversation"]{ "pref": *[_id == ^._id + $suffix] }`',
        errors: [{ messageId: 'unscoped' }],
      },
    ],
  },
)

// The counterparts: the newly-visible shapes, correctly suppressed. Kept in a
// second run so the shapes closed by #676 read as one block.
ruleTester.run(
  'no-unscoped-groq (#676: shapes the rule could not previously see)',
  rule as unknown as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      // A spaced form is still suppressible the normal way — the fix widened
      // what the rule SEES, it did not change what an annotation clears.
      {
        filename: 'src/lib/staff/sanity.ts',
        code: 'const q = `* [_type == "staff"]` // groq-global: platform staff roster',
      },
      // The ownership-check shape: reads the tenant OF an id in order to refuse
      // it (src/server/tenancy.ts, src/lib/schedule/sanity.ts).
      {
        filename: 'src/server/tenancy.ts',
        code: [
          '// groq-global: resolves the tenant OF a client-supplied id so the',
          '// caller can refuse it — scoping would defeat the guard.',
          'const q = `*[_id == $id][0]{ _type, "orgId": organization._ref }`',
        ].join('\n'),
      },
      // The server-minted-id shape.
      {
        filename: 'src/lib/schedule/sanity.ts',
        code: 'const q = `*[_id == $id][0]{ _rev }` // groq-global-scoped: id is a randomUUID minted here',
      },
      // A by-id read routed through the builder needs no annotation at all.
      {
        filename: 'src/lib/x/sanity.ts',
        code: 'const r = await scopedFetch(client, { conferenceId }, `*[_id == $id][0]`, { id })',
      },
      // A by-id read with a bound tenant `references()` is a tenant predicate.
      {
        filename: 'src/lib/badge/issuance.ts',
        code: 'const q = `*[_id == $id && references($conferenceId)][0]`',
      },
    ],
    invalid: [
      // A bare marker with no reason suppresses nothing — unchanged by #676,
      // pinned here because the new shapes go through the same gate.
      {
        filename: 'src/lib/x/sanity.ts',
        code: ['// groq-global:', 'const q = `*[_id == $id][0]`'].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
      // An annotation BELOW the query never reaches it.
      {
        filename: 'src/lib/x/sanity.ts',
        code: [
          'const q = `* [_id == $id][0]`',
          '// groq-global-scoped: too late',
        ].join('\n'),
        errors: [{ messageId: 'unscoped' }],
      },
    ],
  },
)
