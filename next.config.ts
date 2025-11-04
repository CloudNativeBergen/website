import { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false, // disabled due to https://github.com/vercel/next.js/issues/35822
  experimental: {
    // Add these experimental flags to resolve JSDOM conflicts with Turbopack
    optimizePackageImports: ['isomorphic-dompurify'],
    // Use Turbopack for production builds to fix Tailwind v4 CSS generation
    turbo: {},
  },
  serverExternalPackages: ['jsdom'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
      {
        protocol: 'https',
        hostname: 'media.licdn.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/agenda',
        destination: '/program',
        permanent: true,
      },
    ]
  },
}

export default config
