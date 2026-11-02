import { writeFileSync } from 'node:fs'
import { compose } from '../src/supergraph'

writeFileSync(new URL('../supergraph.graphql', import.meta.url), compose())
