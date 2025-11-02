#!/usr/bin/env tsx

/**
 * Manage orphaned file assets in Sanity
 *
 * Find and optionally delete orphaned file assets that are not referenced by any documents.
 *
 * Usage:
 *   npm run manage-orphaned-files          # List orphaned files (dry run)
 *   npm run manage-orphaned-files --delete # Delete orphaned files
 */

// Load environment variables FIRST before any other imports
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

// Now we can import Sanity client
import { createClient } from 'next-sanity'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2023-05-03'

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_TOKEN_WRITE,
})

interface FileAsset {
  _id: string
  _createdAt: string
  originalFilename: string
  size: number
  url: string
  references: number
}

async function manageOrphanedFiles() {
  // Check for token
  if (
    !process.env.SANITY_API_TOKEN_WRITE ||
    process.env.SANITY_API_TOKEN_WRITE === 'invalid'
  ) {
    console.error(
      '❌ Error: Missing SANITY_API_TOKEN_WRITE environment variable',
    )
    console.error('\nTo fix this:')
    console.error('1. Go to https://sanity.io/manage')
    console.error('2. Select your project')
    console.error('3. Go to API > Tokens')
    console.error(
      '4. Create a token with "Editor" or "Administrator" permissions',
    )
    console.error(
      '5. Add to .env.local: SANITY_API_TOKEN_WRITE=your_token_here',
    )
    process.exit(1)
  }

  const shouldDelete = process.argv.includes('--delete')

  if (!shouldDelete) {
    console.log('⚠️  DRY RUN MODE')
    console.log('   Run with --delete flag to actually delete files\n')
  }

  console.log('🔍 Searching for orphaned file assets...\n')

  const query = `
    *[_type == "sanity.fileAsset"] {
      _id,
      _createdAt,
      originalFilename,
      size,
      url,
      "references": count(*[references(^._id)])
    }[references == 0] | order(_createdAt desc)
  `

  const orphanedFiles = await client.fetch<FileAsset[]>(query)

  if (orphanedFiles.length === 0) {
    console.log('✅ No orphaned files found!')
    return
  }

  console.log(`Found ${orphanedFiles.length} orphaned file(s):\n`)

  let totalSize = 0
  let deletedCount = 0
  let failedCount = 0

  for (const [index, file] of orphanedFiles.entries()) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2)
    totalSize += file.size
    const createdDate = new Date(file._createdAt).toLocaleDateString()

    if (shouldDelete) {
      console.log(`📄 ${file.originalFilename} (${sizeMB} MB, ${createdDate})`)
      console.log(`   ID: ${file._id}`)

      try {
        await client.delete(file._id)
        console.log('   ✅ Deleted')
        deletedCount++
      } catch (error) {
        console.log('   ❌ Failed to delete:', error)
        failedCount++
      }
      console.log('')
    } else {
      console.log(`${index + 1}. ${file.originalFilename}`)
      console.log(`   ID: ${file._id}`)
      console.log(`   Size: ${sizeMB} MB`)
      console.log(`   Created: ${createdDate}`)
      console.log(`   URL: ${file.url}`)
      console.log('')
    }
  }

  const totalMB = (totalSize / 1024 / 1024).toFixed(2)

  console.log('📊 Summary:')
  console.log(`   Total files: ${orphanedFiles.length}`)
  console.log(`   Total size: ${totalMB} MB`)

  if (shouldDelete) {
    console.log(`   Deleted: ${deletedCount}`)
    if (failedCount > 0) {
      console.log(`   Failed: ${failedCount}`)
    }
    console.log(`\n✅ Cleanup complete! Freed ${totalMB} MB of storage.`)
  } else {
    console.log(`\n💡 To delete these files, run:`)
    console.log('   npm run manage-orphaned-files -- --delete')
  }
}

manageOrphanedFiles().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
