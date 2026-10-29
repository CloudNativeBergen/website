/**
 * Next's proxy `adapter()` reads `globalThis.AsyncLocalStorage`, which the Edge
 * and Node proxy runtimes provide and plain Node does not. Import this FIRST,
 * before anything that loads `next/server`: Next captures it at module load.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

Object.assign(globalThis, { AsyncLocalStorage })
