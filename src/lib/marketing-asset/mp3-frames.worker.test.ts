/**
 * @vitest-environment node
 *
 * The frame walk must always advance. A free-format frame declares a length
 * of 0; were the walk to add it as-is, it would stand still forever, and a
 * synchronous loop cannot be timed out on the thread it blocks. So this runs
 * the real counter in a worker (loaded through tsx) and gives it a deadline.
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { freeFormatMp3, mp3OfSeconds } from './__tests__/audio-fixtures'

function countInWorker(bytes: Buffer, deadlineMs: number) {
  const worker = new Worker(
    fileURLToPath(new URL('./__tests__/count-in-worker.ts', import.meta.url)),
    { workerData: bytes, execArgv: ['--import', 'tsx'] },
  )
  return new Promise<number | 'timed out'>((resolve, reject) => {
    const timer = setTimeout(() => {
      void worker.terminate()
      resolve('timed out')
    }, deadlineMs)
    worker.once('message', (seconds: number) => {
      clearTimeout(timer)
      void worker.terminate()
      resolve(seconds)
    })
    worker.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

it('walks past free-format frames inside a stream, and finishes', async () => {
  const bytes = Buffer.concat([mp3OfSeconds(1), freeFormatMp3(100)])
  const seconds = await countInWorker(bytes, 10_000)
  expect(seconds).not.toBe('timed out')
  expect(seconds).toBeGreaterThan(4.5)
}, 20_000)
