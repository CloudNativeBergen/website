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
  serverExternalPackages: [
    'jsdom',
    'isomorphic-dompurify',
    'dompurify',
    // Native module (platform-specific .node binary) used to rasterize the
    // conference SVG logo for contract PDFs. Bundling breaks its dynamic
    // binary resolution on Vercel serverless, so keep it external.
    '@resvg/resvg-js',
  ],
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
    ]
  },
}

export default config
