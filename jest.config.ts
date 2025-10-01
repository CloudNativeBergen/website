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
    'next-auth': '<rootDir>/__tests__/mocks/next-auth.ts',
    'next-sanity': '<rootDir>/__tests__/mocks/sanity-client.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

export default createJestConfig(config)
