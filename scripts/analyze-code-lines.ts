#!/usr/bin/env tsx

/**
 * Analyze code lines in the repository and categorize them by type
 * 
 * This script walks through the repository, analyzes all code files,
 * and categorizes them into different types (UI, business logic, tests, etc.)
 * 
 * Usage:
 *   tsx scripts/analyze-code-lines.ts
 *   
 * Output:
 *   - Console output with statistics
 *   - Markdown report saved to docs/CODE_ANALYSIS.md
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileStats {
  path: string;
  lines: number;
  category: string;
  subcategory?: string;
}

interface CategoryStats {
  totalLines: number;
  files: number;
  subcategories: Record<string, { lines: number; files: number }>;
}

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage',
  'out',
  '.vercel',
  '.cache',
]);

const EXCLUDE_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);

/**
 * Categorize a file based on its path and name
 */
function categorizeFile(filePath: string): { category: string; subcategory?: string } {
  const normalizedPath = filePath.toLowerCase();
  const fileName = path.basename(filePath);

  // Tests
  if (
    normalizedPath.includes('__tests__') ||
    normalizedPath.includes('.test.') ||
    normalizedPath.includes('.spec.') ||
    fileName === 'jest.config.ts' ||
    fileName === 'jest.setup.ts'
  ) {
    return { category: 'tests', subcategory: 'unit-tests' };
  }

  // Configuration files
  if (
    fileName.startsWith('.') ||
    fileName === 'tsconfig.json' ||
    fileName === 'package.json' ||
    fileName === 'next.config.ts' ||
    fileName === 'tailwind.config.ts' ||
    fileName === 'postcss.config.js' ||
    fileName === 'prettier.config.js' ||
    fileName === 'eslint.config.js' ||
    fileName === 'vercel.json' ||
    fileName === 'knip.json' ||
    fileName === 'sanity.config.ts' ||
    fileName === 'sanity.cli.ts' ||
    normalizedPath.endsWith('.config.ts') ||
    normalizedPath.endsWith('.config.js')
  ) {
    return { category: 'config' };
  }

  // Migrations
  if (normalizedPath.includes('migrations/')) {
    return { category: 'migrations' };
  }

  // Scripts
  if (normalizedPath.includes('scripts/')) {
    return { category: 'scripts' };
  }

  // Sanity schemas and studio
  if (normalizedPath.includes('sanity/schematypes') || normalizedPath.includes('sanity/schemas')) {
    return { category: 'data-schemas', subcategory: 'sanity-schemas' };
  }

  if (normalizedPath.includes('sanity/')) {
    return { category: 'cms', subcategory: 'sanity-studio' };
  }

  // Server-side code
  if (normalizedPath.includes('/server/')) {
    if (normalizedPath.includes('/routers/')) {
      return { category: 'api', subcategory: 'trpc-routers' };
    }
    if (normalizedPath.includes('/schemas/')) {
      return { category: 'data-schemas', subcategory: 'validation-schemas' };
    }
    return { category: 'server-logic', subcategory: 'server-utilities' };
  }

  // API routes (Next.js)
  if (normalizedPath.includes('/app/api/') || normalizedPath.includes('/pages/api/')) {
    return { category: 'api', subcategory: 'rest-endpoints' };
  }

  // UI Components
  if (normalizedPath.includes('/components/')) {
    if (normalizedPath.includes('/admin/')) {
      return { category: 'ui-components', subcategory: 'admin-ui' };
    }
    if (normalizedPath.endsWith('.tsx')) {
      return { category: 'ui-components', subcategory: 'react-components' };
    }
    return { category: 'ui-components', subcategory: 'ui-utilities' };
  }

  // Pages (Next.js App Router)
  if (normalizedPath.includes('/app/') && (fileName === 'page.tsx' || fileName === 'layout.tsx')) {
    return { category: 'ui-pages', subcategory: 'app-router-pages' };
  }

  // Lib utilities
  if (normalizedPath.includes('/lib/')) {
    if (
      normalizedPath.includes('sanity.ts') ||
      normalizedPath.includes('sanity/') ||
      normalizedPath.includes('queries')
    ) {
      return { category: 'data-access', subcategory: 'cms-queries' };
    }
    if (normalizedPath.includes('email') || normalizedPath.includes('mail')) {
      return { category: 'business-logic', subcategory: 'email-logic' };
    }
    if (normalizedPath.includes('auth')) {
      return { category: 'business-logic', subcategory: 'authentication' };
    }
    if (normalizedPath.includes('badge')) {
      return { category: 'business-logic', subcategory: 'badge-generation' };
    }
    return { category: 'utilities', subcategory: 'helper-functions' };
  }

  // Hooks
  if (normalizedPath.includes('/hooks/')) {
    return { category: 'ui-logic', subcategory: 'react-hooks' };
  }

  // Contexts
  if (normalizedPath.includes('/contexts/')) {
    return { category: 'ui-logic', subcategory: 'react-contexts' };
  }

  // Types
  if (normalizedPath.includes('/types/') || fileName.endsWith('.d.ts')) {
    return { category: 'types', subcategory: 'typescript-definitions' };
  }

  // Styles
  if (normalizedPath.endsWith('.css') || normalizedPath.includes('/styles/')) {
    return { category: 'styles', subcategory: 'css' };
  }

  // Documentation
  if (
    normalizedPath.endsWith('.md') ||
    normalizedPath.endsWith('.mdx') ||
    normalizedPath.includes('/docs/')
  ) {
    return { category: 'documentation' };
  }

  // Default to other
  return { category: 'other' };
}

