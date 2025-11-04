import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CSS Build Cache Test',
  description: 'Testing Tailwind CSS v4 build cache invalidation on Vercel',
}

export default function CssTestPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 via-pink-50 to-rose-50 py-16 dark:from-purple-950 dark:via-pink-950 dark:to-rose-950">
      <div className="container mx-auto px-4">
        {/* Header Section */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-5xl font-bold text-purple-900 dark:text-purple-100">
            CSS Build Cache Test
          </h1>
          <p className="text-xl text-purple-700 dark:text-purple-300">
            Testing Tailwind CSS v4 cache invalidation on Vercel
          </p>
        </div>

        {/* Test Cards Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Unique Purple Gradient with NEW ring animation */}
          <div className="group rounded-3xl border-4 border-purple-300 bg-linear-to-br from-purple-100 to-purple-200 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:ring-8 hover:shadow-purple-500/50 hover:ring-purple-400/30 dark:border-purple-700 dark:from-purple-900 dark:to-purple-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500 text-3xl shadow-lg transition-transform group-hover:rotate-12">
              🎨
            </div>
            <h2 className="mb-3 text-2xl font-bold text-purple-900 dark:text-purple-100">
              Purple Test
            </h2>
            <p className="text-purple-800 dark:text-purple-200">
              This card uses unique purple gradient classes that don&apos;t
              exist elsewhere in the codebase.
            </p>
          </div>

          {/* Card 2: Unique Pink Gradient with NEW skew effect */}
          <div className="group rounded-3xl border-4 border-pink-300 bg-linear-to-tr from-pink-100 to-pink-200 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:skew-y-2 hover:ring-4 hover:shadow-pink-500/50 hover:ring-pink-300 dark:border-pink-700 dark:from-pink-900 dark:to-pink-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-500 text-3xl shadow-lg transition-all group-hover:scale-125">
              💖
            </div>
            <h2 className="mb-3 text-2xl font-bold text-pink-900 dark:text-pink-100">
              Pink Test
            </h2>
            <p className="text-pink-800 dark:text-pink-200">
              Testing pink gradient backgrounds with hover scale effects and
              custom shadows.
            </p>
          </div>

          {/* Card 3: Unique Rose Gradient with NEW border animation */}
          <div className="group rounded-3xl border-4 border-rose-300 bg-linear-to-bl from-rose-100 to-rose-200 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:border-8 hover:border-rose-500 hover:shadow-rose-500/50 dark:border-rose-700 dark:from-rose-900 dark:to-rose-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500 text-3xl shadow-lg transition-all group-hover:rounded-full group-hover:bg-rose-600">
              🌹
            </div>
            <h2 className="mb-3 text-2xl font-bold text-rose-900 dark:text-rose-100">
              Rose Test
            </h2>
            <p className="text-rose-800 dark:text-rose-200">
              Rose gradient with bottom-left direction and unique shadow colors.
            </p>
          </div>

          {/* Card 4: Unique Fuchsia Gradient */}
          <div className="group rounded-3xl border-4 border-fuchsia-300 bg-linear-to-r from-fuchsia-100 via-fuchsia-200 to-fuchsia-300 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:shadow-fuchsia-500/50 dark:border-fuchsia-700 dark:from-fuchsia-900 dark:via-fuchsia-800 dark:to-fuchsia-700">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-500 text-3xl shadow-lg">
              ✨
            </div>
            <h2 className="mb-3 text-2xl font-bold text-fuchsia-900 dark:text-fuchsia-100">
              Fuchsia Test
            </h2>
            <p className="text-fuchsia-800 dark:text-fuchsia-200">
              Three-stop gradient with fuchsia colors testing via direction.
            </p>
          </div>

          {/* Card 5: Unique Violet Gradient */}
          <div className="group rounded-3xl border-4 border-violet-300 bg-linear-to-tl from-violet-100 to-violet-200 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:shadow-violet-500/50 dark:border-violet-700 dark:from-violet-900 dark:to-violet-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500 text-3xl shadow-lg">
              💜
            </div>
            <h2 className="mb-3 text-2xl font-bold text-violet-900 dark:text-violet-100">
              Violet Test
            </h2>
            <p className="text-violet-800 dark:text-violet-200">
              Top-left gradient direction with violet shades and custom border
              widths.
            </p>
          </div>

          {/* Card 6: Unique Indigo Gradient */}
          <div className="group via-indigo-150 rounded-3xl border-4 border-indigo-300 bg-linear-to-br from-indigo-100 to-indigo-200 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:shadow-indigo-500/50 dark:border-indigo-700 dark:from-indigo-900 dark:to-indigo-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500 text-3xl shadow-lg">
              🔮
            </div>
            <h2 className="mb-3 text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              Indigo Test
            </h2>
            <p className="text-indigo-800 dark:text-indigo-200">
              Indigo gradients with custom shadows and group hover effects.
            </p>
          </div>
        </div>

        {/* Status Badges Section with NEW styles */}
        <div className="mt-12 space-y-6">
          <h2 className="text-center text-3xl font-bold text-purple-900 dark:text-purple-100">
            Status Badge Tests
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <span className="rounded-full border-2 border-purple-400 bg-purple-100 px-6 py-3 text-lg font-semibold text-purple-900 shadow-lg transition-all hover:scale-110 hover:bg-purple-200 dark:border-purple-600 dark:bg-purple-900 dark:text-purple-100">
              Purple Badge
            </span>
            <span className="rounded-full border-2 border-pink-400 bg-pink-100 px-6 py-3 text-lg font-semibold text-pink-900 shadow-lg transition-all hover:scale-110 hover:bg-pink-200 dark:border-pink-600 dark:bg-pink-900 dark:text-pink-100">
              Pink Badge
            </span>
            <span className="rounded-full border-2 border-rose-400 bg-rose-100 px-6 py-3 text-lg font-semibold text-rose-900 shadow-lg transition-all hover:scale-110 hover:bg-rose-200 dark:border-rose-600 dark:bg-rose-900 dark:text-rose-100">
              Rose Badge
            </span>
            <span className="rounded-full border-2 border-fuchsia-400 bg-fuchsia-100 px-6 py-3 text-lg font-semibold text-fuchsia-900 shadow-lg transition-all hover:scale-110 hover:bg-fuchsia-200 dark:border-fuchsia-600 dark:bg-fuchsia-900 dark:text-fuchsia-100">
              Fuchsia Badge
            </span>
            <span className="rounded-full border-2 border-violet-400 bg-violet-100 px-6 py-3 text-lg font-semibold text-violet-900 shadow-lg transition-all hover:scale-110 hover:bg-violet-200 dark:border-violet-600 dark:bg-violet-900 dark:text-violet-100">
              Violet Badge
            </span>
            <span className="rounded-full border-2 border-indigo-400 bg-indigo-100 px-6 py-3 text-lg font-semibold text-indigo-900 shadow-lg transition-all hover:scale-110 hover:bg-indigo-200 dark:border-indigo-600 dark:bg-indigo-900 dark:text-indigo-100">
              Indigo Badge
            </span>
            <span className="rounded-full border-2 border-cyan-400 bg-cyan-100 px-6 py-3 text-lg font-semibold text-cyan-900 shadow-lg transition-all hover:scale-110 hover:bg-cyan-200 dark:border-cyan-600 dark:bg-cyan-900 dark:text-cyan-100">
              NEW: Cyan Badge
            </span>
            <span className="rounded-full border-2 border-teal-400 bg-teal-100 px-6 py-3 text-lg font-semibold text-teal-900 shadow-lg transition-all hover:scale-110 hover:bg-teal-200 dark:border-teal-600 dark:bg-teal-900 dark:text-teal-100">
              NEW: Teal Badge
            </span>
          </div>
        </div>

        {/* NEW: Gradient Border Animation Test */}
        <div className="mt-12 space-y-6">
          <h2 className="text-center text-3xl font-bold text-purple-900 dark:text-purple-100">
            NEW: Gradient Border Test
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="group relative overflow-hidden rounded-3xl border-4 border-transparent bg-linear-to-r from-cyan-400 via-teal-400 to-emerald-400 p-8 shadow-2xl transition-all duration-500 hover:scale-105">
              <div className="text-center text-white">
                <span className="text-6xl">🌊</span>
                <h3 className="mt-4 text-2xl font-bold">Cyan-Teal-Emerald</h3>
                <p className="mt-2">NEW gradient combination!</p>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-3xl border-4 border-transparent bg-linear-to-r from-amber-400 via-orange-400 to-red-400 p-8 shadow-2xl transition-all duration-500 hover:scale-105 hover:rotate-1">
              <div className="text-center text-white">
                <span className="text-6xl">🔥</span>
                <h3 className="mt-4 text-2xl font-bold">Amber-Orange-Red</h3>
                <p className="mt-2">Fire gradient test!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Animated Boxes Section */}
        <div className="mt-12 space-y-6">
          <h2 className="text-center text-3xl font-bold text-purple-900 dark:text-purple-100">
            Animation Tests
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="h-32 animate-pulse rounded-2xl bg-linear-to-r from-purple-400 to-pink-400 shadow-xl ring-4 ring-purple-300"></div>
            <div className="h-32 animate-bounce rounded-2xl bg-linear-to-r from-pink-400 to-rose-400 shadow-xl ring-4 ring-pink-300"></div>
            <div className="h-32 animate-spin rounded-2xl bg-linear-to-r from-rose-400 to-fuchsia-400 shadow-xl ring-4 ring-rose-300 [animation-duration:3s]"></div>
          </div>
        </div>

        {/* Test Instructions */}
        <div className="mt-12 rounded-3xl border-4 border-purple-300 bg-white p-8 shadow-2xl dark:border-purple-700 dark:bg-gray-900">
          <h2 className="mb-4 text-2xl font-bold text-purple-900 dark:text-purple-100">
            How to Verify This Test
          </h2>
          <ul className="space-y-3 text-purple-800 dark:text-purple-200">
            <li className="flex items-start">
              <span className="mr-3 text-2xl">✅</span>
              <span>
                <strong>All cards should have colorful gradients</strong> -
                purple, pink, rose, fuchsia, violet, and indigo backgrounds
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-2xl">✅</span>
              <span>
                <strong>NEW: Advanced hover effects</strong> - cards should
                scale up, rotate icons, show rings, and skew on hover
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-2xl">✅</span>
              <span>
                <strong>NEW: Cyan and Teal gradients</strong> - two new gradient
                boxes with ocean and fire themes
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-2xl">✅</span>
              <span>
                <strong>Badges should be styled</strong> - rounded badges with
                borders and colored backgrounds (now with hover effects!)
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-2xl">✅</span>
              <span>
                <strong>Animations should run</strong> - pulse, bounce, and spin
                animations with ring borders
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-2xl">❌</span>
              <span>
                <strong>If styles are missing</strong> - cards appear unstyled,
                no gradients, no hover effects = cache issue
              </span>
            </li>
          </ul>
          <div className="mt-6 rounded-xl bg-purple-50 p-4 dark:bg-purple-900/30">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              <strong>Note:</strong> These Tailwind classes are unique to this
              page and haven&apos;t been used elsewhere. If they render
              correctly on Vercel, the cache fix is working! 🎉
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
