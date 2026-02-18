import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      {
        find: 'jose',
        replacement: path.resolve(__dirname, '__tests__/mocks/jose.ts'),
      },
      {
        find: '@noble/ed25519',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/noble-ed25519.ts',
        ),
      },
      {
        find: /^next-auth$/,
        replacement: path.resolve(__dirname, '__tests__/mocks/next-auth.ts'),
      },
      {
        find: /^next-sanity$/,
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/sanity-client.ts',
        ),
      },
      {
        find: '@sanity/image-url',
        replacement: path.resolve(
          __dirname,
          '__tests__/mocks/sanity-image-url.ts',
        ),
      },
      {
        find: /^uuid$/,
        replacement: path.resolve(__dirname, '__tests__/mocks/uuid.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    exclude: ['node_modules', '.next', 'storybook-static'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
    },
  },
})
