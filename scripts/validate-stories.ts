#!/usr/bin/env tsx
/**
 * Validate that all Storybook story files can be imported without errors
 */

import { glob } from 'glob'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

async function validateStories() {
  console.log('🔍 Finding all story files...\n')

  const storyFiles = await glob('src/**/*.stories.{ts,tsx}', {
    cwd: process.cwd(),
    absolute: true,
  })

  console.log(`Found ${storyFiles.length} story files\n`)

  const errors: Array<{ file: string; error: Error }> = []
  const warnings: Array<{ file: string; message: string }> = []

  for (const file of storyFiles) {
    const relativePath = path.relative(process.cwd(), file)
    process.stdout.write(`Testing ${relativePath}... `)

    try {
      // Import the story file
      const fileUrl = pathToFileURL(file).href
      const storyModule = await import(fileUrl)

      // Check if it has a default export (meta)
      if (!storyModule.default) {
        warnings.push({
          file: relativePath,
          message: 'Missing default export (story meta)',
        })
        console.log('⚠️  WARNING: Missing meta')
        continue
      }

      // Check if meta has required properties
      const meta = storyModule.default
      if (!meta.title) {
        warnings.push({
          file: relativePath,
          message: 'Meta missing title property',
        })
        console.log('⚠️  WARNING: Missing title')
        continue
      }

      // Count stories (exports that aren't default or Meta)
      const storyExports = Object.keys(storyModule).filter(
        (key) => key !== 'default' && key !== '__esModule',
      )

      if (storyExports.length === 0) {
        warnings.push({
          file: relativePath,
          message: 'No stories exported',
        })
        console.log(`⚠️  WARNING: No stories`)
        continue
      }

      console.log(`✅ ${storyExports.length} stories`)
    } catch (error) {
      errors.push({
        file: relativePath,
        error: error as Error,
      })
      console.log('❌ ERROR')
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60) + '\n')

  console.log(`Total files: ${storyFiles.length}`)
  console.log(
    `✅ Passed: ${storyFiles.length - errors.length - warnings.length}`,
  )
  console.log(`⚠️  Warnings: ${warnings.length}`)
  console.log(`❌ Errors: ${errors.length}`)

  if (warnings.length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('WARNINGS')
    console.log('='.repeat(60) + '\n')

    for (const { file, message } of warnings) {
      console.log(`⚠️  ${file}`)
      console.log(`   ${message}\n`)
    }
  }

  if (errors.length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('ERRORS')
    console.log('='.repeat(60) + '\n')

    for (const { file, error } of errors) {
      console.log(`❌ ${file}`)
      console.log(`   ${error.message}`)
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(1, 4)
        stackLines.forEach((line) => console.log(`   ${line.trim()}`))
      }
      console.log()
    }

    process.exit(1)
  }

  console.log('\n✨ All stories validated successfully!\n')
}

validateStories().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
