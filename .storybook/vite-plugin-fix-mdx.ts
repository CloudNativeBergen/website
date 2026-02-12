/**
 * Vite plugin to fix Storybook v10 MDX compiler generating file:// URLs
 *
 * **Problem**: In Storybook 10.2.8, the MDX compiler generates file:// URLs
 * instead of module specifiers, causing Vite to fail with
 * "Failed to resolve import" errors.
 *
 * **Solution**: This plugin intercepts MDX files before Vite's import analysis
 * and transforms file:// URLs back to proper module specifiers.
 *
 * @see https://github.com/storybookjs/storybook/issues/33537
 */
export function fixStorybookMdxImports() {
  return {
    name: 'fix-storybook-mdx-imports',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      // Only process MDX files
      if (!id.endsWith('.mdx')) {
        return null
      }

      let fixed = code
      let hasChanges = false

      // Transform file:// URLs to module specifiers for @storybook/blocks
      const blocksPattern =
        /from\s+["']file:\/\/\/[^"']*node_modules\/@storybook\/blocks\/[^"']*["']/g
      if (blocksPattern.test(fixed)) {
        fixed = fixed.replace(blocksPattern, 'from "@storybook/blocks"')
        hasChanges = true
      }

      // Transform @storybook/addon-docs/mdx-react-shim
      const mdxReactShimPattern =
        /from\s+["']file:\/\/\/[^"']*node_modules\/@storybook\/addon-docs\/dist\/mdx-react-shim\.js["']/g
      if (mdxReactShimPattern.test(code)) {
        fixed = fixed.replace(
          mdxReactShimPattern,
          'from "@storybook/addon-docs/mdx-react-shim"',
        )
        hasChanges = true
      }

      // Transform any other @storybook/ imports with file:// URLs
      const storybookPattern =
        /from\s+["']file:\/\/\/[^"']*node_modules\/(@storybook\/[^"'\/]+)\/[^"']*["']/g
      if (storybookPattern.test(code)) {
        fixed = fixed.replace(storybookPattern, 'from "$1"')
        hasChanges = true
      }

      // Only return if we actually made changes
      if (hasChanges) {
        return {
          code: fixed,
          map: null,
        }
      }

      return null
    },
  }
}
