import { PortableTextComponents } from '@portabletext/react'
import { toSafeRichTextHref } from './safeHref'

/**
 * Custom PortableText components for rendering rich text content.
 * Provides consistent styling for headings, paragraphs, lists, and inline formatting
 * that matches the editor experience.
 *
 * Portable-text content is tenant-authored (speaker bios, homepage rich-text
 * blocks, …), so the `link` mark runs every stored href through
 * {@link toSafeRichTextHref}: a `javascript:`/`data:` href degrades to an inert
 * anchor instead of executing. Everything else here renders its children as
 * React text, which React escapes — no map entry uses
 * `dangerouslySetInnerHTML`, and none must ever start.
 */
export const portableTextComponents: PortableTextComponents = {
  block: {
    h1: ({ children }) => (
      <h1 className="mb-6 text-3xl leading-tight font-bold">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-5 text-2xl leading-snug font-semibold">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-4 text-xl leading-normal font-semibold">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="mb-3 text-lg leading-normal font-semibold">{children}</h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-4 border-l-4 border-gray-300 pl-4 leading-relaxed italic dark:border-gray-600">
        {children}
      </blockquote>
    ),
    normal: ({ children }) => (
      <p className="mb-4 leading-relaxed">{children}</p>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mb-4 ml-6 list-disc space-y-2">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="mb-4 ml-6 list-decimal space-y-2">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => <li className="leading-relaxed">{children}</li>,
    number: ({ children }) => <li className="leading-relaxed">{children}</li>,
  },
  marks: {
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    underline: ({ children }) => <u className="underline">{children}</u>,
    'strike-through': ({ children }) => (
      <s className="line-through">{children}</s>
    ),
    code: ({ children }) => (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.9em] break-words text-gray-800 dark:bg-white/10 dark:text-gray-100">
        {children}
      </code>
    ),
    link: ({ value, children }) => {
      const href = toSafeRichTextHref((value as { href?: string })?.href)
      return (
        <a
          href={href}
          className="font-medium break-words text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      )
    },
  },
}