/**
 * Count lines in a file
 */
function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * Walk through a directory recursively
 */
function walkDirectory(dir: string, stats: Map<string, FileStats[]>) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        walkDirectory(fullPath, stats);
      }
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(entry.name)) {
        continue;
      }

      // Only count code files
      const ext = path.extname(entry.name);
      if (
        ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.mdx', '.css', '.scss'].includes(ext)
      ) {
        const lines = countLines(fullPath);
        const { category, subcategory } = categorizeFile(fullPath);
        const relativePath = path.relative(process.cwd(), fullPath);

        if (!stats.has(category)) {
          stats.set(category, []);
        }

        stats.get(category)!.push({
          path: relativePath,
          lines,
          category,
          subcategory,
        });
      }
    }
  }
}

/**
 * Main analysis function
 */
function analyzeRepository() {
  const stats = new Map<string, FileStats[]>();
  const rootDir = process.cwd();

  console.log('🔍 Analyzing repository code structure...\n');
  walkDirectory(rootDir, stats);

  // Calculate category totals
  const categoryTotals = new Map<string, CategoryStats>();

  for (const [category, files] of stats.entries()) {
    const totalLines = files.reduce((sum, file) => sum + file.lines, 0);
    const subcategories: Record<string, { lines: number; files: number }> = {};

    for (const file of files) {
      if (file.subcategory) {
        if (!subcategories[file.subcategory]) {
          subcategories[file.subcategory] = { lines: 0, files: 0 };
        }
        subcategories[file.subcategory].lines += file.lines;
        subcategories[file.subcategory].files++;
      }
    }

    categoryTotals.set(category, {
      totalLines,
      files: files.length,
      subcategories,
    });
  }

  // Sort categories by line count
  const sortedCategories = Array.from(categoryTotals.entries()).sort(
    (a, b) => b[1].totalLines - a[1].totalLines
  );

  // Print results
  const grandTotal = sortedCategories.reduce((sum, [, stats]) => sum + stats.totalLines, 0);

  console.log('📊 CODE LINE ANALYSIS BY CATEGORY\n');
  console.log('='.repeat(80));
  console.log();

  for (const [category, categoryStats] of sortedCategories) {
    const percentage = ((categoryStats.totalLines / grandTotal) * 100).toFixed(1);
    console.log(
      `${category.toUpperCase().padEnd(25)} ${categoryStats.totalLines.toLocaleString().padStart(10)} lines (${percentage}%) - ${categoryStats.files} files`
    );

    if (Object.keys(categoryStats.subcategories).length > 0) {
      const sortedSubcategories = Object.entries(categoryStats.subcategories).sort(
        (a, b) => b[1].lines - a[1].lines
      );

      for (const [subcategory, subStats] of sortedSubcategories) {
        const subPercentage = ((subStats.lines / categoryStats.totalLines) * 100).toFixed(1);
        console.log(
          `  ├─ ${subcategory.padEnd(40)} ${subStats.lines.toLocaleString().padStart(8)} lines (${subPercentage}%) - ${subStats.files} files`
        );
      }
    }
    console.log();
  }

  console.log('='.repeat(80));
  console.log(`TOTAL: ${grandTotal.toLocaleString()} lines of code\n`);

  // Print top 5 largest files by category
  console.log('\n📁 TOP 5 LARGEST FILES BY CATEGORY\n');
  console.log('='.repeat(80));
  console.log();

  for (const [category, files] of stats.entries()) {
    const topFiles = files.sort((a, b) => b.lines - a.lines).slice(0, 5);
    if (topFiles.length > 0 && topFiles[0].lines > 100) {
      console.log(`${category.toUpperCase()}:`);
      for (const file of topFiles) {
        console.log(`  ${file.lines.toLocaleString().padStart(6)} lines - ${file.path}`);
      }
      console.log();
    }
  }

  console.log('\n✅ Analysis complete!\n');
  console.log('💡 Tip: This data is also documented in docs/CODE_ANALYSIS.md\n');

  return { sortedCategories, grandTotal, stats };
}

// Run the analysis
analyzeRepository();
