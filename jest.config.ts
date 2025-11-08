import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^jose$': '<rootDir>/__tests__/mocks/jose.ts',
    '@noble/ed25519': '<rootDir>/__tests__/mocks/noble-ed25519.ts',
    'next-auth': '<rootDir>/__tests__/mocks/next-auth.ts',
    'next-sanity': '<rootDir>/__tests__/mocks/sanity-client.ts',
    '^uuid$': '<rootDir>/__tests__/mocks/uuid.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

export default createJestConfig(config)
