/**
 * Badge Baking Module
 *
 * Implements OpenBadges 3.0 badge baking specification for SVG files.
 * Embeds badge assertion JSON directly into SVG images for portability.
 *
 * OpenBadges 3.0 (Section 5.3.2.1) specifies:
 * 1. Add xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0" to <svg> tag
 * 2. Add <openbadges:credential> tag after <svg> tag
 * 3. For embedded proof: JSON goes in <![CDATA[...]]> wrapper
 * 4. For VC-JWT proof: JWT goes in verify="" attribute
 *
 * Reference: https://www.imsglobal.org/spec/ob/v3p0/#svg-baking
 */

import type { BadgeAssertion } from './types'

/**
 * Bake a badge assertion into an SVG file (OpenBadges 3.0 format)
 *
 * According to OpenBadges 3.0 spec (Section 5.3.2.1):
 * 1. Add xmlns:openbadges namespace to <svg> tag
 * 2. Add <openbadges:credential> tag immediately after <svg> tag
 * 3. Embed JSON representation in CDATA section (for embedded proof format)
 *
 * The verification URL is already included in the assertion's `id` field.
 */
export function bakeBadge(
  svgContent: string,
  assertion: BadgeAssertion,
): string {
  // Validate SVG content
  if (!svgContent.includes('<svg') || !svgContent.includes('</svg>')) {
    throw new Error('Invalid SVG content: missing <svg> tags')
  }

  // Find the <svg> opening tag
  const svgTagMatch = svgContent.match(/<svg([^>]*)>/)
  if (!svgTagMatch) {
    throw new Error('Invalid SVG content: cannot parse <svg> tag')
  }

  let svgTag = svgTagMatch[0]
  const svgAttributes = svgTagMatch[1]

  // Add xmlns:openbadges namespace if not present
  const obNamespace = 'https://purl.imsglobal.org/ob/v3p0'
  if (!svgAttributes.includes('xmlns:openbadges=')) {
    svgTag = svgTag.replace('>', ` xmlns:openbadges="${obNamespace}">`)
  }

  // Format assertion JSON with proper indentation
  const assertionJson = JSON.stringify(assertion, null, 2)
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n')

  // Create the openbadges:credential tag with CDATA-wrapped JSON (OB 3.0 embedded proof format)
  const credentialTag = `  <openbadges:credential>
    <![CDATA[
${assertionJson}
    ]]>
  </openbadges:credential>
`

  // Insert credential immediately after modified SVG tag
  const bakedSvg = svgContent.replace(
    svgTagMatch[0],
    svgTag + '\n' + credentialTag,
  )

  return bakedSvg
}

/**
 * Extract badge assertion from a baked SVG
 *
 * Supports OpenBadges 3.0 format: <openbadges:credential> with CDATA
 * Also supports legacy OB 2.0: <openbadges:assertion> with verify attribute
 */
export function extractBadgeFromSVG(bakedSvgContent: string): {
  assertion: BadgeAssertion | null
  verificationUrl: string | null
} {
  try {
    // Try OpenBadges 3.0 format: <openbadges:credential>
    const credentialMatch = bakedSvgContent.match(
      /<openbadges:credential[^>]*>([\s\S]*?)<\/openbadges:credential>/,
    )

    if (credentialMatch) {
      const content = credentialMatch[1]

      // Extract JSON from CDATA
      const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
      if (!cdataMatch) {
        // Try without CDATA (in case of plain JSON)
        const assertion = JSON.parse(content.trim()) as BadgeAssertion
        const verificationUrl = assertion.id || null
        return { assertion, verificationUrl }
      }

      const jsonString = cdataMatch[1].trim()
      const assertion = JSON.parse(jsonString) as BadgeAssertion
      const verificationUrl = assertion.id || null

      return { assertion, verificationUrl }
    }

    // Fallback to OpenBadges 2.0 format: <openbadges:assertion>
    const assertionMatch = bakedSvgContent.match(
      /<openbadges:assertion\s+verify="([^"]+)"[^>]*>([\s\S]*?)<\/openbadges:assertion>/,
    )

    if (!assertionMatch) {
      return { assertion: null, verificationUrl: null }
    }

    const verificationUrl = assertionMatch[1]
    const content = assertionMatch[2]

    // Extract JSON from CDATA
    const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
    if (!cdataMatch) {
      return { assertion: null, verificationUrl }
    }

    const jsonString = cdataMatch[1]
    const assertion = JSON.parse(jsonString) as BadgeAssertion

    return { assertion, verificationUrl }
  } catch (error) {
    console.error('Failed to extract badge from SVG:', error)
    return { assertion: null, verificationUrl: null }
  }
}

/**
 * Check if an SVG has been baked with badge data
 * Supports both OB 3.0 (<openbadges:credential>) and OB 2.0 (<openbadges:assertion>) formats
 */
export function isBakedSVG(svgContent: string): boolean {
  return (
    svgContent.includes('<openbadges:credential') ||
    svgContent.includes('<openbadges:assertion')
  )
}

/**
 * Validate a baked SVG
 * Checks that it has proper structure and valid JSON
 */
export function validateBakedSVG(svgContent: string): {
  isValid: boolean
  error?: string
} {
  // Check for SVG structure
  if (!svgContent.includes('<svg') || !svgContent.includes('</svg>')) {
    return { isValid: false, error: 'Invalid SVG structure' }
  }

  // Check for baked badge data
  if (!isBakedSVG(svgContent)) {
    return { isValid: false, error: 'Missing badge credential data' }
  }

  // Try to extract and validate JSON
  const { assertion } = extractBadgeFromSVG(svgContent)

  if (!assertion) {
    return { isValid: false, error: 'Cannot extract badge assertion JSON' }
  }

  // Validate assertion structure
  if (
    !assertion['@context'] ||
    !assertion.type ||
    !assertion.credentialSubject
  ) {
    return { isValid: false, error: 'Invalid badge assertion structure' }
  }

  return { isValid: true }
}
