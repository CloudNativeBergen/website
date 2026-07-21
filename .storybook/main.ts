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
    // CloudNativePattern imports static CNCF SVGs that Vite cannot resolve.
    // Replace with a lightweight stub so stories using BackgroundImage can build.
    config.plugins = config.plugins || []
    // The admin dashboard widgets import their fetchers from the
    // `@/app/(admin)/admin/actions` server-action module ('use server'),
    // which cannot load in the browser bundle. Re-resolve that module id to a
    // browser-safe mock with a per-story registry (same technique as the
    // CloudNativePattern stub below). Stories import the registry helpers
    // from the mock file directly — Vite resolves both to the same module.
    config.plugins.push({
      name: 'mock-admin-actions',
      enforce: 'pre',
      resolveId(id) {
        if (id === '@/app/(admin)/admin/actions') {
          return join(
            __dirname,
            '../src/components/admin/dashboard/widgets/__matrix__/mock-admin-actions.ts',
          )
        }
      },
    })
    config.plugins.push({
      name: 'mock-cloud-native-pattern',
      enforce: 'pre',
      resolveId(id) {
        if (
          id === './CloudNativePattern' ||
          id.endsWith('/CloudNativePattern')
        ) {
          return '\0mock:CloudNativePattern'
        }
      },
      load(id) {
        if (id === '\0mock:CloudNativePattern') {
          return `
            export function CloudNativePattern({ className }) {
              return null;
            }
          `
        }
      },
    })
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
