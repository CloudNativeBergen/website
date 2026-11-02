// Typecheck fixture (run by `pnpm typecheck`): a resolver's context exposes the
// envelope and the Scoped repositories, never the Worker env or the D1
// binding. If SubgraphContext ever grows `env` or `DB`, the @ts-expect-error
// lines stop erroring and tsc fails on them.
import type { SubgraphContext } from './index'

type Data = { talks: { list(): Promise<string[]> } }

export function resolver(ctx: SubgraphContext<Data>) {
  // @ts-expect-error the Worker env is not in the resolver context
  void ctx.env
  // @ts-expect-error nor is the raw D1 binding
  void ctx.DB
  return ctx.data.talks.list()
}
