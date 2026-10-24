# TypeSafe data terms for Jev

Research for [#1565](https://github.com/CloudNativeBergen/website/issues/1565), under the map [#1564](https://github.com/CloudNativeBergen/website/issues/1564). Sources read on 2026-10-25. Legal pages change, so check the "Last updated" dates before relying on this.

**The bar:** a DPA plus no training on our data. If zero retention is not available, message categorization drops out of scope.

**Data involved:** anonymous attendee feedback comments, short Wall Post captions, and private speaker↔organizer messages. These are Norwegian conferences, so EEA and GDPR apply.

## Verdict

| Bar                     | Direct TypeSafe API                                                                                                                                                                                                                                                                      | Via OpenRouter                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| DPA                     | **Yes.** Incorporated into the Master Customer Agreement by reference. There is no separate signature and no plan restriction.                                                                                                                                                           | **Yes, with OpenRouter.** We would have no contract with TypeSafe.                                                     |
| No training on our data | **Yes**, for model weights. Two caveats: a perpetual "Telemetry" licence, and evaluation is not addressed.                                                                                                                                                                               | TypeSafe's terms apply upstream. OpenRouter keeps nothing unless we opt in.                                            |
| Zero retention          | **Only on request.** The docs say ZDR is for "enterprise customers", while the enterprise page says companies can get it "on request". Whether a small organization qualifies, and what it costs, is **unknown**. The default retention is "as long as necessary", with no number given. | **OpenRouter lists both Jev endpoints as ZDR-eligible**, but OpenRouter does not guarantee that the provider complies. |
| Data location           | US only. Not EU-based. Transfers rely on SCCs.                                                                                                                                                                                                                                           | US. Jev is not available on OpenRouter's EU in-region routing.                                                         |

**In short:** TypeSafe meets the DPA and no-training bar on paper. Zero retention exists but is gated behind a sales conversation, and nothing public says a small organization can get it. Until TypeSafe confirms ZDR for our account in writing, message categorization should be treated as **out of scope** on the direct route. The OpenRouter route is labelled ZDR today, but that rests on a representation TypeSafe made to OpenRouter, which we cannot see.

## Who TypeSafe is

- The legal entity is **TypeSafe AI, Inc.** ([Privacy Policy](https://typesafe.ai/legal/privacy-policy)), at 255 California St, Suite 1300, San Francisco ([Terms of Use §12](https://typesafe.ai/legal/terms)). The Master Customer Agreement is governed by California law, with San Francisco courts and binding arbitration ([MCA §15, §16.2](https://typesafe.ai/legal/mca)).
- **TypeSafe is not EU-based**, and it has no EU representative that we could find. Its privacy policy says "The Services are hosted in the United States", and that users in the EEA "are transferring your personal data outside of those regions to the U.S." ([Privacy Policy, International Visitors](https://typesafe.ai/legal/privacy-policy)).
- The enterprise FAQ answers "Where is our data processed?" with "All data is currently processed in the US." It also says Jev is "currently available only through our hosted API", so there is no VPC or on-prem option ([Enterprise](https://typesafe.ai/enterprise); the FAQ answers render only when expanded).
- TypeSafe reports SOC 2 Type II. The report is available on request through the trust center ([Trust Center](https://trust.typesafe.ai/)).

## Q1: Is there a DPA, and can a small organization sign it?

- **Yes.** The Master Customer Agreement (updated 23 Sep 2026) says: "The terms of the Data Processing Agreement currently available at https://typesafe.ai/data-processing are incorporated herein by reference" ([MCA §4.4](https://typesafe.ai/legal/mca)). That URL redirects to [/legal/data-processing](https://typesafe.ai/legal/data-processing).
- The MCA binds anyone who accepts it "by clicking a box", by executing an order, or by "using (or making any payment for) any Services". It covers entities as well as individuals ([MCA preamble](https://typesafe.ai/legal/mca)). **No public text requires a separate signature or limits the DPA to a particular plan.** So a small organization that accepts the MCA is covered by the DPA.
  - **Unknown:** whether early-access accounts accepted the MCA at sign-up. The user's account should confirm which agreement it accepted.
- What the DPA (updated 24 Apr 2026, [legal/data-processing](https://typesafe.ai/legal/data-processing)) contains:
  - **Roles.** The customer is controller and TypeSafe is processor (§1.1). If the DPA and the MCA conflict, the DPA controls (§1.3).
  - **Purpose limitation.** TypeSafe will not "retain, use, or disclose Customer Personal Data for any purpose other than in accordance with the Documented Instructions" (§2.2). The Documented Instructions include the Agreement itself (§2.1), and that brings in the Telemetry licence under Q4.
  - **Subprocessors.** General authorization, with the list at [trust.typesafe.ai/subprocessors](https://trust.typesafe.ai/subprocessors). Customers get "reasonable advance notice" of new subprocessors and have 15 days to object (§3).
  - **Breach notice** within 72 hours (§5.2). **Audits** at most once every 12 months, at the customer's cost (§5.3). Help with data-subject requests and DPIAs, for which TypeSafe "may charge … a reasonable fee" (§4).
  - **Transfers.** EU SCCs, Module 2 (and Module 3 where it applies), under Irish law with Dublin courts (§6.1–6.2). There is also a UK Addendum (§6.3). The competent authority for EEA data subjects is Ireland's (Schedule I §10).
    - Wording note, not a legal conclusion: §6.2 speaks of transfers "from the European Union", while Schedule I speaks of the EEA. Norway is not named.
- **The transfer basis is SCCs, not the EU–US Data Privacy Framework.** The DPA does not mention DPF. A search for "TypeSafe" on [dataprivacyframework.gov](https://www.dataprivacyframework.gov/searchresults?search=TypeSafe) returned no results.

## Q2: Where is the data processed and stored?

- **In the US.** See the [Privacy Policy](https://typesafe.ai/legal/privacy-policy) and the [Enterprise FAQ](https://typesafe.ai/enterprise).
- Subprocessors listed on the [trust center](https://trust.typesafe.ai/subprocessors), 14 in total:
  - **AWS (USA):** "Customer information for live requests is stored and processed on databases, caches and compute nodes within AWS."
  - **Modal, Nebius, CoreWeave (USA):** "Customer AI prompts are processed, but not stored". Nebius and CoreWeave were added on 3 Oct 2026.
  - **Slack, Google Workspace, Pylon (USA):** support channels.
  - **Microsoft Azure, Cloudflare, Google Cloud Platform, Stytch:** marked "Worldwide".
  - **WorkOS, Loops, ClickHouse:** no location given.
- The "Worldwide" entries, and ClickHouse listed as "data warehousing", sit awkwardly with the FAQ's "all data … in the US". **What ClickHouse holds is unknown** (it could be request logs, telemetry or billing data).

## Q3: Retention

- **The default has no number.** The DPA says: "Customer Personal Data will be retained for as long as necessary taking into account the purpose of the Processing…" ([DPA Schedule I §8](https://typesafe.ai/legal/data-processing)). The privacy policy says: "as long as reasonably necessary to provide you with the Services, or otherwise in support of our business or commercial purposes" ([Privacy Policy, Retention](https://typesafe.ai/legal/privacy-policy)).
- The MCA lets TypeSafe use Customer Data "in perpetuity" for three purposes: "(i) to derive and generate Telemetry, (ii) to monitor for fraud and abuse of the Services, and (iii) as necessary to comply with applicable Laws" ([MCA §4.1(c)](https://typesafe.ai/legal/mca)). Confidential information "may be retained in TypeSafe's standard backups" (§10.3).
- **Logs: unknown.** No public text says how long request logs keep inputs or outputs. The trust center lists the controls "Data retention procedures established" and "Customer data deleted upon leaving", without details ([Trust Center](https://trust.typesafe.ai/)).
- **Zero data retention is available, but not by default:**
  - The docs say: "We also offer zero data retention (ZDR) for enterprise customers. Contact sales@typesafe.ai to learn more." ([docs: Legal](https://docs.typesafe.ai/legal); repeated on [docs: Models, Data handling](https://docs.typesafe.ai/models)).
  - The enterprise FAQ says: "Yes. Zero data retention is available to companies on request. Contact sales@typesafe.ai to enable it." ([Enterprise](https://typesafe.ai/enterprise)).
  - **Unknown:** whether a small, non-enterprise organization qualifies, whether it costs anything, whether ZDR also covers abuse-monitoring copies and Telemetry, and whether TypeSafe confirms it in writing (for example as an Order term).

## Q4: Training and evaluation

- **There is no training on inputs, in four places:**
  - Privacy Policy: "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input."
  - Privacy Policy again: TypeSafe "(1) will not train or fine tune any artificial intelligence or machine learning models on Input, and (2) will not disclose any Input to a third party other than our service providers" ([Privacy Policy](https://typesafe.ai/legal/privacy-policy)).
  - Enterprise FAQ: "We don't use your inputs or outputs to train our models." ([Enterprise](https://typesafe.ai/enterprise)).
  - Docs: "Jev is not trained on customer requests or responses." ([docs: Models](https://docs.typesafe.ai/models)).
- **The binding text is narrower.** TypeSafe "will not, include Customer Data in a dataset used to train (i.e., to modify the model weights of) any artificial intelligence or machine learning models without Customer's prior consent" ([MCA §4.1](https://typesafe.ai/legal/mca)). This is the opt-out in writing, and it is the default: no action is needed. It is written into the contract, but **only for weight updates**.
- **Telemetry is a gap.** "Telemetry" means "technical logs, hashes, summary statistics and classifications, metrics, and learnings related to Customer's use of the Services". "TypeSafe may Process Telemetry without restriction, including to improve the Services or TypeSafe's other products and services" ([MCA §4.3](https://typesafe.ai/legal/mca)). Telemetry is derived from Customer Data under a perpetual licence (§4.1(c)).
  - **Evaluation is not mentioned anywhere.** Nothing public says whether customer inputs, or "classifications" derived from them, may go into evaluation sets. Treat this as **unknown** and ask TypeSafe.
- **The Jev 1.14 debugging opt-in should stay off.** Jev 1.14 added "an opt-in to allow you to help find model jaggedness with your queries. We will still not train on your queries, but this does make it easier for us to find issues" ([Jev 1.14 post](https://typesafe.ai/blog/jev-1-14)). It is opt-in, so it is off by default. We should not turn it on.

## Q5: Do the early-access terms differ?

- **We found no separate early-access terms.** Jev launched "in early access" on 15 Sep 2026 ([launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev)). The current MCA (23 Sep 2026) and AUP (23 Sep 2026) contain no beta, preview or early-access clause ([MCA](https://typesafe.ai/legal/mca), [AUP](https://typesafe.ai/legal/acceptable-use-policy)).
- The docs list only three governing documents: the DPA, the MCA and the Privacy Policy ([docs: Legal](https://docs.typesafe.ai/legal)).
- **Unknown:** whether early-access invitations carried their own click-through terms. Only the user's account can show this.
- Experimental features are labelled in the docs rather than in the contract. Images and Box questions are "Dreamer-ready … not yet up to our standards to call ready for production", and are turned on with the `TypeSafe-Danger-Zone-Images` header ([docs: Images](https://docs.typesafe.ai/images)).
  - This matters for the map: the outside fact "Jev is text-only" is out of date. The models table still lists input as "Text" ([docs: Models](https://docs.typesafe.ai/models)).
- The Terms of Use (updated 19 Sep 2026) cover only the website. A "separate agreement" (the MCA) governs the products ([Terms of Use, intro](https://typesafe.ai/legal/terms)).

## Alternative route: OpenRouter

- **Jev is available on OpenRouter.** The model IDs are `typesafe/jev-1.13` and `typesafe/jev-1.14`. TypeSafe is the only provider. There is no waitlist and no TypeSafe account is needed ([OpenRouter tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/), [Jev hub](https://openrouter.ai/docs/guides/community/jev), [model endpoints API](https://openrouter.ai/api/v1/models/typesafe/jev-1.14/endpoints)).
- **Both Jev endpoints are on OpenRouter's ZDR endpoint list** ([`/api/v1/endpoints/zdr`](https://openrouter.ai/api/v1/endpoints/zdr), queried 2026-10-25).
  - Per [OpenRouter's DPA §2.4(b)](https://openrouter.ai/data-processing-agreement), being on that list "reflects the AI Model Provider's published or represented policy of 'no retention and no training' on zero-data-retention API payloads; it does not constitute OpenRouter's guarantee of AI Model Provider compliance."
  - OpenRouter says it "in some cases creates special agreements with providers" ([ZDR docs](https://openrouter.ai/docs/guides/features/zdr)). The terms between TypeSafe and OpenRouter are **not public**.
  - ZDR can be enforced per request (`provider.zdr: true`) or for the whole account ([ZDR docs](https://openrouter.ai/docs/guides/features/zdr)).
- **What OpenRouter itself keeps:**
  - It "does not store your prompts or responses" unless we opt in to logging or to product use; both are off by default ([Data Collection](https://openrouter.ai/docs/guides/privacy/data-collection)). It does store metadata such as token counts and latency.
  - The DPA confirms OpenRouter "will delete Inputs and Outputs promptly following generation", unless we opted into logging or the law requires otherwise (§2.4(a)).
- **OpenRouter's DPA** (updated 26 Aug 2026) is part of its Terms of Service, with no separate signing (preamble, §14). It includes SCC Module 2 under Irish law (§13.2).
  - It makes us responsible for "reviewing the data handling terms set forth in AI Model Terms" (§2.2).
  - It excludes AI Model Providers from new-subprocessor notifications (§5.2).
- OpenRouter's "Terms of Service" link for the TypeSafe provider points to TypeSafe's website **Terms of Use**, not the MCA ([provider page](https://openrouter.ai/provider/typesafe)).
- **There is no EU residency on this route.** EU in-region routing is limited to the Business and Enterprise plans ([In-Region Routing](https://openrouter.ai/docs/guides/features/in-region-routing)), and Jev is not EU-eligible anyway: the [models API](https://openrouter.ai/api/v1/models?region=eu&output_modalities=decisions) with `region=eu` returns no Jev model. The data still goes to TypeSafe in the US.
- **Trade-off:** we get ZDR without a sales conversation, and a DPA from a larger processor. In exchange, there is no contract with TypeSafe, and the no-retention claim rests on a representation we cannot read. The subprocessor registry would then list OpenRouter, with TypeSafe as its model provider.

## Open questions for TypeSafe (sales@typesafe.ai / privacy@typesafe.ai)

1. Can a small non-profit-style organization get ZDR on the direct API? At what cost? Can it be written into an Order?
2. Under ZDR, are inputs also kept out of abuse-monitoring copies, Telemetry and backups (MCA §4.1(c), §4.3, §10.3)?
3. Without ZDR, how long are inputs and outputs kept in logs, and where (ClickHouse? "Worldwide" subprocessors)?
4. Are customer inputs, or "classifications" derived from them, ever used for **evaluation** or validation sets?
5. Did early-access accounts accept the MCA, or other terms?
6. What does TypeSafe commit to for OpenRouter-routed traffic that puts it on OpenRouter's ZDR list?

## Sources

- TypeSafe: [MCA](https://typesafe.ai/legal/mca), [DPA](https://typesafe.ai/legal/data-processing), [Privacy Policy](https://typesafe.ai/legal/privacy-policy), [Terms of Use](https://typesafe.ai/legal/terms), [AUP](https://typesafe.ai/legal/acceptable-use-policy), [Enterprise](https://typesafe.ai/enterprise), [Trust Center](https://trust.typesafe.ai/), [Subprocessors](https://trust.typesafe.ai/subprocessors), [docs: Legal](https://docs.typesafe.ai/legal), [docs: Models](https://docs.typesafe.ai/models), [docs: Images](https://docs.typesafe.ai/images), [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [Jev 1.14 post](https://typesafe.ai/blog/jev-1-14)
- OpenRouter: [Jev tutorial](https://openrouter.ai/blog/tutorials/how-to-use-jev/), [Jev hub](https://openrouter.ai/docs/guides/community/jev), [ZDR](https://openrouter.ai/docs/guides/features/zdr), [Data Collection](https://openrouter.ai/docs/guides/privacy/data-collection), [Provider Logging](https://openrouter.ai/docs/guides/privacy/provider-logging), [In-Region Routing](https://openrouter.ai/docs/guides/features/in-region-routing), [DPA](https://openrouter.ai/data-processing-agreement), [ZDR endpoints API](https://openrouter.ai/api/v1/endpoints/zdr), [TypeSafe provider page](https://openrouter.ai/provider/typesafe)
- Secondary (context only, no data terms): [WPS blog](https://www.wps.com/blog/what-is-jev-typesafe-s-system-one-model-and-its-best-use-cases/)
