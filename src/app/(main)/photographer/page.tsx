import Image from 'next/image'
import { cacheLife, cacheTag } from 'next/cache'
import { getStaffMembers } from '@/lib/staff/sanity'
import { Container } from '@/components/Container'

async function CachedPhotographerContent({}) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:photographer')

  const photographers = await getStaffMembers('photographer')

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
        <Container className="relative print:max-w-none print:px-0">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Photographers
          </h1>
          {photographers.data.length === 0 && 'No photographers found'}
          {photographers.data.map((photographer) => {
            return (
              <div
                key={photographer.email ?? Math.floor(Math.random() * 10000)}
                className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8"
              >
                <h3 className="font-jetbrains text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                  {photographer.name}
                </h3>
                <div className="mt-7 columns-1 gap-6 md:columns-2">
                  <a href={photographer.link.toString()}>{photographer.name}</a>
                  <Image
                    src={
                      photographer.imageURL?.toString() ??
                      'https://placehold.co/800x600/e5e7eb/6b7280?text=Photographer'
                    }
                    alt={photographer.name}
                    width={800}
                    height={600}
                    className="rounded-md"
                    unoptimized
                  />
                </div>
              </div>
            )
          })}
        </Container>
      </div>
    </>
  )
}

export default async function Photographer() {
  return <CachedPhotographerContent />
}
