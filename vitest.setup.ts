import '@testing-library/jest-dom/vitest'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '.env.local', '.env.test'] })

process.env.INVITATION_TOKEN_SECRET ??= 'test-invitation-token-secret'
