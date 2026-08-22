import type { StorybookConfig } from '@storybook/nextjs-vite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {
      nextConfigPath: join(__dirname, '../next.config.ts'),
    },
  },
  staticDirs: ['../public'],
  viteFinal: async (config) => {
    config.plugins = config.plugins || []
    // The admin dashboard widgets import their fetchers from the
    // `@/app/(admin)/admin/actions` server-action module ('use server'),
    // which cannot load in the browser bundle. Re-resolve that module id to a
    // browser-safe mock with a per-story registry. Stories import the registry
    // helpers from the mock file directly — Vite resolves both to the same
    // module.
    // `@/lib/dashboard/fetchers` is where the widgets' `fetchX()` helpers live
    // now — a client module that batches every widget of a paint into ONE
    // `fetchDashboardData` server action. It re-exports the same names, so both
    // ids resolve to the same browser-safe mock and the per-story registry
    // (`setMockActionFor(conferenceId, 'fetchCFPHealth', …)`) is unchanged.
    config.plugins.push({
      name: 'mock-admin-actions',
      enforce: 'pre',
      resolveId(id) {
        if (
          id === '@/app/(admin)/admin/actions' ||
          id === '@/lib/dashboard/fetchers'
        ) {
          return join(
            __dirname,
            '../src/components/admin/dashboard/widgets/__matrix__/mock-admin-actions.ts',
          )
        }
      },
    })
    // The real dashboard fetchers take no arguments (the server resolves the
    // conference from the request domain), so the mock registry keys on the
    // conference _id each widget passes in its useWidgetData DEPS. This
    // wrapper hook lifts that id into the mock's dispatch scope; it matches
    // only the `@/`-prefixed id, and the wrapper imports the real hook via a
    // relative path, so there is no resolution cycle.
    config.plugins.push({
      name: 'mock-use-widget-data',
      enforce: 'pre',
      resolveId(id) {
        if (id === '@/hooks/dashboard/useWidgetData') {
          return join(
            __dirname,
            '../src/components/admin/dashboard/widgets/__matrix__/mock-use-widget-data.ts',
          )
        }
      },
    })
    // CFPProfilePage imports `startProviderLink` from a `'use server'` module
    // (`@/app/(cfp)/cfp/profile/link-actions`) that pulls in `next/headers` and
    // the server-only auth stack — none of which can load in the browser
    // bundle. Stub it to a browser-safe no-op action so the profile page can be
    // storied (the same id-aliasing technique as the mocks above).
    config.plugins.push({
      name: 'mock-cfp-link-actions',
      enforce: 'pre',
      resolveId(id) {
        if (id === '@/app/(cfp)/cfp/profile/link-actions') {
          // A REAL typed file (not a virtual module) so the stub's export
          // surface is compile-time-pinned to the actual server module via
          // its `satisfies typeof import(...)` guard — drift breaks typecheck.
          return join(__dirname, 'mocks/cfp-link-actions.ts')
        }
      },
    })
    // NOTE: `CloudNativePattern` used to be stubbed out here ("imports static
    // CNCF SVGs that Vite cannot resolve"). It resolves fine now, and the stub
    // rendered `null` — so every background-pattern story silently showed an
    // empty gradient. The Appearance page's pattern tiles ARE the setting's
    // display, so a story that cannot render them is worse than no story.
    return config
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen',
  },
  build: {
    test: {
      disabledAddons: ['@storybook/addon-docs'],
    },
  },
  core: {
    disableTelemetry: true,
  },
  docs: {},
  features: {
    sidebarOnboardingChecklist: false,
  },
}

export default config
