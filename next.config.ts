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
  // `@resvg/resvg-js` ships a native (N-API) binary. Bundling it breaks binary
  // resolution on Vercel serverless, so it must stay external and be required
  // at runtime. (The held PR #432 adds this exact same entry; keeping it
  // identical here lets the two reconcile without conflict.)
  serverExternalPackages: [
    'jsdom',
    'isomorphic-dompurify',
    'dompurify',
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
  async headers() {
    return [
      {
        // The service worker lives at a stable URL and must never be cached by
        // the browser HTTP cache — otherwise a deploy's new `/sw.js` bytes are
        // not seen and the update flow never fires. Registration also uses
        // `updateViaCache: 'none'` for the same reason.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
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
