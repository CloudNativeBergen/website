import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

import { clientReadUncached } from '../src/lib/sanity/client'

async function fetchProposals() {
  const query = `*[_type == "talk" && conference._ref == "eb7b16c6-00fa-44a0-adcd-4a480de34242"] {
    _id, title, status, format, level, "speakers": speakers[]->name, _createdAt
  } | order(_createdAt asc)`;
  const data = await clientReadUncached.fetch(query);
  console.log(JSON.stringify(data, null, 2));
}

fetchProposals().catch(console.error);
