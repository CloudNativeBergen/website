// Runs the frame counter off the test's thread, so a walk that stops
// advancing can be timed out: see `mp3-frames.worker.test.ts`.
import { parentPort, workerData } from 'node:worker_threads'
import { countMp3Seconds } from '../mp3-frames'

parentPort?.postMessage(countMp3Seconds(new Uint8Array(workerData)))
