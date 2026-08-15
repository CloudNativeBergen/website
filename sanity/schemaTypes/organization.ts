import { defineField, defineType, getPublishedId } from 'sanity'
import {
  SECRET_ENV_SLUG_MAX_LENGTH,
  secretEnvSlugProblem,
} from '../lib/secretEnvSlug'

/** Sentinel: a validation read that could not be performed. */
const ABSTAIN = Symbol('secret-env-slug-check-unavailable')

/**
 * The multi-tenant ORGANIZATION (CaaS tier 1, issue #613).
 *
 * An `organization` is the top-level tenant that OWNS a set of conference
 * editions and all the documents scoped to them. It is the anchor the
 * document-level security model (issue #614) and query scoping (issue #616)
 * build on: every tenant-scoped document carries a (possibly denormalized)
 * `organization` reference back to exactly one of these.
 *
 * SCOPE (T1-1): this document is intentionally LEAN — identity + branding +
 * contact, plus the entitlement pair below (`plan` + `featureOverrides`, the
 * feature-entitlements foundation). Billing mechanics (invoicing, payment
 * state) still arrive with the billing issue; do not add them here
 * speculatively.
 */
export default defineType({
  name: 'organization',
  title: 'Organization',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Display name of the organization (the tenant).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Stable URL-friendly identifier for the organization.',
      options: {
        source: 'name',
        maxLength: 96,
        // Same normalization as the 044 backfill migration's slugify — strip
        // punctuation and edge dashes, not just whitespace.
        slugify: (input) =>
          input
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
      description: 'Primary contact address for the organization.',
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: 'billingEmail',
      title: 'Billing Email',
      type: 'string',
      description:
        'Optional address for billing correspondence. Falls back to the contact email when unset.',
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: 'homepage',
      title: 'Homepage',
      type: 'url',
      description: 'Optional public homepage for the organization.',
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'inlineSvg',
      description:
        'Optional inline SVG logo for the organization (same mechanism as conference branding).',
    }),
    // Feature entitlements: the plan sets the baseline of GA features; the
    // overrides are explicit per-feature grants/denials that always win over
    // the plan. Resolution semantics live in `src/lib/features/registry.ts` +
    // `entitlements.ts`. ABSENT plan resolves to `community`, so legacy orgs
    // are unaffected without a migration.
    defineField({
      name: 'plan',
      title: 'Plan',
      type: 'string',
      description:
        'Commercial tier of this organization. Determines which generally-available features are enabled by default; leave unset to default to Community.',
      options: {
        list: [
          { title: 'Community', value: 'community' },
          { title: 'Pro', value: 'pro' },
          { title: 'Enterprise', value: 'enterprise' },
        ],
        layout: 'radio',
      },
      initialValue: 'community',
    }),
    defineField({
      name: 'featureOverrides',
      title: 'Feature Overrides',
      type: 'array',
      description:
        'Explicit per-feature grants or denials that take precedence over the plan (beta/internal opt-ins, pilot grants, temporary revocations). Feature ids must match the code registry in src/lib/features/registry.ts; overrides past their expiry are ignored.',
      of: [
        {
          type: 'object',
          name: 'featureOverride',
          title: 'Feature Override',
          fields: [
            defineField({
              name: 'feature',
              title: 'Feature',
              type: 'string',
              description:
                'Feature id from the code registry (e.g. "graphql-api").',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'enabled',
              title: 'Enabled',
              type: 'boolean',
              description:
                'On grants the feature regardless of plan; off revokes it regardless of plan.',
              initialValue: true,
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'note',
              title: 'Note',
              type: 'string',
              description:
                'Optional audit note — why this override exists (e.g. "beta cohort 2").',
            }),
            defineField({
              name: 'expiresAt',
              title: 'Expires At',
              type: 'datetime',
              description:
                'Optional expiry; after this instant the override is ignored entirely.',
            }),
          ],
          preview: {
            select: {
              title: 'feature',
              enabled: 'enabled',
              note: 'note',
            },
            prepare({ title, enabled, note }) {
              return {
                title: `${title ?? '(unset)'} — ${enabled ? 'enabled' : 'disabled'}`,
                subtitle: note,
              }
            },
          },
        },
      ],
    }),
    // Legal identity (go-live gate G2, #643): drives the tenant's /privacy and
    // /terms pages. These are edited by the customer in kontroll (my.konf.app,
    // Organization settings), not here — the Studio is not a customer surface.
    // NOTHING HERE IS GUESSED when it is absent: the pages say the field is
    // unresolved rather than asserting a country's law or naming a controller
    // that was never configured (see `src/lib/legal/config.ts`, #848).
    defineField({
      name: 'legalEntityName',
      title: 'Registered Legal Entity',
      type: 'string',
      description:
        'The registered entity that is the GDPR data controller, when it differs from the display name above — e.g. the company "Cloud Native Bergen" running the conference "Cloud Native Days Norway". This is the name printed on /privacy and /terms. Leave blank to use the organization name.',
    }),
    defineField({
      name: 'legalJurisdiction',
      title: 'Legal Jurisdiction (Country)',
      type: 'string',
      description:
        'Country whose law governs your Terms of Service and whose accounting/tax law is referenced on the Privacy page (e.g. "Norway", "Germany"). Leave blank to fall back to the conference country; with neither set, the pages state that the jurisdiction is not configured. When this is not Norway, the Privacy page renders neutral, non-Norway-specific legal prose.',
    }),
    defineField({
      name: 'supervisoryAuthority',
      title: 'Data Protection Supervisory Authority',
      type: 'object',
      description:
        'The data protection authority a complaint can be lodged with. The Authority Name is what switches this on: without it the URL and email are ignored entirely, and the pages fall back to the Norwegian Data Protection Authority (Datatilsynet) when the jurisdiction is Norway, or to a neutral "your national or EU/EEA data protection authority" pointer elsewhere.',
      fields: [
        defineField({
          name: 'name',
          title: 'Authority Name',
          type: 'string',
        }),
        defineField({
          name: 'url',
          title: 'Website',
          type: 'url',
        }),
        defineField({
          name: 'email',
          title: 'Contact Email',
          type: 'string',
          validation: (Rule) => Rule.email(),
        }),
      ],
    }),
    // ── OPERATOR-ONLY, EFFECTIVELY IMMUTABLE ────────────────────────────────
    //
    // Names this tenant's discrete credential environment variables
    // (`TENANT_<SLUG>_<FAMILY>_<FIELD>`). See `sanity/lib/secretEnvSlug.ts` for
    // the vocabulary and `docs/TENANT_SECRETS.md` for the runbook.
    //
    // WHY IT IS NOT SELF-SERVICE, AND WHY CHANGING IT IS REFUSED. The env vars
    // themselves live in Vercel and are set at DEPLOY time. Change this value
    // and the variables do not follow: `TENANT_<newslug>_EMAIL_API_KEY` simply
    // does not exist, so the tenant's own credentials stop resolving. That
    // failure is SILENT by nature — nothing throws, a lookup just finds
    // nothing. The organization `slug` above taught this lesson the expensive
    // way (RunKonf/platform#43: platform-operator standing was derived from it,
    // an org rename locked the platform out), and this field is the same shape
    // with a quieter blast radius, so it gets the same treatment:
    //
    //   1. kontroll (my.konf.app, the self-service control panel) cannot write
    //      it. Its ONE organization write is a three-key allowlist
    //      (`updateOrganization` in `src/lib/portal/sanity.ts`) and its Sanity
    //      partition grants `organization` nothing but `patch`. Verified
    //      against kontroll@dd20c17; re-verify before widening that allowlist.
    //   2. This repo never writes it either — `platform.updateEntitlements`
    //      sets `plan`/`featureOverrides` only, and the provisioning API
    //      accepts a fixed four-field organization body.
    //   3. The validation rule below refuses a CHANGE **or a CLEAR** of a
    //      non-empty PUBLISHED value, which blocks publishing the edit.
    //
    // ONE CONTROL, NOT TWO, AND WHY. An earlier draft of this field also carried
    // `readOnly: ({ value }) => value?.trim().length > 0`. That is wrong, and
    // wrong in a way that looks right: the conditional-property callback is
    // handed the LIVE document value, and a string input has no local buffer —
    // `PrimitiveField` writes each keystroke straight to the document. So typing
    // the first character of `CNDN` made the field non-empty, which made
    // `readOnly` true, which locked the input mid-word. The field could never be
    // filled in through the Studio at all, and a draft still carrying an old
    // value stayed locked even after a migration cleared the published one —
    // i.e. it broke the escape hatch it was supposed to be redundant with.
    // Caught in adversarial review, verified against the installed Studio
    // source. The validation rule is the control that actually keys on the
    // PUBLISHED value, so it is the one that survives.
    //
    // ESCAPE HATCH for a genuine correction (a typo caught before the env vars
    // are set, or a deliberate re-key): unset the field with a `migrations/`
    // migration, then set the new value. The rule keys on the PUBLISHED value
    // being non-empty, so once cleared the field is editable again — in the
    // Studio or by another migration. Do it in the same sitting as renaming the
    // Vercel variables; in between, the tenant resolves no credentials.
    //
    // NOTE — validation runs in the STUDIO ONLY. It is a review control, not a
    // security boundary: a holder of a Sanity write token can patch any field.
    // What actually keeps this field operator-only is (1) and (2) above, and
    // what makes a bypass VISIBLE at runtime is the orphaned-set complaint in
    // `src/lib/secrets/env-per-org.ts`.
    defineField({
      name: 'secretEnvSlug',
      title: 'Secret Env Var Slug (operator only)',
      type: 'string',
      description:
        'OPERATOR ONLY. Opaque uppercase label naming this tenant’s credential environment variables (TENANT_<SLUG>_EMAIL_API_KEY and friends). NOT the organization slug above, and not a customer-facing value. Set once, at provisioning time, together with the variables themselves — changing it orphans them and the tenant silently stops using its own credentials. Leave blank for every tenant that has no discrete credential variables.',
      validation: (Rule) =>
        Rule.max(SECRET_ENV_SLUG_MAX_LENGTH).custom(async (value, context) => {
          // `getPublishedId`, not a `drafts.` prefix strip: a document edited
          // inside a RELEASE carries `versions.<release>.<id>`, which a naive
          // strip leaves intact — the immutability read would then compare the
          // version document to itself (never firing) and the uniqueness query
          // would flag the org's own published document as a clash.
          const documentId = context.document?._id
            ? getPublishedId(context.document._id)
            : ''
          const isEmpty = value === undefined || value === null || value === ''

          // A shape problem is decided without a read.
          if (!isEmpty) {
            const problem = secretEnvSlugProblem(value)
            if (problem) return `Secret env var slug ${problem}.`
          }

          // No document id yet (a brand-new, never-saved draft): nothing can be
          // "changed", and the uniqueness check has no id to exclude itself by.
          // An empty value at that point is simply the normal absent state.
          if (!documentId) return true

          const client = context.getClient({ apiVersion: '2024-08-01' })

          // A FAILED READ MUST NOT MARK THE DOCUMENT INVALID. Sanity turns a
          // thrown custom rule into an error marker, so a network blip would
          // render every organization — almost all of which leave this field
          // empty — un-publishable for an unrelated reason. This rule is a
          // review control, not the guard; the runtime resolver is what refuses
          // credentials, and it fails loud on its own. So an unreadable check
          // abstains. (Caught in adversarial review.)
          const fetchOrAbstain = async <T>(
            query: string,
            params: Record<string, unknown>,
          ): Promise<T | typeof ABSTAIN> => {
            try {
              return await client.fetch<T>(query, params)
            } catch {
              return ABSTAIN
            }
          }

          // IMMUTABILITY is decided against the PUBLISHED document, not the
          // draft: the draft already carries whatever was just typed, so
          // comparing against it would always agree with itself.
          //
          // THIS READ HAPPENS EVEN WHEN THE NEW VALUE IS EMPTY, deliberately.
          // Returning `true` early for an empty value would refuse A→B while
          // permitting A→∅, and ∅ is not a harmless state: the resolver reads it
          // as "this tenant has no discrete variables" and hands back the
          // PLATFORM account — silently, which is the exact regression this
          // field is designed against. Clearing is a change like any other, and
          // its escape hatch is the same migration. (Caught in review.)
          const published = await fetchOrAbstain<string | null>(
            `*[_id == $id][0].secretEnvSlug`,
            { id: documentId },
          )
          if (published === ABSTAIN) return true

          if (published && published !== value) {
            const verb = isEmpty ? 'cleared' : 'changed'
            return `Secret env var slug is set once and cannot be ${verb} here (currently "${published}"). The TENANT_${published}_* environment variables are named after it and would be orphaned — the tenant would silently fall back to the platform account. To re-key or release this tenant, unset the field with a migration — see docs/TENANT_SECRETS.md.`
          }

          // Nothing further to check for an absent value on a document that
          // never had one.
          if (isEmpty) return true

          // UNIQUENESS. Two organizations sharing a slug would read the SAME
          // variables — a cross-tenant credential leak by typo. This is the
          // editor-facing half; the resolver enforces it again at read time
          // (and refuses BOTH orgs), because a Studio rule cannot see a
          // document written by anything other than the Studio.
          const clash = await fetchOrAbstain<string | null>(
            `*[_type == "organization" && secretEnvSlug == $value && !(_id in [$id, $draftId])][0]._id`,
            { value, id: documentId, draftId: `drafts.${documentId}` },
          )
          if (clash === ABSTAIN) return true
          if (clash) {
            return `Secret env var slug "${value}" is already used by ${clash}. Two organizations sharing one slug would read the same credentials.`
          }
          return true
        }),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'slug.current',
    },
  },
})
