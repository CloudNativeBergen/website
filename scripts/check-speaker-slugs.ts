import { clientReadUncached } from '@/lib/sanity/client'

async function checkSpeakerSlugs() {
  console.log('Checking for speakers without slugs...\n')

  const speakers = await clientReadUncached.fetch(
    `*[_type == "speaker" && !defined(slug.current)]{
      _id,
      name,
      email
    }`,
  )

  console.log(`Found ${speakers.length} speaker(s) without slugs\n`)

  if (speakers.length > 0) {
    console.log('Speakers missing slugs:')
    console.log(JSON.stringify(speakers, null, 2))
    process.exit(1)
  } else {
    console.log('✅ All speakers have slugs!')
    process.exit(0)
  }
}

checkSpeakerSlugs().catch((error) => {
  console.error('Error checking speaker slugs:', error)
  process.exit(1)
})
