# Video in the marketing studio

Decided in a design interview on 2026-09-22 and checked against the code before writing (§10).
Builds on [`MARKETING_ASSETS_SPEC.md`](./MARKETING_ASSETS_SPEC.md) (PR #1158) and amends it: the gallery
gains an `audio` kind, which is the one thing in it that cannot go into a post and has no alt text
(§6), and an exported video remembers its project, which that spec ruled out for images (§7).

## 1. What changes

The studio's meme generator makes one still image. It gains a **Video mode**: a short clip built
from scenes, with transitions between them, text and logo that animate in and out, a music track, a
timeline you can scrub, and an MP4 that is made in the browser.

The reason this is a small step and not a new product: the meme generator already draws on a
canvas. A frame of video is that same drawing at a moment in time, and a hand-drawn canvas frame
costs milliseconds — a 60-second clip is seconds of work, with no server rendering.

Not in this work, each a decision:

- **Keyframes.** Animation is presets only. Keyframing any property of any element is a different
  product, and presets are what keep a clip made by a non-designer looking deliberate.
- **Footage.** A scene's background is a colour or a still. Video clips as backgrounds mean
  decoding, trimming and re-encoding someone else's video in the browser; a named follow-up.
- **Shapes other than square.** Decided once, for cards and video together, in the social-sizing
  spec ([#1168](https://github.com/CloudNativeBergen/website/issues/1168)).
- **GIF export.** Bluesky turns a GIF into video anyway, and an MP4 looks better at a tenth of the
  size.
- **A built-in music library.** That is a content-licensing project.
- **Remotion** or another framework. Its licence is per seat for a team of four or more, and its
  browser renderer exists to emulate DOM layout on a canvas — which we do not have to do.

## 2. The model

An **Image / Video** switch at the top of the meme generator. Image mode is what exists today.
Switching to Video makes the current design scene 1 and shows the timeline under the canvas;
switching back shows the selected scene's design as the image.

- A **video** is an ordered list of **scenes**, 1080×1080, 30 frames a second. Its length is the
  **sum of its scenes' durations**, at most **60 seconds**.
- A **scene** is a complete meme-generator design — background, the text lines, the logo, the QR
  code — plus a **duration** (3 seconds when new, never under 1) and a **transition** into the next
  scene: cut, fade, slide or zoom.
- Each **element** of a scene — each text line, the logo, the QR code — has an **entrance** and an
  **exit** from none, fade, slide up and pop, each with a time within the scene.
- A background image may **drift**: a slow zoom across the scene's duration.

Everything is a preset with a time. There is nothing to keyframe and no easing to choose.

**Transitions do not overlap scenes.** Scenes sit end to end, so the timeline is to scale and the cap
is plain arithmetic. A transition is a half-second window centred on the boundary: in it the
outgoing scene is drawn at its own time, held at its last frame once that runs out, and the
incoming scene at its own time, held at its first frame until it starts. A cut has no window. The
last scene has no transition; looping the preview jumps.

**The presets, numerically,** all ease-out cubic: fade, 0.4 s of opacity; slide up, 0.4 s from 40 px
below with a fade; pop, 0.35 s of scale from 0.8 through 1.05 to 1. An exit is its entrance
reversed. **Pop transforms the drawn element; it never changes the font size** — text wraps by
measuring, and a changing size would re-wrap the line mid-animation.

**Element times belong to the scene.** Shortening a scene clamps them into it, and an exit never
precedes its entrance.

## 3. The timeline

Scenes in a row, to scale; under each scene, one bar per element.

- Drag a scene's edge to change its duration; drag a scene to reorder; add, duplicate and delete a
  scene. The total is held to 60 seconds — a drag that would pass it stops.
- Drag an element's bar to move when it enters and leaves; its ends are the entrance and the exit.
- A **playhead** you can drag. Play, pause, loop. Scrubbing is silent.
- The scene under the playhead is the one the editor's controls edit — while paused. During
  playback the controls stay on the scene they were on; a panel that swapped under the cursor
  every three seconds would be unusable.
- **Undo and redo** over the whole project state. It is cheap once the design is one object (§4),
  and a drag editor without it is not.
- **Operable without a mouse.** Scenes and bars are focusable; arrow keys move the playhead or the
  focused edge, with a modifier for larger steps; every drag has a numeric field that does the same
  thing. The preview does not autoplay, and honours reduced motion by not looping.
- The editor is built for a computer. On a narrow screen the timeline scrolls sideways rather than
  compressing sixty seconds into a phone's width.

**What you scrub is what you export.** Preview and export call the same drawing function with a
time; there is no second renderer to drift from the first.

## 4. Drawing at a time

The prefactor everything else stands on, and it changes Image mode as little as it can.

Today `drawCanvas` is a closure over some twenty pieces of component state and two image refs. It
becomes a pure function of a design, its decoded assets and a time. Four things the code does today
stand in the way, and each is fixed here:

- **The logo is not on the canvas.** It is a DOM element laid over it, and the PNG download works
  only because the download rasterises the whole DOM composite. A video frame taken from the canvas
  would have no logo. The logo is drawn on the canvas, in both modes, so there is one composition:
  - An uploaded logo is an SVG string, rasterised through an image. It must carry `xmlns` and a
    `viewBox` or an intrinsic size — Firefox refuses to draw one that does not, and the sanitizer
    guarantees neither — and it is fitted into the logo box the way the DOM fits it today.
  - **The fallback wordmark is drawn as text, not rasterised.** As an SVG it paints with the page's
    brand CSS variables in a web font, and an SVG loaded as an image inherits neither. Embedding
    the font would mean digging hashed font URLs out of the page's stylesheets. The canvas already
    has the document's fonts, so the wordmark is `fillText`, with the brand colours read from the
    computed style. The studio page passes the conference's title, which it does not today — the
    wordmark currently reads the platform's name.
  - **Bright or dark is a rule, not a theme.** The DOM picks the logo variant from the ADMIN's
    light or dark theme, which has nothing to do with the design. On the canvas it follows the
    background's luminance — the rule the monochrome variant already uses, including its habit of
    assuming white over any image, which moves across unchanged.
  - The overlay carried the logo's accessible name; the canvas gets an equivalent label.
- **Assets are not awaited.** A background image's load does not trigger a redraw; the draw merely
  races the decode. Harmless for a still you can look at, fatal for frames. Every asset of every
  scene — backgrounds, the logo raster, each scene's QR image, **and every font face the text and
  the wordmark use** — is loaded and decoded before preview or export starts, and drawing never
  waits on anything. Fonts are assets because text wraps by measuring: a face that arrives late
  re-wraps the line. One family in the picker has no font face anywhere in the app and so renders
  differently per machine; it gets a face or leaves the picker.
- **A drifting background is pre-scaled once**, not resampled from a multi-megapixel photo on every
  frame.
- **The QR image is regenerated on every edit**, because the draw function is among its effect's
  dependencies. It is generated from the QR settings alone.
- **A text line's "horizontal position" does nothing.** Three sliders carry that name; the text
  line's exists and the drawing never reads it. It is wired up.

Image mode's download is untouched by this: it still captures the visible 540 px preview at four
times its size, 2160 px, which is the 1080 canvas upsampled. The one visible difference is the logo,
a vector overlay today and therefore the only thing genuinely sharp at 2160; on the canvas it is as
sharp as the rest. Whether the download should instead be the canvas's own 1080 pixels is a
question for the social-sizing spec, not this one.

**A transition draws two scenes.** Each is drawn to its own offscreen canvas and the pair is
composited; a scene never has to know it is in a transition.

**Drawing stays on the main thread.** Canvas text uses the document's loaded fonts, and a worker's
canvas does not have them. Encoding may move to a worker; drawing does not.

## 5. Export

MP4, H.264, 1080×1080, 30 fps, made in the browser with WebCodecs and
[Mediabunny](https://mediabunny.dev) (MPL-2.0; `mp4-muxer`, the better-known name, is deprecated in
its favour). Each frame is the canvas at frame `n`'s time — frame-index-pure, never wall-clock — so
an export is repeatable and as fast as the machine allows. A progress bar, and a cancel — which
need the loop to yield a real task between batches of frames: awaiting a fast encoder resolves as
microtasks, so without it the bar never paints and the cancel click is never delivered. Not
`requestAnimationFrame`, which a hidden tab throttles to a standstill. The encoder is fed no faster
than its queue drains.

The codec string is left to Mediabunny or set to H.264 level 4.0 or higher: 1080×1080 is more
macroblocks than level 3.1 allows, and the library's own example string is level 3.1. At 8 Mbit/s a
full 60 seconds is about 60 MB, inside the gallery's 100 MB.

- **Support is detected, never assumed.** The encoder is asked whether it supports the exact
  configuration. Where it does not — Firefox on Android has no video encoder at all, and H.264
  encoding per browser and operating system is not documented anywhere — the export button says so
  and suggests Chrome, Edge or Safari on a computer. It never produces a broken file and never
  falls back to a format the gallery does not take. "Supported" can still fail once encoding
  starts; the encoder's error is caught and shown, not swallowed.
- **A tainted canvas cannot be read.** Backgrounds are local files today, so the canvas is clean. A
  background picked from the gallery is a Sanity CDN URL, and drawing it taints the canvas: the
  first exported frame throws. Setting `crossOrigin` on the image does not help — the CDN sends a
  CORS header only to origins on the project's list, which holds the Sanity Studio and nothing
  else, so on every tenant domain the image would simply fail to load (checked 2026-09-22). Gallery
  backgrounds come through the existing same-origin image proxy, as a rendition no larger than the
  canvas needs, which also keeps them under the platform's response-size limit.
- **Download** is there from the first export. **"Save to gallery"** arrives when the gallery takes
  video ([#1167](https://github.com/CloudNativeBergen/website/issues/1167)): the MP4 and a poster
  frame go through the gallery's upload path, and the asset remembers its project (§7).

**The proof comes first** (§9). Nobody has seen a canvas become an MP4 with sound in this codebase,
and the parts of the support matrix that matter are undocumented.

## 6. Music

One track per video: a start point within the track, a volume, a fade in and a fade out. The
fade-out is anchored to the video's end, or to the track's if that comes first; a track shorter
than the video ends in silence, it does not loop. In preview the audio clock drives the playhead
when a track is present; scrubbing is silent. In export the track is decoded, mixed and encoded as
AAC beside the video.

- **Where tracks come from.** The organizer uploads MP3, M4A or WAV — at most 20 MB **and at most
  10 minutes**: size alone is no limit, since a 20 MB MP3 is twenty minutes and decodes to hundreds
  of megabytes of samples. They confirm once per track: "I have the right to use this track in
  social posts." Who confirmed and when is stored with the track, and `/privacy` says so.
- **Where tracks live.** In the marketing asset gallery, as a new **`audio`** kind — a file, a
  title, the rights confirmation, tags, the usual scope. A conference has one or two tracks it
  uses everywhere; uploading them per clip is the pain the gallery exists to remove. It amends the
  gallery spec in two ways: an audio asset has no alt text, and it is the one thing in the gallery
  that cannot go into a post. That refusal, and finishing a render Task with one, are enforced on
  the server, as that spec requires for GIFs and video.
- **Fetching a track needs its own route.** The same CORS wall stands in front of the file (§5),
  and the image proxy serves images only, unstreamed, under a ~4.5 MB limit. A track comes through
  a new same-origin route that streams the file, for an organizer of the owning organization only.
- **Decoding is pinned.** Decoded at the hardware's sample rate, the same project would export
  differently on two machines. Tracks are decoded and mixed in an offline context at 48 kHz.
- **AAC encoding is not everywhere.** Firefox on any platform, any browser on desktop Linux, and —
  to be confirmed by the proof — Safari before 26 cannot encode it natively. There is an add-on
  encoder for Mediabunny, a WebAssembly build of FFmpeg's; its licence and size are stated nowhere
  we found. The proof settles whether those browsers export with sound, export silent with a clear
  notice, or are told to use another browser, and measures the AAC priming offset so sound and
  picture line up.

## 7. Projects

A video is saved as a **project** and reopened; nobody rebuilds five scenes for a typo. (Images
stay finished files with no editor state — the project format is a compatibility cost worth paying
for video and not for a still.)

- A new organization-owned document, scoped like a gallery asset: the organization, and an explicit
  `organization` or `edition` scope. Any organizer of the organization may open, change and delete
  it. It holds a title, the scenes with their designs and timings, and a reference to the track.
- **It references files, the way a post does.** A scene's background and the video's track point
  at the Sanity file, with a weak pointer to the gallery asset for display. So deleting a gallery
  asset never breaks a project, exactly as it never breaks a post: the gallery's orphan check sees
  the project's reference and keeps the file. A track's rights confirmation is copied into the
  project with the reference, so it survives the asset's deletion too.
- **It holds references, never bytes.** A background uploaded in the editor today is a data URL in
  memory and is saved nowhere. A saved project's backgrounds are gallery assets: picked from the
  gallery, or uploaded — which puts them in the gallery. So an unsaved video can use any local
  file, and **saving a project needs the gallery**
  ([#1160](https://github.com/CloudNativeBergen/website/issues/1160)). QR codes are stored as
  settings and regenerated. Array members carry `_key`. A Sanity document has a hard size limit;
  sixty seconds of scenes as references and numbers is far under it, and base64 would not be.
- The format carries a **version**. A project written by an older version opens or says plainly
  that it cannot; it is never silently reinterpreted.
- **Save** is a button, with a warning on leaving with unsaved changes. Saving is compare-and-set
  on the revision the editor loaded, and the new revision is carried back into the editor after
  each save. Scenes are written as one whole array, never as chained inserts.
- **Duplicate** writes a new project from the contents of another, with fresh keys and "Copy of" in
  the title. It is how these clips will really be made: one good one, then variations.
- The studio opens a project from its URL. An exported video saved to the gallery records its
  project, and "Open in studio" on that asset opens it.

**Erasure.** A project can hold a speaker's photo as a background. Speaker erasure removes a
speaker's images from everything that references the file; projects are one more such document — a
nested removal by scene key, and one more counter in erasure's verification — and a scene whose
background is gone falls back to its colour. An exported video showing that photo is followed the
same way: from the erased file to the projects that used it, to the gallery videos those projects
made. Known hole: a video that was only downloaded, or made from a project since deleted, is out of
reach.

## 8. Testing

- Timeline arithmetic — which scene is at a time, a transition window, an element's entrance and
  exit, clamping, the 60-second cap — is pure and is tested as such.
- The unit suite runs in Node, which has no canvas and no `ImageData`. The drawing function is
  tested there against a recording context: the calls it makes, in order, for a design at a time.
- Storybook tests the real canvas, with care. Its fonts come from a CDN and are not the app's set,
  so glyph-level pixel assertions would depend on the network and the platform. Stories pin a time
  and assert on REGIONS: the logo box is not background-coloured; a faded-out line's box is. The
  component has no test that looks at pixels today, and the studio page test mocks it out entirely.
- An export test in CI cannot assume H.264: headless Chromium commonly lacks it. The export story
  asserts the supported path when the encoder reports support and the refusal message when it does
  not — both are behaviour this spec defines.

## 9. Slices

[#1171](https://github.com/CloudNativeBergen/website/issues/1171) **the proof**: a 10-second canvas clip with sound exported in Chrome, Safari and Firefox,
reporting per browser whether H.264 and AAC encode, the add-on AAC encoder's licence and size, export
time, the AAC priming offset, whether a brand colour survives the encoder, and whether LinkedIn and
Bluesky take the file. It gates #1177 and #1179 as written ·
[#1172](https://github.com/CloudNativeBergen/website/issues/1172) the logo on the canvas (§4) · [#1173](https://github.com/CloudNativeBergen/website/issues/1173) one "draw at time t" function (§4) — needs #1172 ·
[#1174](https://github.com/CloudNativeBergen/website/issues/1174) Video mode with scenes and a scrub timeline, cut and fade, preview only (§2, §3) — needs
#1173 · [#1175](https://github.com/CloudNativeBergen/website/issues/1175) slide and zoom, scene management, the cap, undo (§2, §3) · [#1176](https://github.com/CloudNativeBergen/website/issues/1176) element
entrances and exits, and drift (§2) — each needs #1174 · [#1177](https://github.com/CloudNativeBergen/website/issues/1177) export to MP4, silent (§5) — needs
#1171 and #1174 · [#1178](https://github.com/CloudNativeBergen/website/issues/1178) audio tracks in the gallery (§6) — needs the gallery's #1161 ·
[#1179](https://github.com/CloudNativeBergen/website/issues/1179) a music track in preview and export (§6) — needs #1171, #1177 and #1178 ·
[#1180](https://github.com/CloudNativeBergen/website/issues/1180) gallery images as scene backgrounds (§5, §7) — needs #1173 and #1161 ·
[#1181](https://github.com/CloudNativeBergen/website/issues/1181) projects (§7) — needs #1174, #1180 and the gallery's erasure #1162 ·
[#1182](https://github.com/CloudNativeBergen/website/issues/1182) save an exported video to the gallery (§5, §7) — needs #1177, #1181 and the gallery's
video slice #1167.

The editor is fully usable and exports after #1177, before any gallery work exists; it cannot save
a project or reuse gallery images until then.

## 10. What the code changed before this was written

- **The logo is a DOM overlay, not part of the canvas**, and the fallback wordmark cannot simply be
  rasterised (§4). The interview assumed "the scene is already a canvas".
- **Both canvases are 1080.** The "540 preview" is CSS scaling; only the logo overlay is drawn at
  two scales. One fewer thing to change.
- **Asset loading races the draw** (§4).
- **Uploaded backgrounds are saved nowhere**, so saved projects depend on the gallery (§7).
- **Gallery backgrounds would taint the canvas** and block export without `crossOrigin` (§5).
- **Fonts bind the drawing to the main thread** (§4).
- **The studio page passes the generator only a title and logos** — no conference, no palette, no
  default QR URL; Video mode's project loading and gallery picking need more.
- **No COOP/COEP headers**, so a multithreaded ffmpeg.wasm fallback was never an option; WebCodecs
  is the path, with refusal rather than a slow fallback where it is missing.
- A review round added: **the CDN sends no CORS header to tenant domains**, so `crossOrigin` would
  have broken gallery backgrounds outright and a track had no way to be fetched at all (§5, §6);
  the wordmark as canvas text; the logo variant as a rule instead of the admin's theme; fonts as
  assets; transitions that do not overlap scenes, with the presets given numbers; the export loop
  yielding real tasks; the H.264 level; track length capped by duration; pinned decoding; projects
  referencing files as posts do; undo, keyboard operation and the narrow-screen timeline; and that
  the Image-mode download is 2160 px of upsampled preview, not four times the canvas.
