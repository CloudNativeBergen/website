import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { clientWrite } from '../src/lib/sanity/client'
import { ScheduleStatus } from '../src/lib/schedule/types'

async function migrate() {
  console.log('Migrating schedules...')
  const schedules = await clientWrite.fetch(`*[_type == "schedule" && !defined(status)]`)
  
  if (schedules.length === 0) {
    console.log('No schedules to migrate.')
    return
  }

  const tx = clientWrite.transaction()
  for (const s of schedules) {
    console.log(`Migrating schedule ${s._id}...`)
    tx.patch(s._id, (p) => p.set({
      status: ScheduleStatus.Official,
      version: 1
    }))
  }

  await tx.commit()
  console.log(`Successfully migrated ${schedules.length} schedules.`)
}

migrate().catch(console.error)
