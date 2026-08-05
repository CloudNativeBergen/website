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

const asRule = rule as unknown as Parameters<typeof ruleTester.run>[1]

ruleTester.run('no-unscoped-groq', asRule, {
  valid: [
    // Scoped through the builder — no bare `*[_type ==` literal.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = scopedQuery({ conferenceId }, someBody)',
    },
    // A predicate-constant fragment has no root filter at all.
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

    // -----------------------------------------------------------------------
    // ACCEPTANCE CRITERION 1 — a correctly scoped HAND-WRITTEN query reports
    // clean. This is the headline of the rewrite: before it, these four were
    // indistinguishable, and three of them were false positives. The genuinely
    // unscoped fourth row lives in the `invalid` block below.
    // -----------------------------------------------------------------------
    {
      filename: 'src/lib/probe/sanity.ts',
      code: 'const q = `*[_type == "x" && conference._ref == $conferenceId]`',
    },
    {
      filename: 'src/lib/probe/sanity.ts',
      code: 'const q = `*[_type == "x" && organization._ref == $orgId]`',
    },
    {
      filename: 'src/lib/probe/sanity.ts',
      code: 'const q = `*[conference._ref == $conferenceId && _type == "x"]`',
    },

    // -----------------------------------------------------------------------
    // The rest of the §4 vocabulary, exercised through the RULE (the engine has
    // its own unit tests; these pin that the rule wires the vocabulary up).
    // -----------------------------------------------------------------------
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && conference._ref in $conferenceIds]`',
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && conference->organization._ref == $orgId]`',
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "speaker" && $orgRef in organizations[]._ref]`',
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "x" && (conference._ref == $conferenceId || organization._ref == $orgId)]`',
    },
    // A nested root correlated to a SCOPED parent is scoped (T6).
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "a" && conference._ref == $conferenceId]{ "x": *[_type == "b" && conference._ref == ^.conference._ref] }`',
    },
    // A tenant predicate in a chained filter counts.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk"][conference._ref == $conferenceId]`',
    },

    // -----------------------------------------------------------------------
    // `groq-global-scoped:` — the query IS tenant-scoped, invisibly so.
    // -----------------------------------------------------------------------
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
    // the ergonomics trap — a rule that only looks at the LAST comment line
    // silently ignores an annotation written this way.
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
    // A multi-line template: the root filter is two lines BELOW the annotation,
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

    // -----------------------------------------------------------------------
    // `references($conferenceId)` with a BOUND tenant parameter is a tenant
    // predicate — the read cannot cross tenants (#744).
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // …and an interpolation OUTSIDE the root filter — in the ordering or the
    // projection — does not taint it. The span plumbing lives in this file, so
    // the case belongs here rather than in the engine's unit tests.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && conference._ref == $conferenceId] | order(${sortField} asc){ ${FIELDS} }`',
    },

    // An ordinary optional filter beside an unconditional tenant predicate is
    // clean: `!defined($featured)` is not a tenant key, so it does not fail open.
    {
      filename: 'src/lib/gallery/sanity.ts',
      code: 'const q = `*[_type == "imageGallery" && conference._ref == $conferenceId && (!defined($featured) || featured == $featured)]`',
    },

    // Not every string is a query. A literal with no `*` read is not examined,
    // and must not be reported `unparseable` for failing to be GROQ.
    // -----------------------------------------------------------------------
    {
      filename: 'src/lib/x/copy.ts',
      code: 'const msg = "Reviewers rated 4 * 5 stars, see [details]"',
    },
    {
      filename: 'src/lib/x/copy.ts',
      code: 'const t = `Hello ${name}, welcome to the conference`',
    },
  ],
  invalid: [
    // ACCEPTANCE CRITERION 1, fourth row: the genuinely unscoped one, still
    // flagged. Exactly one diagnostic across the four probes.
    {
      filename: 'src/lib/probe/sanity.ts',
      code: 'const q = `*[_type == "x"]`',
      errors: [{ messageId: 'unscoped' }],
    },
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
    // A tenant predicate BESIDE an interpolation does not rescue the root: the
    // injected text can escape the bracket, so what is visible is not what runs.
    // §4 lists this among the deliberate non-recognitions.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && conference._ref == $conferenceId && ${extra}]`',
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
    // `!defined($featured)` is an ordinary optional FILTER, not a tenant one, so
    // the fail-open check must not fire — and the tenant predicate beside it now
    // makes the query CLEAN apart from that. Reported once, and only because the
    // second root has no predicate of its own.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "imageGallery" && conference._ref == $conferenceId && (!defined($featured) || featured == $featured)]{ "n": count(*[_type == "photo"]) }`',
      errors: [{ messageId: 'unscoped' }],
    },
    // Multi-line template: the query opener is several lines below the backtick;
    // a `groq-global` string INSIDE the template is not a real code comment and
    // must not suppress.
    {
      filename: 'src/lib/x/sanity.ts',
      code: [
        'const q = `',
        '  // groq-global: this is inside the string, not a suppression',
        '  *[_type == "talk"]',
        '`',
      ].join('\n'),
      errors: [{ messageId: 'unscoped' }],
    },

    // -----------------------------------------------------------------------
    // Both markers REQUIRE a reason — a bare marker suppresses nothing.
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // PLACEMENT negatives: an annotation must GOVERN the query.
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // `groq-global-scoped:` clears only the "cannot see the scope" shapes.
    // -----------------------------------------------------------------------
    // ACCEPTANCE CRITERION 5. A CONDITIONAL tenant predicate is visibly
    // fail-open, so claiming "it is scoped" is a false claim: `unscoped` clears,
    // `optionalTenantFilter` stays.
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

    // -----------------------------------------------------------------------
    // `references()` counts only for a BOUND TENANT parameter.
    // -----------------------------------------------------------------------
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
    // A tenant `references()` belonging to a NESTED sub-query does not scope the
    // root filter wrapped around it — and now the nested root is judged on its
    // own merits too, so only the outer one is reported.
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

    // -----------------------------------------------------------------------
    // WHITESPACE BETWEEN `*` AND `[` (#676).
    //
    // PERMANENT REGRESSION COVER. `* [_type == "staff"]` is valid GROQ and one
    // keystroke from the normal form; it is how the #675 cross-tenant staff leak
    // was actually written, and every pattern in the predecessor rule was once
    // anchored on the literal two characters `*[`. A parser cannot regress this
    // the way a regex could — which is exactly why the cases stay: they now pin
    // that the PARSER-based rule inherits the property for free.
    // -----------------------------------------------------------------------
    {
      filename: 'src/lib/staff/sanity.ts',
      code: 'const q = `* [_type == "staff"]`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/staff/sanity.ts',
      code: 'const q = `*  [ _type == "staff" ]`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `* [${filter}]`',
      errors: [{ messageId: 'interpolatedFilter' }],
    },
    {
      filename: 'src/lib/gallery/sanity.ts',
      code: 'const q = `* [_type == "imageGallery" && (!defined($conferenceId) || conference._ref == $conferenceId)]`',
      errors: [
        { messageId: 'unscoped' },
        { messageId: 'optionalTenantFilter' },
      ],
    },

    // -----------------------------------------------------------------------
    // `_id ==` ROOT FILTERS (#676, D3).
    //
    // A document id is a DATASET-WIDE key, so a by-id read is not self-scoping:
    // a client-supplied id resolves documents in any tenant. Recognising a
    // caller-side guard by name would be provenance theater, so these keep
    // flagging; the ones that are genuinely safe carry an annotation naming the
    // mechanism.
    // -----------------------------------------------------------------------
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_id == $id][0]{ title }`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `* [ _id == $id ][0]`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/sponsor-crm/activity.ts',
      code: "const p = client.patch({ query: '*[_id == $id && status in $stages]' })",
      errors: [{ messageId: 'unscoped' }],
    },
  ],
})

// ---------------------------------------------------------------------------
// THE SHAPES THE PREDECESSOR COULD NOT SEE (website#792).
//
// Each of these was reported CLEAN by the regex rule — the token it anchored on
// was absent, reordered, or belonged to a root filter the single `exec()` never
// reached. They are the acceptance criterion 2 set, written unscoped so a
// diagnostic is the correct answer for every one.
// ---------------------------------------------------------------------------
ruleTester.run('no-unscoped-groq (#792: previously invisible shapes)', asRule, {
  valid: [],
  invalid: [
    // `_type` is not the first token.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[defined(foo) && _type == "talk"]`',
      errors: [{ messageId: 'unscoped' }],
    },
    // REVERSED comparison.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*["talk" == _type]`',
      errors: [{ messageId: 'unscoped' }],
    },
    // Operators other than `==`.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type match "talk*"]`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type in ["talk", "workshop"]]`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_id in $ids]`',
      errors: [{ messageId: 'unscoped' }],
    },
    // A root filter opening on another field.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[references($speakerId)]`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[slug.current == $slug]`',
      errors: [{ messageId: 'unscoped' }],
    },
    // A BARE `*` reads every tenant by construction (D4) — invisible to every
    // pattern the predecessor had, since none of them can match "no filter".
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `count(*)`',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*{ _id, _type }`',
      errors: [{ messageId: 'unscoped' }],
    },
    // NESTED roots. The predecessor's `exec()` stopped at the outermost `*[`, so
    // everything below was unexamined. Both are reported now, each at its own
    // position.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "a"]{ "x": *[_type == "b"] }`',
      errors: [{ messageId: 'unscoped' }, { messageId: 'unscoped' }],
    },
    // Sibling nested roots: three roots, three diagnostics.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "a"]{ "x": *[_type == "b"], "y": *[_type == "c"] }`',
      errors: [
        { messageId: 'unscoped' },
        { messageId: 'unscoped' },
        { messageId: 'unscoped' },
      ],
    },
    // A nested root inside a `count()` in a projection.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "a" && conference._ref == $conferenceId]{ "n": count(*[_type == "b"]) }`',
      errors: [{ messageId: 'unscoped' }],
    },
  ],
})

