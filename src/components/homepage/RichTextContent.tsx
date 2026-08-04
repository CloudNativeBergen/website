import { PortableText, type PortableTextComponents } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import {
  parseImageRefDimensions,
  richTextImageUrl,
} from '@/lib/homepage/richTextImage'
import {
  sanitizeRichTextContent,
  isRichTextContentEmpty,
  type RichTextCalloutBlock,
  type RichTextCodeBlock,
  type RichTextImageBlock,
  type RichTextTableBlock,
} from '@/lib/homepage/richText'

/**
 * The render half of the homepage Rich Text escape hatch.
 *
 * Every value below reaches the DOM as a React text child or as an attribute we
 * computed ourselves from an allowlisted literal. There is no
 * `dangerouslySetInnerHTML` in this file, no `<script>`, no `<iframe>`, and no
 * attribute whose value comes verbatim from tenant input — the two attributes
 * that DO carry organizer data are `href` (gated by `toSafeRichTextHref` in the
 * shared portable-text `link` mark) and `src` (built by `richTextImageUrl` from
 * an asset id that matched `SANITY_IMAGE_REF_PATTERN`, so the host is always
 * `cdn.sanity.io`). Keep it that way.
 */

/**
 * Preformatted text — the "render our venue as a Kubernetes manifest" case.
 * `{code}` is a text child: React escapes it, so a `</code><script>` payload is
 * displayed, never parsed. No syntax highlighter runs over it, by choice; a
 * highlighter is a tokenizer that emits markup, and that is exactly the kind of
 * machinery this block exists to avoid.
 */
function CodeBlock({ value }: { value: RichTextCodeBlock }) {
  return (
    <figure className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
      {value.filename ? (
        <figcaption className="border-b border-gray-200 px-4 py-2 font-mono text-xs text-gray-600 dark:border-white/10 dark:text-gray-400">
          {value.filename}
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-gray-800 dark:text-gray-200">
          {value.code}
        </code>
      </pre>
    </figure>
  )
}

function ImageBlock({ value }: { value: RichTextImageBlock }) {
  const src = richTextImageUrl(value.asset._ref)
  if (!src) return null
  const dimensions = parseImageRefDimensions(value.asset._ref)
  return (
    <figure className="mb-6">
      {/* Plain <img>: a Sanity CDN URL with intrinsic dimensions read from the
          asset id; matches how every other Sanity-hosted image in the app is
          rendered. */}
      <img
        src={src}
        alt={value.alt}
        width={dimensions?.width}
        height={dimensions?.height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-xl"
      />
      {value.caption ? (
        <figcaption className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {value.caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * A small plain-text table. A two-column table IS the definition-list case, so
 * there is one type rather than two. The scroll container is not cosmetic: a
 * table wide enough to overflow must scroll INSIDE its own box, never push the
 * page sideways on a phone.
 */
function TableBlock({ value }: { value: RichTextTableBlock }) {
  const [first, ...rest] = value.rows
  const bodyRows = value.headerRow ? rest : value.rows
  return (
    <figure className="mb-6">
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
        <table className="w-full min-w-max border-collapse text-left text-base">
          {value.headerRow ? (
            <thead className="bg-gray-50 dark:bg-white/5">
              <tr>
                {first.cells.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-4 py-3 font-semibold text-gray-900 dark:text-white"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {bodyRows.map((row) => (
              <tr
                key={row._key}
                className="border-t border-gray-200 dark:border-white/10"
              >
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-4 py-3 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {value.caption ? (
        <figcaption className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {value.caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/** Tone → house classes. A closed map: an unknown tone cannot reach this. */
const CALLOUT_TONES: Record<RichTextCalloutBlock['tone'], string> = {
  info: 'border-brand-cloud-blue/40 bg-brand-cloud-blue/5 dark:border-blue-400/40 dark:bg-blue-400/10',
  success:
    'border-emerald-500/40 bg-emerald-500/5 dark:border-emerald-400/40 dark:bg-emerald-400/10',
  warning:
    'border-amber-500/40 bg-amber-500/5 dark:border-amber-400/40 dark:bg-amber-400/10',
}

function CalloutBlock({ value }: { value: RichTextCalloutBlock }) {
  return (
    <aside
      className={`mb-6 rounded-xl border-l-4 p-4 ${CALLOUT_TONES[value.tone]}`}
    >
      {value.title ? (
        <p className="font-space-grotesk mb-1 font-semibold text-gray-900 dark:text-white">
          {value.title}
        </p>
      ) : null}
      <p className="leading-relaxed whitespace-pre-line">{value.body}</p>
    </aside>
  )
}

/**
 * The shared site component map, extended with the four homepage-only object
 * types. Anything not named here renders nothing — `@portabletext/react` skips
 * unknown types, which is the same forward-compatible posture the section
 * renderer takes.
 */
const richTextComponents: PortableTextComponents = {
  ...portableTextComponents,
  types: {
    richTextCode: ({ value }: { value: RichTextCodeBlock }) => (
      <CodeBlock value={value} />
    ),
    richTextImage: ({ value }: { value: RichTextImageBlock }) => (
      <ImageBlock value={value} />
    ),
    richTextTable: ({ value }: { value: RichTextTableBlock }) => (
      <TableBlock value={value} />
    ),
    richTextCallout: ({ value }: { value: RichTextCalloutBlock }) => (
      <CalloutBlock value={value} />
    ),
  },
}

/**
 * Render organizer-authored rich content. `content` is UNTRUSTED on purpose —
 * the caller may hand over whatever the dataset holds, including documents
 * written straight through Sanity Studio, and this component sanitizes before
 * rendering rather than assuming the write path was the only writer.
 */
export function RichTextContent({ content }: { content: unknown }) {
  const blocks = sanitizeRichTextContent(content)
  if (blocks.length === 0 || isRichTextContentEmpty(blocks)) return null
  return <PortableText value={blocks} components={richTextComponents} />
}
