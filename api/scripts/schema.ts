// Writes api/public-schema.graphql: the client-facing SDL of the public
// contract (no @tag(internal), no join directives). Checked in so schema
// changes show up in PR diffs; CI fails when it is stale.
import { writeFileSync } from 'node:fs'
import { clientSdl } from '../src/supergraph'

writeFileSync(new URL('../public-schema.graphql', import.meta.url), clientSdl())
