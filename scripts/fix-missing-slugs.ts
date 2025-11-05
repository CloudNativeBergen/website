import { clientWrite } from '@/lib/sanity/client'
import { generateSlug } from '@/lib/speaker/sanity'

async function fixMissingSlugs() {
  console.log('Fixing speakers without slugs...\n')

  const speakers = await clientWrite.fetch(
    `*[_type == "speaker" && !defined(slug.current)]{
      _id,
      name,
      email
    }`,
  )

  console.log(`Found ${speakers.length} speaker(s) without slugs\n`)

  if (speakers.length === 0) {
    console.log('✅ All speakers already have slugs!')
    return
  }

  for (const speaker of speakers) {
    const slug = generateSlug(speaker.name)
    console.log(`Setting slug for ${speaker.name} (${speaker._id}): ${slug}`)

    await clientWrite
      .patch(speaker._id)
      .set({
        slug: {
          _type: 'slug',
          current: slug,
        },
      })
      .commit()
  }

  console.log('\n✅ All speakers now have slugs!')
}

fixMissingSlugs().catch((error) => {
  console.error('Error fixing speaker slugs:', error)
  process.exit(1)
})
