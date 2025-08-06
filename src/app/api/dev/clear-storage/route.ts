import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const filePath = join(
      process.cwd(),
      'src',
      'dev-tools',
      'clear-storage.html',
    )
    const content = await readFile(filePath, { encoding: 'utf8' })

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error serving clear-storage.html:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
