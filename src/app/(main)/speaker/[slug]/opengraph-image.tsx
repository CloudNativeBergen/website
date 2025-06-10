import React from 'react'
import { ImageResponse } from '@vercel/og'
import { getPublicSpeaker } from '@/lib/speaker/sanity'

export const runtime = 'edge'

export const alt = 'Cloud Native Day Bergen 2024 Speaker Profile'
export const size = {
  width: 1290,
  height: 676,
}
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { speaker, talks, err } = await getPublicSpeaker(slug)

  if (err || !speaker || !talks || talks.length === 0) {
    return new ImageResponse(<div>Speaker not found</div>, size)
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          width: '100%',
          backgroundImage: `url(${process.env.NEXT_PUBLIC_URL}/og/base.svg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: '#000',
          fontSize: 48,
          fontWeight: 'bold',
          textAlign: 'center',
          flex: 1,
          overflowWrap: 'break-word',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginRight: 0,
            alignItems: 'center',
          }}
        >
          <div>{speaker.name}</div>
          <div style={{ fontSize: 35, maxWidth: '70%' }}>{speaker.title}</div>
        </div>
        <div style={{ display: 'flex' }}>
          <img
            src={speaker.image}
            alt={alt}
            height={400}
            style={{ marginRight: 40, marginBottom: 50, borderRadius: '50%' }}
          />
        </div>
      </div>
    ),
    size,
  )
}