// ---------------------------------------------------------------------------
// PER-ROOT REPORTING AND SUPPRESSION (acceptance criteria 3 and 4).
//
// The predecessor made "inside scopedFetch" and "is annotated" decisions ONCE
// per literal, so `scopedFetch` — which splices its predicate into the first
// `*[` only — silently covered nested roots it never scoped, and an outer
// `groq-global-scoped:` vouched for roots nobody had reviewed. Both used to be
// pinned here as characterization tests of a KNOWN GAP; they are now pinned as
// the behaviour.
// ---------------------------------------------------------------------------
ruleTester.run('no-unscoped-groq (per-root reporting)', asRule, {
  valid: [
    // AC 4, first half: inside a non-null scopedFetch the FIRST root needs no
    // predicate of its own — the builder prepends one — and a nested root that
    // carries its own tenant predicate is clean as well.
    {
      filename: 'src/lib/messaging/sanity.ts',
      code: 'const r = await scopedFetch(client, { conferenceId }, `*[_type == "conversation"]{ "m": *[_type == "message" && conference._ref == $conferenceId] }`)',
    },
  ],
  invalid: [
    // AC 3: one scoped root and one unscoped root ⇒ exactly ONE diagnostic, on
    // the unscoped root's own line.
    {
      filename: 'src/lib/x/sanity.ts',
      code: [
        'const q = `',
        '  *[_type == "a" && conference._ref == $conferenceId]{',
        '    "x": *[_type == "b"]',
        '  }',
        '`',
      ].join('\n'),
      errors: [{ messageId: 'unscoped', line: 3 }],
    },
    // AC 3, second half: an OUTER annotation does not reach a nested root. The
    // annotation clears the first root; the nested one is still reported.
    {
      filename: 'src/lib/x/sanity.ts',
      code: [
        '// groq-global-scoped: outer filter is composed by the caller',
        'const q = `',
        '  *[_type == "a"]{',
        '    "x": *[_type == "b"]',
        '  }',
        '`',
      ].join('\n'),
      errors: [{ messageId: 'unscoped', line: 4 }],
    },
    // …and a reviewed-global annotation does not reach it either.
    {
      filename: 'src/lib/x/sanity.ts',
      code: [
        '// groq-global: platform-wide roster',
        'const q = `',
        '  *[_type == "a"]{',
        '    "x": *[_type == "b"]',
        '  }',
        '`',
      ].join('\n'),
      errors: [{ messageId: 'unscoped', line: 4 }],
    },
    // AC 4, second half: `scopedQuery` splices its predicate into the FIRST `*[`
    // only, so the nested root runs unscoped at runtime — and is now reported.
    // This case used to assert SILENCE, as a characterization test of the gap.
    {
      filename: 'src/lib/messaging/sanity.ts',
      code: 'const r = await scopedFetch(client, { conferenceId }, `*[_type == "conversation"]{ "pref": *[_id == ^._id + $suffix] }`)',
      errors: [{ messageId: 'unscoped' }],
    },
    // The outer filter is a shape the predecessor could not match, so its single
    // report came from the NESTED by-id filter. Now both are examined and both
    // are reported.
    {
      filename: 'src/lib/messaging/sanity.ts',
      code: 'const q = `*[slug.current == $slug]{ "pref": *[_id == ^._id + $suffix] }`',
      errors: [{ messageId: 'unscoped' }, { messageId: 'unscoped' }],
    },
  ],
})

