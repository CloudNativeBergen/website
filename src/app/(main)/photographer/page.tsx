import Image from 'next/image'
import { cacheLife, cacheTag } from 'next/cache'
import { getStaffMembers } from '@/lib/staff/sanity'

async function CachedPhotographerContent({ }) {
    'use cache'
    cacheLife('hours')
    cacheTag('content:photographer')

    const photographers = await getStaffMembers("photographer")

    return (
        <>
            <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
                <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
                    Photographers
                </h1>
                {photographers.staff.map(photographer => {
                    return <div key={photographer.name} className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
                        <h3 className="font-jetbrains text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                            {photographer.name}
                        </h3>
                        <div className="columns-1 md:columns-2 gap-6 mt-7">
                            <a href={photographer.link.toString()}>{photographer.name}</a>
                            <Image
                                src={photographer.imageURL?.toString() ?? "https://placehold.co/800x600/e5e7eb/6b7280?text=Photographer"}
                                alt={photographer.name}
                                width={800}
                                height={600}
                                className='rounded-md'
                                unoptimized
                            />
                        </div>
                    </div>
                })}
            </div>
        </>
    )
}

export default async function Photographer() {
    return <CachedPhotographerContent />
}
