import { BakingError, ExtractionError } from './errors'
import type { SignedCredential } from './types'

const OB_NAMESPACE = 'https://purl.imsglobal.org/ob/v3p0'

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

export function bakeBadge(
  svg: string,
  credential: SignedCredential | string,
): string {
  validateSvg(svg)

  if (typeof credential === 'string') {
    return bakeJWT(svg, credential)
  }

  return bakeDataIntegrityProof(svg, credential)
}

function bakeJWT(svg: string, jwt: string): string {
  if (!jwt.startsWith('eyJ')) {
    throw new BakingError(
      'Credential string must be a valid JWT (should start with "eyJ")',
      { received: jwt.substring(0, 10) },
    )
  }

  try {
    const svgTagMatch = svg.match(/<svg([^>]*)>/)
    if (!svgTagMatch) {
      throw new BakingError('Cannot parse <svg> tag')
    }

    let svgTag = svgTagMatch[0]
    const svgAttributes = svgTagMatch[1]

    if (!svgAttributes.includes('xmlns:openbadges=')) {
      svgTag = svgTag.replace('>', ` xmlns:openbadges="${OB_NAMESPACE}">`)
    }

    const credentialXml = `\n  <openbadges:credential verify="${jwt}"></openbadges:credential>`
    return svg.replace(svgTagMatch[0], svgTag + credentialXml)
  } catch (error) {
    if (error instanceof BakingError) throw error
    throw new BakingError('Failed to bake JWT into SVG', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function bakeDataIntegrityProof(
  svg: string,
  credential: SignedCredential,
): string {
  if (!credential || typeof credential !== 'object') {
    throw new BakingError('Credential must be an object or JWT string', {
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
    const svgTagMatch = svg.match(/<svg([^>]*)>/)
    if (!svgTagMatch) {
      throw new BakingError('Cannot parse <svg> tag')
    }

    let svgTag = svgTagMatch[0]
    const svgAttributes = svgTagMatch[1]

    if (!svgAttributes.includes('xmlns:openbadges=')) {
      svgTag = svgTag.replace('>', ` xmlns:openbadges="${OB_NAMESPACE}">`)
    }

    const credentialJson = JSON.stringify(credential, null, 2)
      .split('\n')
      .map((line) => `      ${line}`)
      .join('\n')

    const credentialTag = `  <openbadges:credential>
    <![CDATA[
${credentialJson}
    ]]>
  </openbadges:credential>
`

    return svg.replace(svgTagMatch[0], svgTag + '\n' + credentialTag)
  } catch (error) {
    if (error instanceof BakingError) throw error
    throw new BakingError('Failed to bake credential into SVG', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function extractBadge(svg: string): SignedCredential | string {
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

    // Check for verify attribute (JWT format)
    const verifyMatch = svg.match(
      /<openbadges:credential[^>]*\s+verify="([^"]+)"/,
    )
    if (verifyMatch) {
      return verifyMatch[1]
    }

    // Otherwise extract from CDATA (Data Integrity Proof format)
    const content = credentialMatch[1]
    const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
    const credentialString = cdataMatch ? cdataMatch[1].trim() : content.trim()

    // Check if it's a JWT (starts with "eyJ")
    if (credentialString.startsWith('eyJ')) {
      return credentialString
    }

    // Otherwise, parse as JSON (Data Integrity Proof format)
    const credential = JSON.parse(credentialString) as SignedCredential

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

export function isBakedSvg(svg: string): boolean {
  if (!svg || typeof svg !== 'string') {
    return false
  }

  return svg.includes('<openbadges:credential')
}
