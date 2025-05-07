import Image from 'next/image'
import { Container } from '@/components/Container'
import { iconForLink } from '@/components/SocialIcons'

import { Speaker } from '@/lib/speaker/types'

interface FeaturedSpeakersProps {
  speakers: Speaker[]
  isOrganizers?: boolean
}

export function FeaturedSpeakers({
  speakers,
  isOrganizers,
}: FeaturedSpeakersProps) {
  return (
    <section
      id="speakers"
      aria-labelledby="speakers-title"
      className="py-20 sm:py-32"
    >
      <Container>
        <div className="bg-white py-32">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2
              id="speakers-title"
              className="font-display text-4xl font-medium tracking-tighter text-blue-600 sm:text-5xl"
            >
              {isOrganizers ? 'Conference Controllers' : 'Masters of the Kube'}
            </h2>
            <p className="mt-4 font-display text-2xl tracking-tight text-blue-900">
              {isOrganizers
                ? 'Meet the control plane ensuring a smooth conference deployment.'
                : 'Brace yourselves for wisdom deployed directly from the masters of the Cloud Native ecosystem.'}
            </p>
          </div>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <ul
              role="list"
              className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 text-center sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3"
            >
              {speakers.map((person) => (
                <li key={person.name}>
                  <a href={isOrganizers ? '#' : `/speaker/${person.slug}`}>
                    <Image
                      className="mx-auto h-56 w-56 rounded-full object-contain"
                      src={person.image || '/images/default-avatar.png'}
                      alt={person.name}
                      width={224}
                      height={224}
                    />
                    <h3 className="mt-6 text-2xl leading-7 font-semibold tracking-tight text-gray-900">
                      {person.name}
                    </h3>
                  </a>
                  <p className="text-l leading-6 text-gray-600">
                    {person.title}
                  </p>
                  <ul role="list" className="mt-6 flex justify-center gap-x-6">
                    {person.links?.map((link, index) => (
                      <li key={`${person.name}-${index}`}>
                        <a
                          href={link}
                          className="text-gray-400 hover:text-gray-500"
                        >
                          {iconForLink(link)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  )
}