// ---------------------------------------------------------------------------
// THE `*` A SUBSTITUTION SWALLOWS.
//
// `${prefix}*[_type == "talk"]` substitutes to `$__groqInterp0*[…]`, which is
// valid GROQ — a parameter MULTIPLIED by an array literal. No `Everything` node
// exists, so there is no root to judge; the star scanner independently agrees,
// the counts match, and the location mapping verifies. Every part of the machine
// agrees, wrongly, and the query reads every tenant at runtime.
//
// This is the ONE shape where a parser can be quieter than the regex it
// replaced: `/\*\s*\[\s*_(type|id)\s*==/` did not care what preceded the `*`.
// Zero occurrences in `src/` today; a lint rule exists for the code not yet
// written. These cases must never be deleted.
// ---------------------------------------------------------------------------
ruleTester.run('no-unscoped-groq (a star hidden by an interpolation)', asRule, {
  valid: [
    // Still annotatable, like every other "the rule cannot see it" shape.
    {
      filename: 'src/lib/x/sanity.ts',
      code: [
        '// groq-global: the prefix is a reviewed cross-tenant selector',
        'const q = `${prefix}*[_type == "talk"]`',
      ].join('\n'),
    },
    // An interpolation NOT followed by a `*` is untouched by the guard.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && conference._ref == $conferenceId]{ ${FIELDS} }`',
    },
  ],
  invalid: [
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `${prefix}*[_type == "talk"]`',
      errors: [{ messageId: 'interpolatedFilter' }],
    },
    // Whitespace between does not rescue it — nor does a newline.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `${prefix}  *[_type == "talk"]`',
      errors: [{ messageId: 'interpolatedFilter' }],
    },
    {
      filename: 'src/lib/x/sanity.ts',
      code: ['const q = `${prefix}', '  *[_type == "talk"]`'].join('\n'),
      errors: [{ messageId: 'interpolatedFilter', line: 2 }],
    },
    // Reported for the placeholder that actually precedes the `*`, not the first.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `${a}${b}*[_type == "talk"]`',
      errors: [{ messageId: 'interpolatedFilter' }],
    },
    // Inside `scopedFetch` too: `scopedQuery` splices at the first `*[` of the
    // ASSEMBLED string, and the prefix is exactly the text neither it nor this
    // rule can read — so the builder cannot vouch for it. The nested root is
    // judged on its own as always.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const r = await scopedFetch(client, { orgId }, `${prefix}*[_type == "talk"]{ "x": *[_type == "b"] }`)',
      errors: [{ messageId: 'interpolatedFilter' }, { messageId: 'unscoped' }],
    },
  ],
})

