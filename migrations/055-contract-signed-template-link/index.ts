import { at, defineMigration, patch, set } from 'sanity/migrate'

/**
 * The seeded `contract-signed` sponsor email template (migration 036) says
 * "A copy of the signed agreement is attached to this email for your
 * records." Since #1264 the organizer's "Send signed copy" LINKS the stored
 * document (the card under the body) and attaches nothing; only the
 * confirmation the signing flow itself sends still attaches the PDF. This
 * rewrites that one sentence, in every org's copy of the template, when it
 * is still EXACTLY the seeded text; an edited body is left alone.
 * Idempotent: a rewritten block no longer matches. Not run automatically.
 */
export const SEEDED =
  'A copy of the signed agreement is attached to this email for your records.'
export const LINKED =
  'A copy of the signed agreement is available at the link below for your records.'

type Block = {
  _key?: string
  _type?: string
  children?: Array<{ _key?: string; _type?: string; text?: string }>
}

export function rewritesFor(doc: {
  slug?: { current?: string }
  body?: Block[]
}): Array<{ blockKey: string; spanKey: string }> {
  if (doc.slug?.current !== 'contract-signed') return []
  const out: Array<{ blockKey: string; spanKey: string }> = []
  for (const block of doc.body ?? []) {
    if (block._type !== 'block' || !block._key) continue
    const spans = block.children ?? []
    if (spans.length !== 1) continue
    const span = spans[0]
    if (span._type === 'span' && span._key && span.text === SEEDED) {
      out.push({ blockKey: block._key, spanKey: span._key })
    }
  }
  return out
}

export default defineMigration({
  title: 'contract-signed template: the signed copy is linked, not attached',
  documentTypes: ['sponsorEmailTemplate'],
  async *migrate(documents) {
    for await (const doc of documents()) {
      const rewrites = rewritesFor(doc as Parameters<typeof rewritesFor>[0])
      if (rewrites.length === 0) continue
      yield patch(
        doc._id,
        rewrites.map((r) =>
          at(
            [
              'body',
              { _key: r.blockKey },
              'children',
              { _key: r.spanKey },
              'text',
            ],
            set(LINKED),
          ),
        ),
        { ifRevision: doc._rev },
      )
    }
  },
})
