# Video in the marketing studio

Decided in a design interview on 2026-09-22 and checked against the code before writing (§10).
Builds on [`MARKETING_ASSETS_SPEC.md`](./MARKETING_ASSETS_SPEC.md) (PR #1158), which it amends in one
place: the gallery gains an `audio` kind (§6).

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
Switching to Video makes the current design scene 1 and shows the timeline under the canvas.

- A **video** is an ordered list of **scenes**, 1080×1080, at most **60 seconds** in total, 30
  frames a second.
- A **scene** is a complete meme-generator design — background, the text lines, the logo, the QR
  code — plus a **duration** (3 seconds when new) and a **transition** into the next scene: cut,
  fade, slide or zoom, about half a second, taken from the end of the outgoing scene and the start
  of the incoming one.
- Each **element** of a scene — each text line, the logo, the QR code — has an **entrance** and an
  **exit** from none, fade, slide up and pop, each with a time within the scene.
- A background image may **drift**: a slow zoom across the scene's duration.

Everything is a preset with a time. There is nothing to keyframe and no easing to choose.

## 3. The timeline

Scenes in a row, to scale; under each scene, one bar per element.

- Drag a scene's edge to change its duration; drag a scene to reorder; add, duplicate and delete a
  scene. The total is held to 60 seconds — a drag that would pass it stops.
- Drag an element's bar to move when it enters and leaves; its ends are the entrance and the exit.
- A **playhead** you can drag. Play, pause, loop.
- The scene under the playhead is the one the editor's controls edit.

**What you scrub is what you export.** Preview and export call the same drawing function with a
time; there is no second renderer to drift from the first.

## 4. Drawing at a time

The prefactor everything else stands on, and it changes Image mode as little as it can.

Today `drawCanvas` is a closure over some twenty pieces of component state and two image refs. It
becomes a pure function of a design, its decoded assets and a time. Four things the code does today
stand in the way, and each is fixed here:

- **The logo is not on the canvas.** It is a DOM element laid over it, and the PNG download works
  only because the download rasterises the whole DOM composite. A video frame taken from the canvas
  would have no logo. The logo is rasterised and drawn on the canvas, in both modes, so there is
  one composition. An uploaded logo is a self-contained SVG string and rasterises as it is. **The
  fallback wordmark does not:** it paints with the page's brand CSS variables in a web font, and an
  SVG loaded as an image is an isolated document that inherits neither — its colours must be
  resolved and its text outlined or its font embedded first. The monochrome variant's colour comes
  from the background's luminance today and hardcodes white whenever any image is set; that rule
  moves into the drawing function unchanged.
- **Assets are not awaited.** A background image's load does not trigger a redraw; the draw merely
  races the decode. Harmless for a still you can look at, fatal for frames. Every asset of every
  scene — backgrounds, the logo raster, each scene's QR image — is loaded and decoded before
  preview or export starts, and drawing never waits on anything.
- **The QR image is regenerated on every edit**, because the draw function is among its effect's
  dependencies. It is generated from the QR settings alone.
- **"Horizontal position" does nothing.** The slider exists and the drawing never reads it. It is
  wired up.

A known consequence for Image mode, stated rather than hidden: the download is captured at four
times the canvas size, and the logo — a vector overlay today — is the one thing that is actually
sharper for it. Drawn on the 1080 canvas it is as sharp as everything else. If that matters, the
logo is rasterised at the capture's resolution; it is not a reason to keep two compositions.

**A transition draws two scenes.** Each is drawn to its own offscreen canvas and the pair is
composited; a scene never has to know it is in a transition.

**Drawing stays on the main thread.** Canvas text uses the document's loaded fonts, and a worker's
canvas does not have them. Encoding may move to a worker; drawing does not.

## 5. Export

MP4, H.264, 1080×1080, 30 fps, made in the browser with WebCodecs and
[Mediabunny](https://mediabunny.dev) (MPL-2.0; `mp4-muxer`, the better-known name, is deprecated in
its favour). Each frame is the canvas at frame `n`'s time — frame-index-pure, never wall-clock — so
an export is repeatable and as fast as the machine allows. A progress bar, and a cancel.

- **Support is detected, never assumed.** The encoder is asked whether it supports the exact
  configuration. Where it does not — Firefox on Android has no video encoder at all, and H.264
  encoding per browser and operating system is not documented anywhere — the export button says so
  and suggests Chrome, Edge or Safari on a computer. It never produces a broken file and never
  falls back to a format the gallery does not take.
- **A tainted canvas cannot be read.** Backgrounds are local files today, so the canvas is clean. A
  background picked from the gallery is a Sanity CDN URL, and without `crossOrigin` on the image the
  first frame throws. Gallery images are loaded with it set.
- **Download** is there from the first export. **"Save to gallery"** arrives when the gallery takes
  video ([#1167](https://github.com/CloudNativeBergen/website/issues/1167)): the MP4 and a poster
  frame go through the gallery's upload path, and the asset remembers its project (§7).

**The proof comes first** (§9). Nobody has seen a canvas become an MP4 with sound in this codebase,
and the parts of the support matrix that matter are undocumented.

## 6. Music

One track per video: a start point within the track, a volume, a fade in and a fade out; it is cut
at the video's end. In preview it plays in step with the playhead; in export it is decoded, mixed
and encoded as AAC beside the video.

- **Where tracks come from.** The organizer uploads MP3, M4A or WAV, up to 20 MB, and confirms once
  per track: "I have the right to use this track in social posts." Who confirmed and when is stored
  with the track.
- **Where tracks live.** In the marketing asset gallery, as a new **`audio`** kind — a file, a
  title, the rights confirmation, tags, the usual scope. A conference has one or two tracks it
  uses everywhere; uploading them per clip is the pain the gallery exists to remove. An audio asset
  cannot be attached to a post and cannot finish a render Task.
- **AAC encoding is not everywhere.** Firefox on any platform, and any browser on desktop Linux,
  cannot encode it natively. There is an add-on encoder for Mediabunny; its licence and size are
  unchecked. The proof settles whether those browsers export with sound, export silent with a
  clear notice, or are told to use another browser.

## 7. Projects

A video is saved as a **project** and reopened; nobody rebuilds five scenes for a typo. (Images
stay finished files with no editor state — the project format is a compatibility cost worth paying
for video and not for a still.)

- A new organization-owned document, scoped like a gallery asset: the organization, and an explicit
  `organization` or `edition` scope. Any organizer of the organization may open, change and delete
  it. It holds a title, the scenes with their designs and timings, and a reference to the track.
- **It holds references, never bytes.** A background uploaded in the editor today is a data URL in
  memory and is saved nowhere. A saved project's backgrounds are gallery assets: picked from the
  gallery, or uploaded — which puts them in the gallery. So an unsaved video can use any local
  file, and **saving a project needs the gallery**
  ([#1160](https://github.com/CloudNativeBergen/website/issues/1160)). QR codes are stored as
  settings and regenerated. Array members carry `_key`. A Sanity document has a hard size limit;
  sixty seconds of scenes as references and numbers is far under it, and base64 would not be.
- The format carries a **version**. A project written by an older version opens or says plainly
  that it cannot; it is never silently reinterpreted.
- **Save** is a button, with a warning on leaving with unsaved changes. Saving is
  compare-and-set on the revision the editor loaded, like the rest of the admin.
- **Duplicate** writes a new project from the contents of another, with fresh keys and "Copy of" in
  the title. It is how these clips will really be made: one good one, then variations.
- The studio opens a project from its URL. An exported video saved to the gallery records its
  project, and "Open in studio" on that asset opens it.

**Erasure.** A project can hold a speaker's photo as a background. Speaker erasure removes a
speaker's images from everything that references the file; projects are one more such document, and
a scene whose background is gone falls back to its colour. Known hole: an EXPORTED video showing a
speaker is found only if it was saved to the gallery with that speaker as its subject — the save
form offers the subject for that reason.

## 8. Testing

- Timeline arithmetic — which scene is at a time, a transition's progress, an element's entrance
  and exit, the 60-second cap — is pure and is tested as such.
- Drawing is tested in Storybook against the real canvas: stories that pin a time and assert
  pixels in known places (the logo is present; a faded-out line is absent). The component has no
  test that looks at pixels today, and the studio page test mocks it out entirely.
- An export test in CI cannot assume H.264: headless Chromium commonly lacks it. The export story
  asserts the supported path when the encoder reports support and the refusal message when it does
  not — both are behaviour this spec defines.

## 9. Slices

0. **Proof.** A throwaway page: a 10-second canvas animation with a music track exported to MP4 in
   Chrome, Safari and Firefox on a computer. Reports, per browser: does H.264 encode, does AAC
   encode natively, what the add-on AAC encoder's licence and size are, how long the export takes,
   and whether the file plays on LinkedIn and Bluesky. It gates slices 4 and 5 as written.
1. **Drawing at a time** — §4. Image mode looks the same; the logo is on the canvas.
2. **Scenes, transitions and the scrub timeline** — §2, §3. Preview only, in memory.
3. **Element entrances and exits, and drift** — §2.
4. **Export**, silent, with Download and the unsupported-browser message — §5.
5. **Music** — §6, and the `audio` kind in the gallery.
6. **Projects** — §7. Needs the gallery.
7. **"Save to gallery"** for an exported video — §5. Needs the gallery's video slice.

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
