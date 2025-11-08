#!/usr/bin/env node
/**
 * Test SVG Baking Compliance
 *
 * Verifies that SVG baking follows OpenBadges 3.0 spec 5.3.2.1
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') })

import { bakeBadge, extractBadge } from '@/lib/openbadges'

function testSVGBaking() {
  console.log('Testing SVG Baking Spec Compliance\n')
  console.log('===================================\n')

  // Create a minimal SVG
  const testSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="200" fill="#0066cc"/>
</svg>`

  // Create a test JWT
  const testJwt =
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiXX19.signature'

  console.log('1. Testing JWT Baking Format\n')

  try {
    const bakedSvg = bakeBadge(testSvg, testJwt)

    // Check for verify attribute
    const hasVerifyAttr = bakedSvg.includes('verify="')

    // Check that CDATA is NOT used for JWT (per spec 5.3.2.1)
    const hasCDATA = bakedSvg.includes('<![CDATA[')

    // Check for namespace
    const hasNamespace = bakedSvg.includes(
      'xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"',
    )

    console.log('Spec Compliance Checks:')
    console.log(`  ${hasVerifyAttr ? '✅' : '❌'} Has verify attribute`)
    console.log(`  ${!hasCDATA ? '✅' : '❌'} No CDATA for JWT (spec 5.3.2.1)`)
    console.log(`  ${hasNamespace ? '✅' : '❌'} Has openbadges namespace`)
    console.log('')

    // Show the credential tag
    const credMatch = bakedSvg.match(
      /<openbadges:credential[^>]*>.*?<\/openbadges:credential>/,
    )
    if (credMatch) {
      console.log('Generated credential tag:')
      console.log(credMatch[0])
      console.log('')
    }

    // Test extraction
    console.log('2. Testing JWT Extraction\n')
    const extracted = extractBadge(bakedSvg)

    if (typeof extracted === 'string' && extracted === testJwt) {
      console.log('✅ JWT extracted successfully and matches original')
    } else {
      console.log('❌ JWT extraction failed or does not match')
      console.log('Expected:', testJwt)
      console.log('Got:', extracted)
    }

    console.log('')

    const allPassed =
      hasVerifyAttr && !hasCDATA && hasNamespace && extracted === testJwt

    if (allPassed) {
      console.log('✅ All SVG baking tests passed! Spec-compliant.\n')
      return true
    } else {
      console.log('❌ Some SVG baking tests failed.\n')
      return false
    }
  } catch (error) {
    console.error('❌ Error during baking test:', error)
    return false
  }
}

const success = testSVGBaking()
process.exit(success ? 0 : 1)
