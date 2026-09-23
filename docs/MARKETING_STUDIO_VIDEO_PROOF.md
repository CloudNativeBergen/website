# Studio video — the export proof (#1171)

The proof asked for in [the Studio video spec](MARKETING_STUDIO_VIDEO_SPEC.md) §9: a 10-second
1080×1080, 30 fps canvas clip with sound, exported to MP4 with WebCodecs and Mediabunny in Chrome,
Safari and Firefox on a computer. Figures were measured on 2026-09-23, except where the text says
_calculated_, _extrapolated_ or _not run_. The throwaway page, every exported MP4, the run logs and
the analyses are in commit
[`7d65c68a`](https://github.com/CloudNativeBergen/website/commit/7d65c68af7279893122f8ad3a4145e1e48ce48f9)
(`scratch/video-proof/`). They were removed before merge. The repository squash-merges, so after
merge that commit is reachable only through PR #1193 (`refs/pull/1193/head`).

A few figures were not written to the run logs. They came from one-off commands against the same
files, listed here so they can be repeated. The SPS colour fields:
`ffmpeg -loglevel trace -i <file> -c copy -bsf:v trace_headers -f null -`. The `colr` box: read
directly from the MP4 bytes. The add-on sizes: `wc -c`, `gzip -9` and `brotli` on the files in
`node_modules`, with the WebAssembly decoded from the string embedded in
`dist/modules/build/aac.js`. `Lavc62.23.103`: `strings` on that WebAssembly. The licence text: the
package's `LICENSE` and a search of the whole package for "LGPL". The follow-up probe runs in §1
and §8, made after review, used the same page with a probe mode added. Their logs are not in the
commit.

## What was run

|           |                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Machine   | Apple M1 Pro, macOS 27.0 (26A428)                                                                                                                                                                                                                                                                                                               |
| Browsers  | Google Chrome 154.0.8037.57 · Safari 27.0 · Firefox Developer Edition 157.0                                                                                                                                                                                                                                                                     |
| Libraries | `mediabunny` 1.59.0 · `@mediabunny/aac-encoder` 1.59.0                                                                                                                                                                                                                                                                                          |
| Clip      | 10 s, 1080×1080, 30 fps, drawn from the frame index only. Background: a flat `brand-cloud-blue` `#1d4ed8` swatch; four smaller swatches (`brand-sunbeam-yellow` `#facc15`, `brand-fresh-green` `#10b981`, `brand-nordic-purple` `#6366f1`, `brand-slate-gray` `#334155`, all from `src/styles/tailwind.css`); a white flash on every 30th frame |
| Sound     | 48 kHz stereo rendered in an `OfflineAudioContext`: a quiet 220 Hz tone with a 2 ms click starting exactly on each second, so the click can be matched to the flash                                                                                                                                                                             |
| Encode    | `CanvasSource` with `codec: 'avc'` and no codec string (the library chooses), 8 Mbit/s target; `AudioBufferSource` with `codec: 'aac'`, 128 kbit/s; MP4 in memory. `await add()` on every frame, and a real task (`scheduler.yield()`, or `setTimeout(0)` where that is missing) after every 5 frames                                           |
| Analysis  | `ffprobe` / `ffmpeg` 9.0.2 on every file: stream properties, the SPS colour fields and the `colr` box, frame MD5, click position in the decoded audio against the flash frame's timestamp, swatch pixels from a decoded frame. Each browser also played every browser's file in a `<video>` and read the swatch pixels back                     |

Chrome was driven through Playwright with the installed Google Chrome (`channel: 'chrome'`), not
Playwright's Chromium. Safari and Firefox were opened with `open -a` on a URL that starts the export
by itself, and the page posted its log and the MP4 to the local server. Driving Safari and Firefox
with real mouse clicks failed: the computer-use tools could not find their windows
(`cgWindowNotFound`, `timeoutReached`), and Safari's WebDriver and "JavaScript from Apple Events"
both need a setting a person has to switch on. So a real click on Cancel was only measured in
Chrome. In Safari and Firefox, cancel was triggered by a timer task, which checks the same thing: a
task gets through while the export is running.

## 1. Does H.264 encode?

**Yes in all three, and Safari needs `latencyMode: 'realtime'`.** With no codec string, Mediabunny
chose **`avc1.640020`, High profile level 3.2** everywhere. That is a legal level: 1080×1080 is
4,624 macroblocks, over level 3.1's 3,600 but under 3.2's 5,120, and 30 fps is 138,720 macroblocks
per second against a limit of 216,000.

| `VideoEncoder.isConfigSupported` at 1080×1080  | Chrome | Safari  | Firefox |
| ---------------------------------------------- | ------ | ------- | ------- |
| `avc1.42001f` (Baseline 3.1)                   | no     | **yes** | **yes** |
| `avc1.420028` / `4d0028` / `640028` / `640032` | yes    | yes     | yes     |
| `avc1.640020` (Mediabunny's choice)            | yes    | yes     | yes     |

| Export result (default `latencyMode: 'quality'`) | Chrome               | Safari                    | Firefox              |
| ------------------------------------------------ | -------------------- | ------------------------- | -------------------- |
| Frames in the file                               | 300                  | **stalls at 8; no error** | 300                  |
| Profile / level / pixel format                   | High / 3.2 / yuv420p | —                         | High / 3.2 / yuv420p |
| Frame rate (r / avg)                             | 30/1, 30/1           | —                         | 30/1, 30/1           |
| Same frames when exported twice (MD5)            | yes                  | —                         | yes                  |

**Safari stalls.** With the default latency mode, Safari's encoder takes 7–8 frames and then
returns nothing: no output chunk and no error, and `flush()` had not resolved when the timeout
fired (5 s in the first runs, 30 s in the follow-up). It happens with raw WebCodecs and no
Mediabunny at all, and with `prefer-software`, level 4.0 and Baseline 3.1 too. It is not caused by
backpressure: a follow-up run queued all 300 frames without waiting and still got 0 chunks. It
works with **`latencyMode: 'realtime'`**, which exported 300 of 300 frames. **Firefox fails the
other way:** with `'realtime'` it throws `EncodingError: The given encoding is not supported.`
after 4 frames, even though `isConfigSupported` said yes for that exact config. Chrome works with
either mode, but `'realtime'` is 5× slower (5.9 s against 1.1 s). So no single setting works in
all three browsers.

With `'realtime'`, Safari gave 300 frames, High 3.2, 30/1 and identical MD5s on a second run. The
same browser in the same mode always produced the same frames. Different browsers, or a different
mode in one browser, produce different frames.

## 2. Does AAC encode natively? And the add-on

|                                                             | Chrome               | Safari 27            | Firefox                                                                                        |
| ----------------------------------------------------------- | -------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `AudioEncoder.isConfigSupported('mp4a.40.2', 48 kHz, 2 ch)` | yes                  | yes                  | **no**                                                                                         |
| Mediabunny `canEncodeAudio('aac')`                          | yes                  | yes                  | no, then yes once the add-on is registered                                                     |
| Asking for AAC with no add-on                               | works                | works                | refused before any frame: "This specific encoder configuration (mp4a.40.2 …) is not supported" |
| With the add-on                                             | works (forced)       | works (forced)       | works                                                                                          |
| Output                                                      | AAC-LC 48 kHz stereo | AAC-LC 48 kHz stereo | AAC-LC 48 kHz stereo                                                                           |

Only Safari 27 was installed, so the spec's claim that "Safari before 26 cannot encode it natively"
is **not confirmed or refuted**.

**The add-on (`@mediabunny/aac-encoder` 1.59.0):**

- **Licences: two.** The package says MPL-2.0 and ships only the MPL text. Inside it is a
  WebAssembly build of FFmpeg's AAC encoder (it identifies as `Lavc62.23.103`), which is
  **libavcodec under LGPL-2.1-or-later**. The package includes no LGPL notice and no FFmpeg
  source. Shipping it means shipping LGPL code in our bundle, so we would owe the LGPL notice and a
  pointer to the corresponding source. It is a separately loaded module, which keeps the "can be
  replaced" requirement easy. **This needs a human decision (see below).**
- **Size:** the WebAssembly module is 509,386 bytes and is embedded in the JavaScript. The file
  that gets shipped, `mediabunny-aac-encoder.min.mjs`, is **992,176 bytes raw, 253,776 gzip,
  203,236 brotli**. For comparison, `mediabunny.min.mjs` is 683,614 raw and 174,655 gzip. It can be
  loaded only when native AAC is missing.
- **Speed:** encoding the 10 s stereo track took 650–820 ms in every browser (Chrome 746–823,
  Safari 646–661, Firefox 727–787). It runs in a worker, and the longest gap between timer callbacks
  stayed at 56 ms or less. At that rate a 60 s track would take about 4–5 s (_extrapolated_).

## 3. Export time, progress and cancel

Wall time runs from `output.start()` to finalized, 10 s clip, two runs each:

|                                                 | Chrome                                                                                                               | Safari (`realtime`)                             | Firefox                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Native AAC                                      | 1.13 / 1.18 s                                                                                                        | 2.42 / 2.37 s                                   | —                                               |
| Add-on AAC                                      | 1.89 / 1.87 s                                                                                                        | 2.99 / 3.00 s                                   | 2.46 / 2.41 s                                   |
| Silent                                          | 1.06 s                                                                                                               | — (not run in `realtime`)                       | 2.49 s                                          |
| Longest gap between 4 ms timer callbacks        | 19–32 ms (165 ms once, the first run after launch; 69 ms in the 60 s click run)                                      | 16–35 ms                                        | 29–56 ms (85 ms silent)                         |
| `requestAnimationFrame` callbacks during export | 64–266                                                                                                               | 141–180                                         | 86–187                                          |
| Cancel                                          | real mouse click at 20 % of a **60 s** clip: handler ran, `output.cancel()` resolved in **1.6 ms**, state `canceled` | timer task: delivered in 1 ms, resolved in 3 ms | timer task: delivered in 4 ms, resolved in 0 ms |

Neither probe measures paint or click latency directly. The timer gaps show that the main thread
was never busy for longer than that between timer callbacks. Browsers may schedule input
differently from timers, so this is evidence, not a bound. The `requestAnimationFrame` callbacks
show the browser kept rendering frames. The screenshot of the Chrome click run, taken after the
cancel, shows the bar stopped at 20 %. `output.cancel()` resolving, and the output reaching state
`canceled`, were measured. That the encoder was actually closed and its memory freed was **not**
measured. One Safari run happened with the window not visible: 0 `requestAnimationFrame`
callbacks and timers throttled. It still finished, in 6.5 s instead of 2.4, which matches the spec's
reason for avoiding `requestAnimationFrame`.

## 4. The AAC priming offset: are sound and picture in step?

**No, not unless we compensate, and the offset depends on the encoder.** Mediabunny wrote the first
audio packet at 0, the first video frame also at 0, and **no edit list**. So every file starts with
the encoder's priming silence, and the sound comes late by that much. Clicks were measured in
ffmpeg's decode against the timestamp of the matching flash frame, on every click found:

| Encoder                     | Chrome       | Safari       | Firefox      | Sound late by |
| --------------------------- | ------------ | ------------ | ------------ | ------------- |
| Native (macOS AudioToolbox) | 2112 samples | 2112 samples | —            | **44.0 ms**   |
| Add-on (FFmpeg)             | 1024 samples | 1024 samples | 1024 samples | **21.3 ms**   |

Every click that was found had the same offset. **Safari's native encoder also loses the start:**
its files are silent until decoded sample 3,135. The first click, which should land at 2112, is
missing (9 clicks found, not 10), so about 1,024 input samples (21 ms) never come out. The add-on in
Safari and both encoders in Chrome keep them. So a track that starts on a downbeat loses its
first 21 ms in Safari. With the trim recommended below, Safari's native path loses about 65 ms of
the mixed track in all (44 ms trimmed plus 21 ms dropped). Two ways to fix the offset were tried:

- **Measure at export time, then trim (recommended).** Encode half a second containing one click
  with the same encoder, decode it back through Mediabunny, and find the click. That took 20–163 ms
  and returned exactly 2112 or 1024 in all five browser and encoder pairs. Then drop that many
  samples from the start of the mixed track. The result was **0 samples offset** in every one of
  them (Chrome native and add-on, Safari native and add-on, Firefox add-on). The first 44 ms of the
  track is lost, which is under any fade-in. The fix is in the samples themselves, so it does not
  depend on how a player or a platform's transcoder treats the container.
- **An edit list** (`startTimestamp: -2112/48000` on the audio source), tried in Chrome only. It
  made Mediabunny write an `elst` with media time 2112, and ffmpeg then decoded it 0–1 samples off.
  With the edit list ignored it is 2112 off again, so it relies on the player. Not recommended.

## 5. Does a brand-colour swatch survive the encoder?

**The encoded pixels do, within 1–2 levels. How the file is labelled differs by browser, and one
label is wrong.** Pixels were decoded exactly from frame 15 (not a flash frame) as BT.709 limited
range, and compared with the source hex. The largest channel difference across the five swatches:

|                                                        | Chrome                    | Safari                       | Firefox                      |
| ------------------------------------------------------ | ------------------------- | ---------------------------- | ---------------------------- |
| Encoded, read as BT.709 limited                        | ≤ 1                       | ≤ 2                          | ≤ 1                          |
| Same pixels read as BT.601                             | ≤ 22                      | ≤ 22                         | ≤ 22                         |
| H.264 SPS colour fields                                | 709 / sRGB / 709, limited | unspecified (2/2/2), limited | unspecified (2/2/2), limited |
| MP4 `colr` box (primaries / transfer / matrix / range) | 1 / 13 / 1 / limited      | 1 / 13 / 1 / **full**        | 1 / **1** / 1 / limited      |

**Played back in each browser** (`<video>` drawn to a canvas, largest channel difference over the
five swatches):

| Played in ↓ / file from → | Chrome file | Safari file | Firefox file |
| ------------------------- | ----------- | ----------- | ------------ |
| Chrome                    | 2           | 2           | 1            |
| Safari                    | 1           | 1           | **12**       |
| Firefox                   | 9           | 9           | 9            |

Two labelling defects, neither in our code:

- **Safari's encoder reports `fullRange: true`**, but the pixels it writes are limited range.
  Mediabunny copies that report into the `colr` box. Chrome's and Safari's players ignore it and
  show the colours right. A player that believes the box would show the swatches up to 18 levels
  (_calculated_) off (`#1d4ed8` becomes about `#2952cd`). How LinkedIn's and Bluesky's transcoders
  read it is **not known**.
- **Firefox labels the transfer as BT.709 rather than sRGB.** Safari honours that label, which
  lightens every swatch by up to 12 levels (`#1d4ed8` shows as `#2158de`).

Firefox's own player shows every file, from any browser, 9 levels off. That is its player, not the
file. None of these differences is visible at a glance next to a brand colour. The worst, 18, is a
visible shift on a large flat area.

## 6. Does `isConfigSupported` say yes and the encode then fail?

**Yes, twice, and one of those fails silently.**

|                        | Chrome            | Safari                                                                            | Firefox                                           |
| ---------------------- | ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Video, `quality` mode  | no failure        | **supported, then stalls at frame 8 with no error, and `flush()` never resolves** | no failure                                        |
| Video, `realtime` mode | no failure (slow) | no failure                                                                        | **supported, then `EncodingError` at frame 4**    |
| Audio                  | no failure        | no failure                                                                        | not supported; refused before any frame (correct) |

The spec's rule, "the encoder's error is caught and shown", covers Firefox. It does not cover
Safari, because Safari never raises an error. The page only found the stall with a watchdog: no
frame accepted for 15 seconds.

## 7. Does the file upload and play on LinkedIn and Bluesky?

**Not tested: this box stays open.** Nothing was posted anywhere. What the files measured, beside
each platform's published limits:

|                     | Our files                                                                              | LinkedIn ([help a548372](https://www.linkedin.com/help/linkedin/answer/a548372)) | Bluesky ([TechCrunch, 2026-08-26](https://techcrunch.com/2026/08/26/bluesky-now-lets-you-upload-10-minute-long-videos/)) |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Container / codecs  | MP4, H.264 High 3.2, AAC-LC 48 kHz stereo                                              | MP4 accepted                                                                     | MP4 with H.264                                                                                                           |
| Size                | 0.29–0.57 MB for 10 s                                                                  | 75 KB – 5 GB                                                                     | up to 300 MB                                                                                                             |
| Duration            | 10.0–10.07 s                                                                           | 3 s – 15 min                                                                     | up to 10 min                                                                                                             |
| Resolution / aspect | 1080×1080, 1:1                                                                         | 256×144 – 4096×2304, 1:2.4 – 2.4:1                                               | not stated there                                                                                                         |
| Frame rate          | 30                                                                                     | 10 – 60 fps                                                                      | not stated                                                                                                               |
| Bitrate, whole file | **179–456 kbit/s** (Chrome native 253, Chrome silent **179**, Safari 234, Firefox 456) | **192 kbit/s – 30 Mbit/s**                                                       | not stated                                                                                                               |

**Watch the bitrate.** The target is 8 Mbit/s, but on a flat design the encoders spend far less:
Chrome's video track alone is 177 kbit/s, and **the silent Chrome export, at 179 kbit/s, is already
under LinkedIn's 192 kbit/s minimum.** Whether LinkedIn rejects it is untested. #1177 should check
the real bitrate of a typical studio design, and set a minimum (a floor on the quality, or constant
bitrate) if needed.

**What a person must do:** agree test accounts with the organizer (a LinkedIn page or profile
nobody follows, and a Bluesky account). Upload the three sample files from commit `7d65c68a`
(`scratch/video-proof/out/chrome-auto-1.mp4`, `safari-rt-auto-1.mp4`, `firefox-auto-1.mp4`, and the
under-192 kbit/s `chrome-silent-1.mp4`) as a
video post on each. On each platform, check that it processes, plays with sound, and that the flash
and the click still land together, and compare the blue against `#1d4ed8` in a screenshot. Then
delete the posts and record the results here.

## 8. Recommendation

**Browsers without native AAC should export with the add-on,** if the LGPL obligation is accepted.
It worked in all three browsers tested (§2 lists the versions), costs about 254 KB gzip fetched only
when needed, and adds about 0.7 s per 10 s of sound, off the main thread. If the licence is not
accepted, **export silent with a clear notice** ("this browser cannot add the music; use Chrome,
Edge or Safari for sound"). Telling people to switch browser should be the last resort, since the
add-on worked everywhere it was tried.

**Does #1177 (silent export) hold as written? Mostly, with four amendments:**

1. **Latency mode per browser.** Safari needs `'realtime'`, Firefox must not get it, and Chrome is
   5× slower with it. Do not hardcode either. Before the real export, run a short check at the real
   size: encode about 10 frames in `'quality'`, then `flush()` under a timeout of about 3 s, and
   require a chunk for every frame. If it times out or errors, repeat the check in `'realtime'`. If
   that fails too, refuse. A check that waits for output _without_ flushing would wrongly reject
   Firefox, whose first chunk only came after all 11 frames had been sent. That check was run
   after review, with 11 frames:

   | Probe, 11 frames | Chrome                                 | Safari                                 | Firefox                                 |
   | ---------------- | -------------------------------------- | -------------------------------------- | --------------------------------------- |
   | `quality`        | 11 chunks, first at 62 ms, flush 20 ms | 0 chunks, flush timed out at 3 s       | 11 chunks, first at 266 ms, flush 31 ms |
   | `realtime`       | 11 chunks, first at 3.1 s, flush 82 ms | 11 chunks, first at 62 ms, flush 70 ms | the encoder errored and closed          |

   So in these three browsers the check picks `quality` in Chrome and Firefox and `realtime` in
   Safari, in about 0.1–3 s.

2. **A stall watchdog.** "A 'supported' encode that then fails shows its error" also has to cover
   an encoder that simply stops: no chunk and no progress for N seconds is an error. It is shown,
   and the output is cancelled.
3. **Codec string.** "Let Mediabunny choose" gives High 3.2, which is valid. The "4.0+" wording
   should read "Mediabunny's choice (High 3.2 measured) or level 4.0+". Do not trust
   `isConfigSupported` to reject 3.1: Safari and Firefox accept it.
4. **"Exporting twice gives the same frames"** holds only within one browser and one latency mode.
   The test should compare two runs in the same browser.

Also for #1177: check the bitrate against LinkedIn's 192 kbit/s minimum (§7); the silent Chrome
export is already under it. And decide whether to correct Safari's `fullRange: true` label (§5); it
may be enough to raise it with Mediabunny or WebKit.

**Does #1179 (music) hold as written? One change:** "apply the proof's measured AAC priming offset"
treats the offset as one number, and it is not: native AAC on macOS is 2112 samples and the add-on
is 1024. Measure it at export time (§4: 20–163 ms) and trim that many samples from the start of the
mixed track. With the trim, Safari's native encoder loses about 65 ms from the start of the mixed
track (§4). Either start the audible part of the track after that, or accept the loss under the
fade-in. #1179 should also carry the add-on decision above, including the LGPL notice on a
licences page if the add-on ships (`/privacy` is only for data collection).

## Holes

- Only macOS on Apple silicon. Windows, Linux, Intel Macs and Safari before 26 were not run, so the
  spec's Linux and older-Safari claims are unconfirmed.
- The real-click cancel was measured only in Chrome. Safari and Firefox used a timer task instead.
- Freeing the encoder on cancel was not measured, only `output.cancel()` resolving.
- The 60 s add-on encode time (4–5 s) is extrapolated from the 10 s runs.
- The LinkedIn and Bluesky upload was not done (§7).
- The Safari stall was seen on Safari 27 and macOS 27.0 only. It is not known whether it is a
  regression in this release or long-standing.
- Colour through a player that honours the `colr` range flag was calculated, not observed.
