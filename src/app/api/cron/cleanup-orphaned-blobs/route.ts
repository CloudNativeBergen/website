import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { cleanupOrphanedBlob } from '@/lib/attachment/blob'
import { unstable_noStore as noStore } from 'next/cache'
import { MARKETING_ASSET_BLOB_PREFIX } from '@/lib/marketing-asset/blob-url'

/**
 * The temporary upload prefixes this sweeper owns: proposal attachments and
 * marketing assets (docs/MARKETING_ASSETS_SPEC.md §4.1). Both are moved into
 * Sanity and deleted; anything left past the retention window was abandoned.
 */
const TEMPORARY_PREFIXES = ['proposal-', MARKETING_ASSET_BLOB_PREFIX]

/**
 * Blob retention period in hours before cleanup.
 * 24 hours provides a safety window for:
 * - Debugging upload issues
 * - Manual recovery if needed
 * - Handling temporary network failures during transfer
 */
const BLOB_RETENTION_HOURS = 24

/** Every blob under `prefix`, following `list()`'s pages (1000 per page). */
async function listAll(prefix: string) {
  const all: Awaited<ReturnType<typeof list>>['blobs'] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix, mode: 'expanded', cursor })
    all.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return all
}

export async function GET(request: NextRequest) {
  noStore()
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Invalid or missing authorization token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const retentionThreshold = new Date(
      Date.now() - BLOB_RETENTION_HOURS * 60 * 60 * 1000,
    )

    const blobs = (await Promise.all(TEMPORARY_PREFIXES.map(listAll))).flat()

    const orphanedBlobs = blobs.filter((blob) => {
      return blob.uploadedAt < retentionThreshold
    })

    console.log(
      `Found ${blobs.length} temporary upload blobs, ${orphanedBlobs.length} are older than ${BLOB_RETENTION_HOURS}h`,
    )

    if (orphanedBlobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orphaned blobs found',
        cleaned: 0,
      })
    }

    const results = await Promise.allSettled(
      orphanedBlobs.map((blob) => cleanupOrphanedBlob(blob.url)),
    )

    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length
    const failureCount = results.length - successCount

    if (failureCount > 0) {
      console.error(
        `Failed to cleanup ${failureCount} of ${orphanedBlobs.length} orphaned blobs`,
      )
    } else {
      console.log(`Successfully cleaned up ${successCount} orphaned blobs`)
    }

    return NextResponse.json({
      success: true,
      cleaned: successCount,
      failed: failureCount,
      total: orphanedBlobs.length,
    })
  } catch (error) {
    console.error('Error in cleanup orphaned blobs cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
