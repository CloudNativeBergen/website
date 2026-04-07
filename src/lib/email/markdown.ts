import { PortableTextBlock } from '@portabletext/types'
import {
  portableTextToMarkdown,
  markdownToPortableText,
} from '@portabletext/markdown'

/**
 * Convert PortableText blocks to Markdown.
 *
 * Handles the email-safe subset: paragraphs, headings, bold, italic,
 * links, ordered/unordered lists, and blockquotes.
 */
export function portableTextBodyToMarkdown(
  blocks: PortableTextBlock[],
): string {
  if (!blocks || blocks.length === 0) {
    return ''
  }

  return portableTextToMarkdown(blocks)
}

/**
 * Convert Markdown to PortableText blocks.
 *
 * Only the email-safe subset is expected. Raw HTML in the input is
 * passed through as plain text (not interpreted) by the underlying
 * parser, which is safe for our use case.
 */
export function markdownToPortableTextBody(
  markdown: string,
): PortableTextBlock[] {
  if (!markdown || markdown.trim().length === 0) {
    return []
  }

  return markdownToPortableText(markdown) as PortableTextBlock[]
}
