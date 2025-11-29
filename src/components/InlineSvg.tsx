'use client'

/**
 * Simple inline SVG renderer
 * Replaces @starefossen/sanity-plugin-inline-svg-input to avoid jsdom dependency
 */

interface InlineSvgProps {
  value: string
  className?: string
  style?: React.CSSProperties
}

export function InlineSvg({ value, className, style }: InlineSvgProps) {
  if (!value) {
    return null
  }

  let svgContent = value

  // Add className to the <svg> tag if provided
  if (className) {
    svgContent = svgContent.replace(/<svg([^>]*)>/i, (match, attrs) => {
      // Check if there's already a class attribute
      if (/class=/i.test(attrs)) {
        // Append to existing class
        return match.replace(/class="([^"]*)"/i, `class="$1 ${className}"`)
      } else {
        // Add new class attribute
        return `<svg${attrs} class="${className}">`
      }
    })
  }

  // Add inline styles to the <svg> tag if provided
  if (style) {
    const styleString = Object.entries(style)
      .map(([key, value]) => {
        // Convert camelCase to kebab-case
        const cssKey = key.replace(
          /[A-Z]/g,
          (match) => `-${match.toLowerCase()}`,
        )
        return `${cssKey}:${value}`
      })
      .join(';')

    svgContent = svgContent.replace(/<svg([^>]*)>/i, (match, attrs) => {
      // Check if there's already a style attribute
      if (/style=/i.test(attrs)) {
        // Append to existing style
        return match.replace(/style="([^"]*)"/i, `style="$1;${styleString}"`)
      } else {
        // Add new style attribute
        return `<svg${attrs} style="${styleString}">`
      }
    })
  }

  return <div dangerouslySetInnerHTML={{ __html: svgContent }} />
}
