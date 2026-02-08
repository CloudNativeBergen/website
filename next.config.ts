import { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false, // disabled due to https://github.com/vercel/next.js/issues/35822
  cacheComponents: true,
  turbopack: {
    // Use Turbopack for production builds to fix Tailwind v4 CSS generation
    resolveAlias: {
      // Ignore optional native dependency that's not available in serverless environments
      // Turbopack doesn't support false, so we alias to an empty module
      'rdf-canonize-native': './src/lib/empty-module.ts',
    },
  },
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify', 'dompurify'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ignore optional native dependency that's not available in serverless environments
      config.resolve.alias['rdf-canonize-native'] = false
    }
    return config
  },
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
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
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
      // Redirect old CFP routes to new speaker routes
      {
        source: '/cfp/profile',
        destination: '/speaker/profile',
        permanent: false,
      },
      {
        source: '/cfp/list',
        destination: '/speaker/list',
        permanent: false,
      },
      {
        source: '/cfp/proposal/:path*',
        destination: '/speaker/proposal/:path*',
        permanent: false,
      },
      {
        source: '/cfp/submit',
        destination: '/speaker/submit',
        permanent: false,
      },
      {
        source: '/cfp/expense',
        destination: '/speaker/expense',
        permanent: false,
      },
      {
        source: '/cfp/workshop/:id',
        destination: '/speaker/workshop/:id',
        permanent: false,
      },
      {
        source: '/cfp/admin',
        destination: '/speaker/admin',
        permanent: false,
      },
    ]
  },
}

export default config
