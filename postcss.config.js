module.exports = {
  plugins: {
    '@tailwindcss/postcss': {
      // Force cache invalidation on Vercel builds
      base: null,
    },
    autoprefixer: {},
  },
}