// ---------------------------------------------------------------------------
// FAILING CLOSED (acceptance criterion 6).
//
// A literal that looks like a query but does not parse — even after the
// substitution ladder and the fragment wrappers — cannot have its roots
// enumerated. Reporting it is the only honest answer; the alternative is a
// silent clean verdict on text nobody has read.
// ---------------------------------------------------------------------------
ruleTester.run('no-unscoped-groq (unparseable)', asRule, {
  valid: [
    // A fragment that IS parseable once wrapped is analysed, not reported: this
    // one carries its own tenant predicate.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const f = `&& conference._ref in *[_type == "conference" && organization._ref == $orgId]._id`',
    },
    // An annotation clears an unparseable literal, as it does the other
    // "the rule cannot see it" shapes.
    {
      filename: 'src/lib/x/sanity.ts',
      code: [
        '// groq-global: assembled by hand and reviewed',
        'const q = `*[_type == "talk" && ` + tail',
      ].join('\n'),
    },
  ],
  invalid: [
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && ` + tail',
      errors: [{ messageId: 'unparseable' }],
    },
    // A root whose POSITION cannot be verified is still judged, and reported at
    // the literal rather than at a guessed line.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk"] | order(title)[defined(x)]`',
      errors: [{ messageId: 'unscoped', line: 1, column: 11 }],
    },
    // Fails closed even when a tenant predicate is visible in the broken text.
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "talk" && conference._ref == $conferenceId ` + tail',
      errors: [{ messageId: 'unparseable' }],
    },
  ],
})

// ---------------------------------------------------------------------------
// PORTABILITY (§6). The vocabulary is rule OPTIONS so `RunKonf/kontroll` can
// configure the same engine for its own contract: no builder, no ambient
// tenant, `_id == $orgId` counts, identity on `redeemedBy == $userKey`.
// ---------------------------------------------------------------------------
const kontrollOptions = [
  {
    tenantFields: ['organization'],
    tenantParams: ['orgId', 'organizationId'],
    tenantParamsPlural: ['orgIds'],
    idEqualsCounts: true,
    identityFields: ['redeemedBy'],
    identityParams: ['userKey'],
  },
]

ruleTester.run("no-unscoped-groq (kontroll's vocabulary)", asRule, {
  valid: [
    {
      filename: 'src/lib/x/sanity.ts',
      options: kontrollOptions,
      code: 'const q = `*[_type == "organization" && _id == $orgId][0]`',
    },
    {
      filename: 'src/lib/x/sanity.ts',
      options: kontrollOptions,
      code: 'const q = `*[_type == "invite" && redeemedBy == $userKey]`',
    },
  ],
  invalid: [
    // The same `_id ==` read is NOT scoped under this repo's contract (D3).
    {
      filename: 'src/lib/x/sanity.ts',
      code: 'const q = `*[_type == "organization" && _id == $orgId][0]`',
      errors: [{ messageId: 'unscoped' }],
    },
    // …and kontroll's contract does not recognise this repo's conference axis.
    {
      filename: 'src/lib/x/sanity.ts',
      options: kontrollOptions,
      code: 'const q = `*[_type == "talk" && conference._ref == $conferenceId]`',
      errors: [{ messageId: 'unscoped' }],
    },
  ],
})
