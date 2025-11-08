import { jest } from '@jest/globals'

import dotenv from 'dotenv'
import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder as typeof global.TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder

dotenv.config({ path: ['.env', '.env.local', '.env.test'] })
