/**
 * Badge Baking Module
 *
 * Implements OpenBadges 2.0 badge baking specification for SVG files.
 * Embeds badge assertion JSON directly into SVG images for portability.
 *
 * Reference: https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/baking/index.html
 */

import type { BadgeAssertion } from './types'

const OPENBADGES_NAMESPACE = 'http://openbadges.org'

/**
 * Bake a badge assertion into an SVG file
 *
 * According to OpenBadges 2.0 baking spec:
 * 1. Add xmlns:openbadges attribute to <svg> tag
 * 2. Insert <openbadges:assertion> tag directly after <svg> tag
 * 3. Set verify attribute to the badge verification URL
 * 4. Wrap JSON in CDATA section
 */
export function bakeBadge(
  svgContent: string,
  assertion: BadgeAssertion,
  verificationUrl: string,
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

  const svgTag = svgTagMatch[0]
  const svgAttributes = svgTagMatch[1] || ''

  // Check if already has openbadges namespace
  const hasNamespace = svgAttributes.includes('xmlns:openbadges')

  // Create new SVG tag with openbadges namespace
  let newSvgTag = svgTag
  if (!hasNamespace) {
    newSvgTag = svgTag.replace(
      '<svg',
      `<svg xmlns:openbadges="${OPENBADGES_NAMESPACE}"`,
    )
  }

  // Create the assertion tag with CDATA wrapped JSON
  const assertionJson = JSON.stringify(assertion, null, 2)
  const assertionTag = `
  <openbadges:assertion verify="${verificationUrl}">
    <![CDATA[${assertionJson}]]>
  </openbadges:assertion>`

  // Replace the SVG tag and insert assertion immediately after
  const bakedSvg = svgContent
    .replace(svgTag, newSvgTag)
    .replace(newSvgTag, newSvgTag + assertionTag)

  return bakedSvg
}

/**
 * Extract badge assertion from a baked SVG
 *
 * Parses the <openbadges:assertion> tag and returns the JSON data
 */
export function extractBadgeFromSVG(bakedSvgContent: string): {
  assertion: BadgeAssertion | null
  verificationUrl: string | null
} {
  try {
    // Find the openbadges:assertion tag
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
 */
export function isBakedSVG(svgContent: string): boolean {
  return svgContent.includes('<openbadges:assertion')
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

  // Check for openbadges namespace
  if (!svgContent.includes('xmlns:openbadges')) {
    return { isValid: false, error: 'Missing openbadges namespace' }
  }

  // Check for assertion tag
  if (!isBakedSVG(svgContent)) {
    return { isValid: false, error: 'Missing openbadges:assertion tag' }
  }

  // Try to extract and validate JSON
  const { assertion, verificationUrl } = extractBadgeFromSVG(svgContent)

  if (!assertion) {
    return { isValid: false, error: 'Cannot extract badge assertion JSON' }
  }

  if (!verificationUrl) {
    return { isValid: false, error: 'Missing verification URL' }
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
