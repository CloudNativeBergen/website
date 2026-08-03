import { toHTML } from '@portabletext/to-html'
import { PortableTextBlock } from '@portabletext/types'

import { resolveEmailBrandPalette } from '@/lib/branding/email'

/**
 * Render a Sanity rich-text body as inline-styled email HTML.
 *
 * THE HIGHEST-LEVERAGE COLOUR SITE IN THE CODEBASE: this one function paints
 * every broadcast, every sponsor-CRM email and every contract email, and it
 * hard-coded the house blue in eight places. `brandColor` is the tenant's
 * primary (resolved by the sender via `emailBrandColor`); omitted, every colour
 * is the pre-theming literal, byte for byte.
 *
 * Non-brand colours — body slate, code chip grey, blockquote rule — are NOT
 * themed. They are reading chrome, not identity.
 */
export function portableTextToHTML(
  blocks: PortableTextBlock[],
  brandColor?: string,
): string {
  if (!blocks || blocks.length === 0) {
    return ''
  }

  const brand = resolveEmailBrandPalette(brandColor)

  return toHTML(blocks, {
    components: {
      marks: {
        link: ({ children, value }) => {
          const href = value?.href || '#'
          return `<a href="${href}" style="color: ${brand.accent}; text-decoration: underline; font-weight: 500;">${children}</a>`
        },
        strong: ({ children }) =>
          `<strong style="font-weight: 700; color: ${brand.accent};">${children}</strong>`,
        em: ({ children }) =>
          `<em style="font-style: italic; color: ${brand.emphasis};">${children}</em>`,
        underline: ({ children }) =>
          `<u style="text-decoration: underline;">${children}</u>`,
        code: ({ children }) =>
          `<code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 3px; font-family: 'Courier New', monospace; color: #374151;">${children}</code>`,
      },
      block: {
        normal: ({ children }) =>
          `<p style="font-size: 16px; line-height: 1.6; color: #334155; margin-top: 0; margin-bottom: 16px;">${children}</p>`,
        h1: ({ children }) =>
          `<h1 style="font-size: 28px; font-weight: 700; line-height: 1.2; color: ${brand.accent}; margin-top: 24px; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h1>`,
        h2: ({ children }) =>
          `<h2 style="font-size: 24px; font-weight: 600; line-height: 1.3; color: ${brand.accent}; margin-top: 24px; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h2>`,
        h3: ({ children }) =>
          `<h3 style="font-size: 20px; font-weight: 600; line-height: 1.4; color: ${brand.accent}; margin-top: 24px; margin-bottom: 12px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h3>`,
        h4: ({ children }) =>
          `<h4 style="font-size: 18px; font-weight: 600; line-height: 1.4; color: ${brand.accent}; margin-top: 20px; margin-bottom: 10px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h4>`,
        h5: ({ children }) =>
          `<h5 style="font-size: 16px; font-weight: 600; line-height: 1.4; color: ${brand.accent}; margin-top: 20px; margin-bottom: 10px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h5>`,
        h6: ({ children }) =>
          `<h6 style="font-size: 14px; font-weight: 600; line-height: 1.4; color: ${brand.accent}; margin-top: 16px; margin-bottom: 8px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h6>`,
        blockquote: ({ children }) =>
          `<blockquote style="border-left: 4px solid #e2e8f0; padding-left: 16px; margin: 16px 0; font-style: italic; color: #64748b;">${children}</blockquote>`,
      },
      list: {
        bullet: ({ children }) =>
          `<ul style="margin: 16px 0; padding-left: 20px; list-style-type: disc; list-style-position: outside; color: #334155; font-size: 16px; line-height: 1.6;">${children}</ul>`,
        number: ({ children }) =>
          `<ol style="margin: 16px 0; padding-left: 20px; list-style-type: decimal; list-style-position: outside; color: #334155; font-size: 16px; line-height: 1.6;">${children}</ol>`,
      },
      listItem: {
        bullet: ({ children }) =>
          `<li style="margin-bottom: 8px; display: list-item; list-style-type: disc; list-style-position: outside; color: #334155; padding-left: 0;">${children}</li>`,
        number: ({ children }) =>
          `<li style="margin-bottom: 8px; display: list-item; list-style-type: decimal; list-style-position: outside; color: #334155; padding-left: 0;">${children}</li>`,
      },
    },
  })
}
