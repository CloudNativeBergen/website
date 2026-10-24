# Jev: API shape, Norwegian quality and image support

Research for #1566 (map #1564). Question: what can TypeSafe's Jev do, how do we
talk to it from a Next.js/TypeScript app on Vercel, does it handle Norwegian,
can it see images, and can a stored Judgement record which model produced it?

**Sources.** TypeSafe's docs, read as Markdown through
[`docs.typesafe.ai/llms.txt`](https://docs.typesafe.ai/llms.txt) on 2026-10-25;
the OpenAPI spec at [`api.typesafe.ai/openapi.json`](https://api.typesafe.ai/openapi.json)
(`info.version` 0.2.0); the published npm package `@typesafe-ai/sdk@0.7.0`
(type declarations read from the tarball); the live model listings of the
[Vercel AI Gateway](https://ai-gateway.vercel.sh/v1/models) and
[OpenRouter](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints).
**No call to the Jev API was made.** Nothing here comes from a live probe.

**Legend.** `[verified]` = read on the linked primary source.
`[third-party]` = only found in a write-up by someone other than the vendor.
`[inferred]` = follows from verified facts, but no source says it.
`[unknown]` = could not be found; listed under the live probe in section 8.

## 1. Gist

- **API.** One endpoint, `POST https://api.typesafe.ai/v1/systemone`, Bearer key.
  The body is `{ model, state, questions, assets? }`. `questions` is a map of names
  you pick to typed questions (`noul` = yes/no, `choice`, `score`, and `box` for
  images). `answers` comes back keyed by the same names, plus `model` and `usage`.
  `[verified]` ([API reference](https://docs.typesafe.ai/api/system-one.md))
- **TypeScript.** The official SDK is `@typesafe-ai/sdk` (MIT, Node ≥ 22, this repo
  uses Node 24). Jev is also reachable as an "evaluation model" through the Vercel AI
  Gateway with AI SDK's `experimental_evaluate`. `[verified]`
- **No built-in moderation taxonomy.** We write every question ourselves. `[inferred]`
- **Versioning is good.** There are pinned IDs (`jev-1.13.0`, `jev-1.14.0`) and moving
  aliases (`jev-latest`, `jev-preview`), and responses carry the ID of the model that
  answered. Answers are **not fully deterministic** on repeated calls. `[verified]`
- **Norwegian: unknown.** TypeSafe says only that English is the primary training
  language and that other languages are "handled but not equally well". Nobody has
  published Norwegian results. `[verified]` for the claim, `[unknown]` for quality.
- **Images: yes, experimentally.** Since 2026-10-14, Jev 1.13 and 1.14 accept PNG/JPEG
  images behind a `TypeSafe-Danger-Zone-Images: true` header. TypeSafe labels this
  "**Dreamer-ready**", meaning not production-ready. The request format, the limits and
  the accuracy may change. `[verified]` This contradicts the map's working assumption
  that Jev is text-only.
- **Data terms.** TypeSafe does not train on inputs. It hosts in the US. A DPA with EU
  SCCs exists. Direct ZDR is for enterprise customers only, but **through the Vercel AI
  Gateway the pinned Jev models are listed as ZDR for every request**. `[verified]`

## 2. API shape

### Request

`[verified]` from the [OpenAPI spec](https://api.typesafe.ai/openapi.json) and the
[API reference](https://docs.typesafe.ai/api/system-one.md):

```json
{
  "model": "jev-1.14.0",
  "state": { "caption": "…", "language_hint": "nb" },
  "questions": {
    "harassment": { "type": "noul", "instructions": "Does `caption` insult or harass a person?" },
    "category":   { "type": "choice", "instructions": "…", "criteria": { "travel": "…", "invoice": "…", "other": "…" } },
    "severity":   { "type": "score",  "instructions": "…", "criteria": ["Harmless", "Rude", "Abusive", "Threatening"] }
  }
}
```

- `state` is a string, a JSON object or an array. Questions refer to fields with
  backticked paths, for example `` `caption` `` or `` `frames[2].frame` ``.
  ([Primitives](https://docs.typesafe.ai/primitives.md))
- `instructions` and `criteria` also accept nested JSON structure.
  ([Advanced](https://docs.typesafe.ai/primitives/advanced.md))
- **Choice**: `criteria` is a map from option name to description, with 1–255 options
  (`maxProperties: 255` in the spec).
- **Score**: `criteria` is an ordered array of levels, scored from 0, with at most 10
  levels. The spec says `minItems: 1`, while the [Vercel guide](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk)
  and the [OpenRouter tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/)
  say 2–10.
- **Noul**: `criteria` is optional, as `{ "true": "…", "false": "…" }`.
- Mixed question types go in one request. Each question is evaluated "in parallel and
  in isolation against the same state".
  ([Introduction](https://docs.typesafe.ai/introduction.md))

### Response

`[verified]` from the OpenAPI schemas `ChoiceAnswer`, `ScoreAnswer`, `NoulAnswer`
and `Usage`:

| Type | Fields |
| - | - |
| `noul` | `noul`: the probability of yes, 0–1. **No `confidence`.** |
| `choice` | `choice` (the option with the highest probability), `probabilities` per option (summing to ≈1), and `confidence` 0–1 |
| `score` | `score` (the expected value, a probability-weighted average that can fall between levels), `probabilities` per level, `legend` (level → criterion), and `confidence` |
| top level | `model`, `answers`, and `usage { input_tokens, output_tokens }` |

**Confidence is not the probability of the winning option.** It is a statistic
computed from the shape of the distribution: 1 when all the probability sits on one
option, 0 when it is spread evenly. For a three-option Choice it equals
`(3 × max − 1) / 2`. ([Confidence](https://docs.typesafe.ai/confidence.md))
TypeSafe's own moderation cookbooks route answers below a threshold to human review,
which matches our "advise first" decision. Through the Vercel AI Gateway,
"TypeSafe AI rounds probabilities and scores to two decimal places", and confidence
arrives in `providerMetadata.typesafe.confidence`
([Vercel guide](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk)).

### Limits

| Limit | Value | Source |
| - | - | - |
| Context | 64k tokens per request, and 32k for the state plus any single question | [Models](https://docs.typesafe.ai/models.md) |
| Long context | 262k for both limits with `TypeSafe-Danger-Zone-Long-Context: true`, which is "slower and less accurate" | [Models](https://docs.typesafe.ai/models.md) |
| Questions per request | **No separate limit**, as long as the request fits the context | [Models](https://docs.typesafe.ai/models.md) |
| Body | 32 MiB, UTF-8 JSON, at most 64 nesting levels, finite numbers only; gzip or zstd accepted | [Errors](https://docs.typesafe.ai/api/errors.md) |
| Rate limits | Per organization, in tokens/s and requests/s, shown only in the [console](https://console.typesafe.ai/rate-limits). **The numbers are not published.** Exceeding them returns `429`; overload returns `529`. | [Models](https://docs.typesafe.ai/models.md) |
| Streaming | None (`max_tokens: 0`, "No streaming") | [AI Gateway model list](https://ai-gateway.vercel.sh/v1/models) |

Our inputs are tiny: a Wall Post caption is at most 80 characters, and comments and
opening messages are short. The context limits will not bind.

### Latency and price

- **Vendor claim:** 70–500 ms end to end, measured "from our laptops on the West Coast".
  ([launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev))
- **Independent measurements** `[third-party]`: median 273 ms, with 19 of 20 calls within
  407 ms, on jev-1.13.0 through the TypeSafe API on 2026-09-19. Other tests reported a
  284 ms median and, through OpenRouter, a 380 ms median.
  ([Preuve AI](https://preuve.ai/blog/jev-ai-review))
  A TypeSafe cookbook measured a median of about 0.4 s.
  ([Twitch cookbook](https://docs.typesafe.ai/cookbooks/twitch_chat_filter.md))
  None of these were measured from Europe or a Vercel region `[unknown]`. Judgement runs
  in the background, so latency does not matter for us.
- **Price:** $0.042 per million input tokens. Output tokens are free.
  ([Models](https://docs.typesafe.ai/models.md))
  The OpenRouter tutorial shows a 492-token request costing $0.0000207. A few hundred
  short items per conference therefore costs **well under one cent** `[inferred]`.

### How to call it from TypeScript

1. **`@typesafe-ai/sdk`** `[verified]` from the package's `index.d.mts`, the
   [JS SDK docs](https://docs.typesafe.ai/sdk/javascript.md) and the
   [changelog](https://docs.typesafe.ai/sdk/javascript/changelog.md):
   - `new TypeSafeClient()` reads `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL` and
     `TYPESAFE_DEFAULT_MODEL` (default `jev-latest`).
   - Calls look like `client.systemOne({ state, questions }, { headers, timeout, retry, signal })`,
     with the helpers `noul()`, `choice()`, `score()`, `box()` and `image()`.
   - The timeout defaults to 10 s per attempt, with 2 retries on 408, 429 and 5xx. It
     honours `Retry-After`, and there is **no total retry budget**.
   - It refuses browser use unless that is turned on explicitly.
   - It went from 0.5.7 to 0.7.0 in five weeks, and both 0.6.0 and 0.7.0 contain
     breaking changes. Pin the exact version.
2. **Vercel AI Gateway + AI SDK** `[verified]`
   ([Vercel guide](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk), published
   2026-09-19):
   - `import { experimental_evaluate as evaluate } from 'ai'` (ai ≥ 7.0.105), with the
     model `typesafe-ai/jev` or a pinned ID.
   - The Noul is renamed `boolean` there.
   - Per-request ZDR: `providerOptions: { gateway: { zeroDataRetention: true } }`.
   - The API is marked experimental, and the repo has no AI SDK today.
3. **OpenRouter** `[verified]`
   ([tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/)): an alpha
   "Decisions API" at `POST https://openrouter.ai/api/alpha/decisions`, using the model
   `typesafe/jev-1.13`. Its responses name a dated build such as `typesafe/jev-1.13-20260917`.
   We have no reason to prefer it over the gateway.
4. **Plain `fetch`** against the OpenAPI spec. Two endpoints matter: `/v1/systemone`
   and `/v1/models`.

## 3. Moderation taxonomy

There is **no built-in safety taxonomy or moderation endpoint**. `[inferred]` The API
has only the four question types, and the docs say "the same weights serve every
account. You shape its answers to your domain through the request".
([Models: Customizing Jev](https://docs.typesafe.ai/models.md#customizing-jev))

TypeSafe ships *patterns* we can copy instead:

- [Guardrails for LLMs](https://docs.typesafe.ai/cookbooks/llm_guardrails.md): one Noul
  per hazard plus a severity Score, with review and action thresholds.
- [Self-consistency: choices](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook.md):
  a moderation rubric of 8 Choices with an explicit `uncertain` outcome.
- [Twitch chat filter](https://docs.typesafe.ai/cookbooks/twitch_chat_filter.md):
  a category Choice plus toxicity and spoiler questions.

So the question list (and the Message Category list) is ours to write, version and
evaluate.

## 4. Model versioning

`[verified]` ([Models](https://docs.typesafe.ai/models.md)):

| Name | Kind | Points to |
| - | - | - |
| `jev-1.14.0` | pinned, released 2026-10-14 | |
| `jev-1.13.0` | pinned | |
| `jev-latest` | alias, "most recent stable, official release", the SDK default | `jev-1.14.0` |
| `jev-preview` | alias, "most recent release, official or not" | `jev-1.14.0` |

- The docs say: "An alias moves when a new release ships … Each response's `model` field
  gives the versioned ID that answered … If you have tuned confidence thresholds against
  one version, send that version's ID instead of the alias."
  **Store the response `model` as the Judgement's model version, and send a pinned ID.**
- **There is a discrepancy to probe.** The OpenAPI examples echo `"model": "jev-latest"`
  in the response, while OpenRouter returns a dated build (`jev-1.13-20260917`). It is
  unclear whether a pinned ID such as `jev-1.13.0` can change underneath you between
  dated builds `[unknown]`.
- No **deprecation or retirement policy** is published. `GET /v1/models` "currently
  lists the aliases" with a release date. `[verified]` / `[unknown]`
- TypeSafe publishes per-version known failure modes:
  [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md), last
  reviewed 2026-10-02. There is no 1.14 page.
- The AI Gateway lists `typesafe-ai/jev` (alias), `typesafe-ai/jev-1.13.0` and
  `typesafe-ai/jev-1.14.0` separately.
  ([gateway model list](https://ai-gateway.vercel.sh/v1/models))
- **Answers are not deterministic.** TypeSafe's own test sent the same 8-Choice rubric
  15 times, adding a fresh throwaway `uid` to each call. The plurality label repeated
  90.8% of the time, and labels flipped on 2 of the 8 questions.
  ([Self-consistency cookbook](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook.md))
  **Evals need repeats, or must compare probabilities rather than labels**
  `[inferred]`.

## 5. Languages: Norwegian

- **Vendor statement** `[verified]`: "English is the primary training language and
  where accuracy is currently best. Other languages, including CJK scripts, are handled
  but not equally well; test on your own content before relying on Jev for a
  non-English workload, and pay close attention to Confidence when routing."
  ([Models: Language support](https://docs.typesafe.ai/models.md#language-support))
- The Twitch cookbook repeats that Jev "accepted other languages but answered them less
  accurately". `[verified]`
- **No Norwegian (Bokmål or Nynorsk) data exists anywhere we could find.** `[unknown]`
  The one independent multilingual test covered English, French, Spanish, German,
  Italian, Portuguese, Arabic and Korean. English, French and German each scored 45/48,
  and Arabic and Korean 42/48. Its own author says the gaps are too small to rank the
  languages. `[third-party]` ([Preuve AI](https://preuve.ai/blog/jev-ai-review))
- The jaggedness page warns that Jev reads literally (sarcasm, negation, implied
  conditions) and leans toward the first Choice option. `[verified]` Both matter more
  in a language the model knows less well `[inferred]`.

Only a live probe can settle this (section 8).

## 6. Image support

**Verdict: Jev accepts images today, but only as an experimental "Dreamer-ready"
feature.** `[verified]` ([Images](https://docs.typesafe.ai/images.md))

- The docs say: "Images and Box questions aren't yet up to our standards to call ready
  for production … The request format, the answers, and the limits on this page can
  change between releases, and accuracy will change."
- Images are turned on per request with the header `TypeSafe-Danger-Zone-Images: true`.
  Without it, a request with an image returns `400`.
- "Jev 1.13 and Jev 1.14 both accept images." The `box` question (where something is
  in the image) needs 1.14. Every question type accepts images, in `state`,
  `instructions` or `criteria`. Images are sent as a top-level `assets` map keyed by
  opaque references (one UUID per image), either as `data_base64` + `format` or as
  `multipart/form-data` parts.
- **Limits:**
  - PNG or JPEG stills only.
  - 16 MiB per file.
  - **280 to 1568 px per side**. A smaller image is rejected, never resized.
  - EXIF orientation is *not* applied, so the pixels must be rotated upright first.
  - Progressive JPEG should be re-saved as baseline.
- Images are billed as input tokens at the text price, but "guidance on estimating
  image token usage" is still "soon". **The price per image is unknown.**
- The docs contradict themselves. The [Models](https://docs.typesafe.ai/models.md)
  table still says "Input: Text" for both versions, while the Images page and the SDK
  0.7.0 changelog (2026-10-14) say images work. The AI Gateway lists the pinned
  `jev-1.13.0`/`jev-1.14.0` with `input: [text, image]`, but the `typesafe-ai/jev`
  alias as text only. OpenRouter lists `jev-1.13` as `text+image->decisions`.
- **Background.** The 2026-09-15 launch post said Jev worked "not on images (yet…)",
  and third-party write-ups from that period say "text only"
  ([OpenRouter tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/),
  [WPS](https://www.wps.com/blog/what-is-jev-typesafe-s-system-one-model-and-its-best-use-cases/)).
  Those statements are now out of date.

**For us** `[inferred]`:

- A Jev image judge could share the text judge's seam, its versioning and its data
  terms.
- But "Dreamer-ready" accuracy and a format that may change between releases are a
  weak base for photos of real people. Image accuracy on moderation-type questions
  has not been measured by anyone.
- The 280 px minimum is fine for Wall Post photos.
- Keep a vision-capable alternative in the design. Decide after the probe.

### Vision-capable alternatives

Rough cost per image is for one ~1568×1176 photo. Prices are list prices as of
2026-10-25. At a few hundred photos per conference, every option costs under about
$2 per conference, so **cost does not decide this. Data terms, taxonomy fit and
versioning do.**

| Option | What it judges | Data terms (primary source) | Rough cost per image | Versioning |
| - | - | - | - | - |
| **Jev 1.14 with images** (direct, or the gateway's `typesafe-ai/jev-1.14.0`) | Our own questions, the same as for text | No training ([privacy policy](https://typesafe.ai/legal/privacy-policy)). Hosted in the US. ZDR through the gateway ([gateway ZDR](https://vercel.com/docs/ai-gateway/capabilities/zdr)). | Unknown; image tokens are not documented | Pinned IDs |
| **Vision LLM through the Vercel AI Gateway**, e.g. `google/gemini-3.1-flash-lite` | Free-form rubric with structured output | The gateway itself retains nothing. Per-request ZDR is free on Pro/Enterprise; team-wide costs $0.10 per 1k requests. Google Vertex, Anthropic, Bedrock, OpenAI and Azure are listed as ZDR providers. ([gateway ZDR](https://vercel.com/docs/ai-gateway/capabilities/zdr)) | ≈ $0.0005: 6 tiles × 258 tokens ([Gemini tokens](https://ai.google.dev/gemini-api/docs/tokens)) at $0.25/M ([gateway list](https://ai-gateway.vercel.sh/v1/models)) | Dated model IDs on the gateway |
| **Same, with `anthropic/claude-sonnet-5`** | Same as above. Note that Claude "does not process inappropriate or explicit images" ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)), so a refusal is itself a signal to handle. | ZDR through the gateway. Image uploads are ephemeral and not used for training ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). | ≈ $0.005: 56 × 42 = 2,352 visual tokens at $2/M | Dated model IDs |
| **OpenAI `omni-moderation-latest`** | Fixed categories; only self-harm (3), sexual, violence and violence/graphic take images ([moderation guide](https://developers.openai.com/api/docs/guides/moderation)) | Not used for training. `/v1/moderations` has no abuse-monitoring retention and is ZDR-eligible. EU residency is available. ([your data](https://developers.openai.com/api/docs/guides/your-data)) | **Free** | **Weak.** OpenAI plans "to continuously upgrade" the model, and scores "may need recalibration over time". No snapshots are listed. |
| **Google Cloud Vision SafeSearch** | Fixed explicit-content likelihoods | Synchronous calls are "processed in memory and not persisted to disk", and content is not used for training ([data usage](https://docs.cloud.google.com/vision/docs/data-usage)) | $0.0015, with the first 1,000 per month free ([pricing](https://cloud.google.com/vision/pricing)) | Not documented `[unknown]` |
| **AWS Rekognition `DetectModerationLabels`** | Fixed moderation label hierarchy | Inputs may be stored, and used to improve the service **unless the organization sets an AI-services opt-out policy** ([FAQ](https://aws.amazon.com/rekognition/faqs/)) | $0.001 for the first 1M per month ([pricing](https://aws.amazon.com/rekognition/pricing/)) | `ModerationModelVersion` in every response |
| **Azure AI Content Safety** (image analysis) | Fixed hate, sexual, violence and self-harm severities | "No input texts or images are stored", data is not used for training, and it stays in the chosen region ([data privacy](https://learn.microsoft.com/en-us/legal/cognitive-services/content-safety/data-privacy)) | $0.00075, i.e. $0.75 per 1k in West Europe ([Azure retail prices API](https://prices.azure.com/api/retail/prices)); the free tier gives 5,000 per month | Not checked `[unknown]` |

`[inferred]` A vision LLM through the AI Gateway fits best on paper:

- One vendor relationship (Vercel, already a subprocessor) and ZDR per request.
- Our own question wording, matching the Jev questions.
- Pinned model IDs.

Azure Content Safety has the cleanest data terms of the fixed-taxonomy services. OpenAI
moderation is free but its versioning hurts eval comparability. Rekognition needs an
org-level opt-out before its terms match ours.

## 7. Data terms and known weaknesses

### Data terms (TypeSafe)

`[verified]` unless marked otherwise:

- **No training:** "We will not train or fine tune any artificial intelligence or
  machine learning models on your prompts or other Input."
  ([privacy policy](https://typesafe.ai/legal/privacy-policy)) "Jev is not trained on
  customer requests or responses." ([Models](https://docs.typesafe.ai/models.md#data-handling))
- **Location:** "The Services are hosted in the United States."
  ([privacy policy](https://typesafe.ai/legal/privacy-policy))
- **DPA:** [typesafe.ai/legal/data-processing](https://typesafe.ai/legal/data-processing),
  last updated 2026-04-24.
  - It incorporates EU SCCs Module 2.
  - Retention is "as long as necessary taking into account the purpose".
  - Subprocessors are listed at `trust.typesafe.ai/subprocessors`. That page renders
    client-side and could not be read `[unknown]`.
- **ZDR, direct:** "for enterprise customers. Contact sales@typesafe.ai."
  ([Legal](https://docs.typesafe.ai/legal.md))
- **ZDR, through the Vercel AI Gateway:**
  - TypeSafe AI is listed as a ZDR and no-training provider. The quoted contract term:
    TypeSafe "shall not retain (a) prompts … for any longer than is necessary to
    generate Output … and (b) Output for any longer than necessary to … fulfil its
    obligations". ([gateway ZDR](https://vercel.com/docs/ai-gateway/capabilities/zdr))
  - The gateway model list marks `jev-1.13.0` and `jev-1.14.0` `zdr: "all"`, but the
    `typesafe-ai/jev` alias only `zdr: "some"`.
    ([gateway list](https://ai-gateway.vercel.sh/v1/models))
  - **This is the most direct route to the map's "zero retention or message
    categorization drops" gate.** `[inferred]` Whether the team's Vercel plan is Pro
    or Enterprise is `[unknown]`.

### Known weaknesses

- **HiddenLayer**, 2026-10-14 ([report](https://www.hiddenlayer.com/research/system-one-model-security)):
  - TokenBreak-style character perturbations of 30 toxic prompts lowered
    `is_toxic` scores "across many of the prompts". The report gives no success rates,
    no Jev version and no non-English results.
  - Indirect prompt injection steered a browser agent.
  - Their advice: "Using a System One model does not automatically negate the risk of
    prompt injection."
  - InfoWorld adds that TypeSafe did not respond.
    ([InfoWorld](https://www.infoworld.com/article/4236103/typesafes-jev-even-more-susceptible-to-attack-than-llms-says-security-vendor.html))
- **TypeSafe's own admission**
  ([jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)): "State is data,
  and `jev-1.13` does not treat it as hostile by default. Content written to
  adversarially steer the model … can move the answer." That page also lists
  literal reading, choice-order bias and context rot.
- **Since then** `[third-party]`, via [NeuralTrust](https://neuraltrust.ai/es/blog/jev-typesafe-ai-security),
  which did not run tests itself:
  - A fake "pre-approved" note lowered a block probability from 0.76 to 0.48.
  - An "ignore the discussion above" injection dropped accuracy on a debate task from
    96.5% to 26.5%.
  - None of these results is from TypeSafe or reproduced.
  - For user-written captions and comments `[inferred]`, the same thing would look like
    a caption that argues for its own innocence.

## 8. What a short live probe would settle

Use the user's early-access key. Never commit it. Each item is about 30 minutes.

1. **Norwegian quality.**
   - Build a labelled set of about 60 short texts: 20 Bokmål, 20 Nynorsk, 20 English.
     Use parallel translations of the same items, a mix of benign, rude and abusive,
     with some code-switched nb/en and dialect or slang.
   - Run the same Noul and Choice questions (harassment, sexual content, spam, Message
     Category). Write the questions in English, then repeat with Norwegian `instructions`.
   - Compare accuracy and mean confidence per language. This settles whether Norwegian
     is usable, and whether the instruction language matters.
2. **Version echo.** Send `jev-latest` and then `jev-1.14.0`, directly and through the
   gateway. Check what `model` comes back: an alias, a pinned ID or a dated build.
3. **Determinism.** Send the identical request 10 times. Measure label flips and the
   spread of the probabilities. This decides whether evals need repeats.
4. **Images.**
   - Send one real Wall Post-sized JPEG with the header to `jev-1.14.0`.
   - Record `usage.input_tokens`, which gives the price per image, and the latency.
   - Run a few people-photo moderation questions.
   - Repeat through `experimental_evaluate` on the gateway to see whether assets and the
     header pass through.
5. **Rate limits.** Read the org's tokens/s and requests/s from the console.
6. **Latency from Europe.** Call from a Vercel function in our region.
7. **Evasion.** Send TokenBreak-style perturbed Norwegian and English insults, and a
   caption that argues for its own innocence. Compare the scores against the clean
   versions.
8. **Choice order.** Shuffle the Message Category options. Measure how often the answer
   changes.
9. **Terms.** Ask TypeSafe whether the early-access account is covered by the DPA and
   ZDR directly, or only through the gateway.
