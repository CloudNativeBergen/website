#!/usr/bin/env tsx

/**
 * Clean up orphaned file assets in Sanity
 * USE WITH CAUTION: This will permanently delete files!
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
  references: number
}

async function cleanOrphanedFiles() {
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

  for (const file of orphanedFiles) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2)
    totalSize += file.size
    const createdDate = new Date(file._createdAt).toLocaleDateString()

    console.log(`📄 ${file.originalFilename} (${sizeMB} MB, ${createdDate})`)
    console.log(`   ID: ${file._id}`)

    if (shouldDelete) {
      try {
        await client.delete(file._id)
        console.log('   ✅ Deleted')
        deletedCount++
      } catch (error) {
        console.log('   ❌ Failed to delete:', error)
        failedCount++
      }
    } else {
      console.log('   🔸 Would delete (dry run)')
    }
    console.log('')
  }

  const totalMB = (totalSize / 1024 / 1024).toFixed(2)

  console.log('\n📊 Summary:')
  console.log(`   Total files: ${orphanedFiles.length}`)
  console.log(`   Total size: ${totalMB} MB`)

  if (shouldDelete) {
    console.log(`   Deleted: ${deletedCount}`)
    if (failedCount > 0) {
      console.log(`   Failed: ${failedCount}`)
    }
  } else {
    console.log('\n💡 To actually delete these files, run:')
    console.log('   npm run clean-orphaned-files -- --delete')
  }
}

cleanOrphanedFiles().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
