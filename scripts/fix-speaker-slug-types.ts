import { clientWrite } from '@/lib/sanity/client'

async function fixSpeakerSlugTypes() {
  console.log(
    'Fixing speakers with invalid slug property type (string instead of slug object)...\n',
  )

  // Find speakers where slug is a string
  // GROQ query to find documents where slug is of type 'string'
  const speakers = await clientWrite.fetch(
    `*[_type == "speaker" && defined(slug) && pt::type(slug) == "string"]{
      _id,
      name,
      slug
    }`,
  )

  console.log(`Found ${speakers.length} speaker(s) with string slugs\n`)

  if (speakers.length === 0) {
    console.log('✅ All speakers have correct slug property types!')
    return
  }

  for (const speaker of speakers) {
    console.log(
      `Fixing slug for ${speaker.name} (${speaker._id}): converting "${speaker.slug}" to slug object`,
    )

    await clientWrite
      .patch(speaker._id)
      .set({
        slug: {
          _type: 'slug',
          current: speaker.slug,
        },
      })
      .commit()
  }

  console.log('\n✅ All speaker slugs have been fixed!')
}

fixSpeakerSlugTypes().catch((error) => {
  console.error('Error fixing speaker slug types:', error)
  process.exit(1)
})
