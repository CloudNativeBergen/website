/**
 * Badge Baking
 *
 * Embeds and extracts OpenBadges 3.0 credentials in SVG images.
 * Implements OB 3.0 baking specification (Section 5.3.2.1).
 */

import { BakingError, ExtractionError } from './errors'
import type { SignedCredential } from './types'

/**
 * OpenBadges 3.0 namespace
 */
const OB_NAMESPACE = 'https://purl.imsglobal.org/ob/v3p0'

/**
 * Validate SVG content
 * @throws {BakingError} if SVG is invalid
 */
function validateSvg(svg: string): void {
  if (!svg || typeof svg !== 'string') {
    throw new BakingError('SVG content must be a non-empty string', {
      received: typeof svg,
    })
  }

  if (!svg.includes('<svg')) {
    throw new BakingError('Invalid SVG: missing <svg> tag')
  }

  if (!svg.includes('</svg>')) {
    throw new BakingError('Invalid SVG: missing </svg> closing tag')
  }
}

/**
 * Bake a signed credential into an SVG image
 *
 * Per OpenBadges 3.0 spec (Section 5.3.2.1):
 * 1. Add xmlns:openbadges namespace to <svg> tag
 * 2. Add <openbadges:credential> tag after <svg> tag
 * 3. Embed JSON in CDATA section
 *
 * @param svg - The SVG content to bake into
 * @param credential - The signed credential to embed
 * @returns SVG with baked credential
 * @throws {BakingError} if baking fails
 */
export function bakeBadge(svg: string, credential: SignedCredential): string {
  // Validate inputs
  validateSvg(svg)

  if (!credential || typeof credential !== 'object') {
    throw new BakingError('Credential must be an object', {
      received: typeof credential,
    })
  }

  if (
    !credential.proof ||
    !Array.isArray(credential.proof) ||
    credential.proof.length === 0
  ) {
    throw new BakingError('Credential must be signed (must have proof array)', {
      hasProof: !!credential.proof,
    })
  }

  try {
    // Find the <svg> opening tag
    const svgTagMatch = svg.match(/<svg([^>]*)>/)
    if (!svgTagMatch) {
      throw new BakingError('Cannot parse <svg> tag')
    }

    let svgTag = svgTagMatch[0]
    const svgAttributes = svgTagMatch[1]

    // Add xmlns:openbadges namespace if not present
    if (!svgAttributes.includes('xmlns:openbadges=')) {
      svgTag = svgTag.replace('>', ` xmlns:openbadges="${OB_NAMESPACE}">`)
    }

    // Format credential JSON with proper indentation
    const credentialJson = JSON.stringify(credential, null, 2)
      .split('\n')
      .map((line) => `      ${line}`)
      .join('\n')

    // Create the openbadges:credential tag with CDATA-wrapped JSON
    const credentialTag = `  <openbadges:credential>
    <![CDATA[
${credentialJson}
    ]]>
  </openbadges:credential>
`

    // Insert credential immediately after modified SVG tag
    const bakedSvg = svg.replace(svgTagMatch[0], svgTag + '\n' + credentialTag)

    return bakedSvg
  } catch (error) {
    if (error instanceof BakingError) {
      throw error
    }
    throw new BakingError('Failed to bake credential into SVG', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Extract a credential from a baked SVG
 *
 * Supports OpenBadges 3.0 format: <openbadges:credential> with CDATA
 *
 * @param svg - The baked SVG content
 * @returns The extracted signed credential
 * @throws {ExtractionError} if extraction fails
 */
export function extractBadge(svg: string): SignedCredential {
  if (!svg || typeof svg !== 'string') {
    throw new ExtractionError('SVG content must be a non-empty string', {
      received: typeof svg,
    })
  }

  try {
    // Try OpenBadges 3.0 format: <openbadges:credential>
    const credentialMatch = svg.match(
      /<openbadges:credential[^>]*>([\s\S]*?)<\/openbadges:credential>/,
    )

    if (!credentialMatch) {
      throw new ExtractionError('No OpenBadges 3.0 credential found in SVG', {
        hasCredentialTag: false,
      })
    }

    const content = credentialMatch[1]

    // Extract JSON from CDATA
    const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)

    if (!cdataMatch) {
      // Try without CDATA (in case of plain JSON)
      const credential = JSON.parse(content.trim()) as SignedCredential
      return credential
    }

    const jsonString = cdataMatch[1].trim()
    const credential = JSON.parse(jsonString) as SignedCredential

    // Validate that it's a signed credential
    if (
      !credential.proof ||
      !Array.isArray(credential.proof) ||
      credential.proof.length === 0
    ) {
      throw new ExtractionError(
        'Extracted credential is not signed (missing proof)',
        { hasProof: !!credential.proof },
      )
    }

    return credential
  } catch (error) {
    if (error instanceof ExtractionError) {
      throw error
    }
    throw new ExtractionError('Failed to extract credential from SVG', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Check if an SVG contains a baked credential
 *
 * @param svg - The SVG content to check
 * @returns True if SVG contains an OpenBadges 3.0 credential
 */
export function isBakedSvg(svg: string): boolean {
  if (!svg || typeof svg !== 'string') {
    return false
  }

  return svg.includes('<openbadges:credential')
}
