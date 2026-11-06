import { RuleTester } from 'eslint'
import rule from './no-sanity-d1-conference-fields'

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

const asRule = rule as unknown as Parameters<typeof ruleTester.run>[1]
const SRC = 'src/lib/conference/query.ts'

ruleTester.run('no-sanity-d1-conference-fields', asRule, {
  valid: [
    // Non-conference queries: proposals/talks reading title and startDate must NOT be flagged
    {
      filename: SRC,
      code: 'const q = `*[_type == "talk"]{title, startDate}`',
    },
    {
      filename: SRC,
      code: 'const q = `*[_type == "proposal"]{title, description}`',
    },
    {
      filename: SRC,
      code: 'const q = `*[_type == "sponsor"]{title, tier}`',
    },
    // Conference queries reading ONLY non-D1 fields
    {
      filename: SRC,
      code: 'const q = `conference->{_id, domains}`',
    },
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"]{_id, _rev, domains, organizers}`',
    },
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference" && _id == $id][0]{_id, domains}`',
    },
    // Dereferencing non-D1 fields on conference
    {
      filename: SRC,
      code: 'const q = `conference->organization._ref`',
    },
    {
      filename: SRC,
      code: 'const q = `conference->_id`',
    },
    {
      filename: SRC,
      code: 'import { mergeConference } from \'@/lib/conference/merge\'\nconst q = `*[_type == "conference"][0]{ title, city }`',
    },
    {
      filename: SRC,
      code: "import { mergeKonfApiConference } from '@/lib/conference/konf-api'\nconst q = `conference->{ title }`",
    },
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"][0]{_id, "org": organization->title, "t": $title}`',
    },
    // Self-exempt files: src/lib/conference/merge.ts
    {
      filename: 'src/lib/conference/merge.ts',
      code: 'const q = `*[_type == "conference"]{title, startDate}`',
    },
    {
      filename: 'src/lib/conference/merge.ts',
      code: 'const q = `conference->title`',
    },
    {
      filename: 'src/lib/conference/merge.ts',
      code: 'const q = `conference->{title, city, country}`',
    },
    // Self-exempt files: src/lib/conference/konf-api.ts
    {
      filename: 'src/lib/conference/konf-api.ts',
      code: 'const q = `*[_type == "conference"]{title, startDate}`',
    },
    {
      filename: 'src/lib/conference/konf-api.ts',
      code: 'const q = `conference->title`',
    },
    // Self-exempt files: *.test.*
    {
      filename: 'src/lib/conference/query.test.ts',
      code: 'const q = `*[_type == "conference"]{title}`',
    },
    {
      filename: 'src/lib/conference/query.test.tsx',
      code: 'const q = `conference->title`',
    },
    // Self-exempt files: *.stories.*
    {
      filename: 'src/components/Header.stories.tsx',
      code: 'const q = `*[_type == "conference"]{title, tagline}`',
    },
    // Self-exempt files: scripts/
    {
      filename: 'scripts/export-conferences.ts',
      code: 'const q = `*[_type == "conference"]{title, startDate}`',
    },
    // Self-exempt files: migrations/
    {
      filename: 'migrations/050-backfill-conf.ts',
      code: 'const q = `*[_type == "conference"]{title, city}`',
    },
    // Nested talk query inside conference projection reading talk's title/startDate
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"]{ _id, "talks": *[_type == "talk"]{ title, startDate } }`',
    },
    // String literal key with non-D1 field value
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"]{ "title": externalTitle }`',
    },
    // Subquery inside talk filter referencing conference
    {
      filename: SRC,
      code: 'const q = `*[_type == "talk" && conference._ref in *[_type == "conference"][]._id]{ title, startDate }`',
    },
    // Ordinary non-query strings mentioning conference
    {
      filename: SRC,
      code: 'const msg = "Welcome to the conference website"',
    },
  ],

  invalid: [
    // (a) Deref conference->title flagged
    {
      filename: SRC,
      code: 'import { rolloutFlags } from \'@/lib/conference/konf-api\'\nconst q = `*[_type == "conference"][0]{ title, city }`',
      errors: [
        { messageId: 'd1Field', data: { field: 'title' } },
        { messageId: 'd1Field', data: { field: 'city' } },
      ],
    },
    {
      filename: SRC,
      code: 'const q = `conference->title`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    // (a) Deref conference-> other D1 fields flagged
    {
      filename: SRC,
      code: 'const q = `conference->startDate`',
      errors: [{ messageId: 'd1Field', data: { field: 'startDate' } }],
    },
    {
      filename: SRC,
      code: 'const q = `conference->venueName`',
      errors: [{ messageId: 'd1Field', data: { field: 'venueName' } }],
    },
    {
      filename: SRC,
      code: 'const q = "const deref = conference->endDate"',
      errors: [{ messageId: 'd1Field', data: { field: 'endDate' } }],
    },
    {
      filename: SRC,
      code: 'const q = `conference-> title`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    // (b) conference->{ ... } projection flagged
    {
      filename: SRC,
      code: 'const q = `conference->{ title }`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    {
      filename: SRC,
      code: 'const q = `conference->{ title, startDate, city }`',
      errors: [
        { messageId: 'd1Field', data: { field: 'title' } },
        { messageId: 'd1Field', data: { field: 'startDate' } },
        { messageId: 'd1Field', data: { field: 'city' } },
      ],
    },
    {
      filename: SRC,
      code: 'const q = `conference->{ _id, registrationLink, socialLinks }`',
      errors: [
        { messageId: 'd1Field', data: { field: 'registrationLink' } },
        { messageId: 'd1Field', data: { field: 'socialLinks' } },
      ],
    },
    // (c) conference projection flagged
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"]{title}`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"]{title, startDate}`',
      errors: [
        { messageId: 'd1Field', data: { field: 'title' } },
        { messageId: 'd1Field', data: { field: 'startDate' } },
      ],
    },
    // (c) conference projection with [0] slice
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference" && _id == $id][0]{city, country}`',
      errors: [
        { messageId: 'd1Field', data: { field: 'city' } },
        { messageId: 'd1Field', data: { field: 'country' } },
      ],
    },
    // (c) conference projection with range slice
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"][0...5]{venueAddress, tagline}`',
      errors: [
        { messageId: 'd1Field', data: { field: 'venueAddress' } },
        { messageId: 'd1Field', data: { field: 'tagline' } },
      ],
    },
    // (c) single quotes in filter
    {
      filename: SRC,
      code: "const q = `*[_type == 'conference']{visibility, theme}`",
      errors: [
        { messageId: 'd1Field', data: { field: 'visibility' } },
        { messageId: 'd1Field', data: { field: 'theme' } },
      ],
    },
    // (c) no spaces around ==
    {
      filename: SRC,
      code: 'const q = `*[_type=="conference"]{backgroundPattern}`',
      errors: [{ messageId: 'd1Field', data: { field: 'backgroundPattern' } }],
    },
    // Regular string literal (non-template)
    {
      filename: SRC,
      code: 'const q = "*[_type == \\"conference\\"]{title}"',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    // Template literal with expressions
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference" && ${extraFilter}][0]{ title, ${otherFields} }`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    // Aliased projection: "myTitle": title
    {
      filename: SRC,
      code: 'const q = `*[_type == "conference"]{ "myTitle": title }`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
    // Reported once per field even if referenced multiple times in same query
    {
      filename: SRC,
      code: 'const q = `conference->title + " - " + conference->title`',
      errors: [{ messageId: 'd1Field', data: { field: 'title' } }],
    },
  ],
})
