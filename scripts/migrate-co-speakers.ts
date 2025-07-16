#!/usr/bin/env tsx
/**
 * Migration script for co-speaker functionality
 * 
 * This script ensures that all proposals have the correct co-speaker data structure:
 * - Initializes empty coSpeakers array for proposals that don't have it
 * - Initializes empty coSpeakerInvitations array for proposals that don't have it
 * - Validates existing co-speaker data
 * 
 * Usage: npm run migrate:co-speakers
 * 
 * Run with --dry-run flag to preview changes without applying them:
 * npm run migrate:co-speakers -- --dry-run
 */

import { clientWrite, clientReadUncached } from '../src/lib/sanity/client'
import { groq } from 'next-sanity'
import { ProposalExisting } from '../src/lib/proposal/types'

const DRY_RUN = process.argv.includes('--dry-run')

interface MigrationResult {
  proposalId: string
  title: string
  changes: string[]
  error?: string
}

async function migrateCoSpeakers() {
  console.log('🚀 Starting co-speaker migration...')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  try {
    // Fetch all proposals that might need migration
    const proposals = await clientReadUncached.fetch<ProposalExisting[]>(
      groq`*[_type == "talk"] {
        _id,
        title,
        status,
        coSpeakers,
        coSpeakerInvitations,
        format
      }`,
      {},
      { cache: 'no-store' }
    )

    console.log(`Found ${proposals.length} proposals to check\n`)

    const results: MigrationResult[] = []
    let migratedCount = 0
    let errorCount = 0

    for (const proposal of proposals) {
      const result: MigrationResult = {
        proposalId: proposal._id,
        title: proposal.title,
        changes: []
      }

      try {
        const updates: any = {}
        let needsUpdate = false

        // Check if coSpeakers field exists
        if (!proposal.coSpeakers) {
          updates.coSpeakers = []
          result.changes.push('Added coSpeakers array')
          needsUpdate = true
        }

        // Check if coSpeakerInvitations field exists
        if (!proposal.coSpeakerInvitations) {
          updates.coSpeakerInvitations = []
          result.changes.push('Added coSpeakerInvitations array')
          needsUpdate = true
        }

        // Apply updates if needed
        if (needsUpdate && !DRY_RUN) {
          await clientWrite
            .patch(proposal._id)
            .set(updates)
            .commit()
          
          migratedCount++
          console.log(`✅ Migrated: ${proposal.title}`)
          result.changes.forEach(change => console.log(`   - ${change}`))
        } else if (needsUpdate && DRY_RUN) {
          migratedCount++
          console.log(`🔍 Would migrate: ${proposal.title}`)
          result.changes.forEach(change => console.log(`   - ${change}`))
        }

        if (result.changes.length > 0) {
          results.push(result)
        }

      } catch (error) {
        errorCount++
        result.error = error instanceof Error ? error.message : 'Unknown error'
        results.push(result)
        console.error(`❌ Error migrating ${proposal.title}: ${result.error}`)
      }
    }

    // Summary
    console.log('\n📊 Migration Summary:')
    console.log(`Total proposals checked: ${proposals.length}`)
    console.log(`Proposals ${DRY_RUN ? 'that would be' : ''} migrated: ${migratedCount}`)
    console.log(`Errors encountered: ${errorCount}`)

    if (DRY_RUN) {
      console.log('\n⚠️  This was a dry run. No changes were made.')
      console.log('Run without --dry-run flag to apply changes.')
    }

    // Detailed results if there were any changes or errors
    if (results.length > 0) {
      console.log('\n📋 Detailed Results:')
      results.forEach(result => {
        console.log(`\n${result.title} (${result.proposalId})`)
        if (result.changes.length > 0) {
          console.log('  Changes:')
          result.changes.forEach(change => console.log(`    - ${change}`))
        }
        if (result.error) {
          console.log(`  Error: ${result.error}`)
        }
      })
    }

    process.exit(errorCount > 0 ? 1 : 0)

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Verify this is being run from CLI
if (require.main === module) {
  migrateCoSpeakers()
} else {
  console.error('This script must be run from the command line')
  process.exit(1)
}