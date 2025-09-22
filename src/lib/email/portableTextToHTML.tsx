import { toHTML } from '@portabletext/to-html'
import { PortableTextBlock } from '@portabletext/types'

export function portableTextToHTML(blocks: PortableTextBlock[]): string {
  if (!blocks || blocks.length === 0) {
    return ''
  }

  return toHTML(blocks, {
    components: {
      marks: {
        link: ({ children, value }) => {
          const href = value?.href || '#'
          return `<a href="${href}" style="color: #1D4ED8; text-decoration: underline; font-weight: 500;">${children}</a>`
        },
        strong: ({ children }) =>
          `<strong style="font-weight: 700; color: #1D4ED8;">${children}</strong>`,
        em: ({ children }) =>
          `<em style="font-style: italic; color: #7C3AED;">${children}</em>`,
        underline: ({ children }) =>
          `<u style="text-decoration: underline;">${children}</u>`,
        code: ({ children }) =>
          `<code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 3px; font-family: 'Courier New', monospace; color: #374151;">${children}</code>`,
      },
      block: {
        normal: ({ children }) =>
          `<p style="font-size: 16px; line-height: 1.6; color: #334155; margin-top: 0; margin-bottom: 16px;">${children}</p>`,
        h1: ({ children }) =>
          `<h1 style="font-size: 28px; font-weight: 700; line-height: 1.2; color: #1D4ED8; margin-top: 24px; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h1>`,
        h2: ({ children }) =>
          `<h2 style="font-size: 24px; font-weight: 600; line-height: 1.3; color: #1D4ED8; margin-top: 24px; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h2>`,
        h3: ({ children }) =>
          `<h3 style="font-size: 20px; font-weight: 600; line-height: 1.4; color: #1D4ED8; margin-top: 24px; margin-bottom: 12px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h3>`,
        h4: ({ children }) =>
          `<h4 style="font-size: 18px; font-weight: 600; line-height: 1.4; color: #1D4ED8; margin-top: 20px; margin-bottom: 10px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h4>`,
        h5: ({ children }) =>
          `<h5 style="font-size: 16px; font-weight: 600; line-height: 1.4; color: #1D4ED8; margin-top: 20px; margin-bottom: 10px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h5>`,
        h6: ({ children }) =>
          `<h6 style="font-size: 14px; font-weight: 600; line-height: 1.4; color: #1D4ED8; margin-top: 16px; margin-bottom: 8px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${children}</h6>`,
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
