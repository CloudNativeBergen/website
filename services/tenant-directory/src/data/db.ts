// The raw D1 handle. Only files under src/data/ may import this, and
// none may re-export it (eslint, services boundary).
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export const rawDb = (d1: D1Database) => drizzle(d1, { schema })
