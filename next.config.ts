import { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false, // disabled due to https://github.com/vercel/next.js/issues/35822
  experimental: {
    // Add these experimental flags to resolve JSDOM conflicts with Turbopack
    optimizePackageImports: ['isomorphic-dompurify'],
    // Use Turbopack for production builds to match dev behavior
    turbo: {},
  },
  serverExternalPackages: ['jsdom'],
  // Disable CSS optimization to prevent Webpack from interfering with Tailwind v4
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ensure CSS is processed correctly by disabling CSS minimization
      config.optimization = {
        ...config.optimization,
        minimize: true, // Keep JS minimization
      }
    }
    return config
  },
  // Force build ID regeneration to prevent stale CSS caching on Vercel
  generateBuildId: async () => {
    // Use timestamp to ensure fresh builds with new CSS
    return `build-${Date.now()}`
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
