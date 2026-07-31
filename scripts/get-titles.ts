import { config } from 'dotenv'
config({ path: '.env.local' })
import { clientReadUncached } from '../src/lib/sanity/client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs'

async function run() {
  const schedule = JSON.parse(fs.readFileSync('/tmp/draft-schedule.json', 'utf-8'))
  const refs = schedule.tracks[0].talks.map((t: any) => t.talk._ref)
  const talks = await clientReadUncached.fetch(`*[_id in $refs]{ _id, title, format }`, { refs })
  
  const map = new Map(talks.map((t: any) => [t._id, t.title]))
  
  console.log('Suggested Talks in Order:')
  schedule.tracks[0].talks.forEach((t: any, i: number) => {
    console.log(`${i + 1}. ${map.get(t.talk._ref)}`)
  })
}
run()
