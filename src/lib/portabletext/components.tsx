import { PortableTextComponents } from '@portabletext/react'

/**
 * Custom PortableText components for rendering rich text content.
 * Provides consistent styling for headings, paragraphs, lists, and inline formatting
 * that matches the editor experience.
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
    link: ({ value, children }) => {
      const href = (value as { href?: string })?.href || '#'
      return (
        <a
          href={href}
          className="font-medium text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      )
    },
  },
}
