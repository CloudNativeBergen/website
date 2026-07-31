import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { createClient } from 'next-sanity'

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2023-05-03',
  useCdn: false,
})

async function fetchSchedules() {
  const query = `*[_type == "schedule"] {
    _id, title, status, version, date, "tracks": tracks[].trackTitle
  }`;
  const data = await client.fetch(query);
  console.log(JSON.stringify(data, null, 2));
}

fetchSchedules().catch(console.error);
