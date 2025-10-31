# Cloud Native Bergen — Privacy Operations Playbook (Norway / GDPR)

Purpose: This playbook complements your public Privacy Policy and gives organizers a practical, repeatable way to run privacy-safe conferences and meetups in Norway under GDPR and Norwegian law. It covers planning, execution, and post‑event steps for all stakeholder groups: attendees, speakers, sponsors, volunteers, contractors, subprocessors, and organizers.

This document is guidance, not legal advice. When in doubt, consult counsel. Localize public-facing text to Norwegian where appropriate.

---

## 1) Scope, roles, and legal framing

- Controller: Cloud Native Bergen (non‑profit in Norway).
- Supervisory authority: Datatilsynet (Norway).
- Legal bases used (typical; verify per activity):
  - Contract (Art. 6(1)(b)): ticketing, speaker participation logistics, sponsor deliverables.
  - Legitimate interests (Art. 6(1)(f)): event security, access control, analytics, photography for documentation, limited operations communications. Perform and document an LIA.
  - Consent (Art. 6(1)(a)): marketing communications and specific media uses beyond core event purpose.
  - Legal obligation (Art. 6(1)(c)): accounting/financial retention.
  - Special categories (Art. 9): avoid collecting health/dietary/allergy data where possible. If needed for accessibility/catering, use explicit consent, collect minimally, and restrict access.
- International transfers: If using providers outside the EEA (e.g., third‑party video platforms based in the US), implement SCCs and a Transfer Impact Assessment (TIA). Third‑party video platforms typically act as independent controllers for published videos.
- Age of digital consent in Norway: 13. Obtain verifiable parental consent if offering information society services to children under 13.

### Norway/Nordic specifics

- Datatilsynet guidance: Align with Norwegian DPA guidance on transparency, DPIA screening, and DSR timelines.
- Cookies and tracking (ekomloven § 2-7 b): Require opt‑in consent for non‑essential cookies; no pre‑ticked boxes; equal choices; log consent. Gate non‑essential embeds behind consent and prefer privacy‑enhanced/no‑cookie embed modes where feasible.
- Language: Provide public notices in Norwegian and English; Norwegian should be available on‑site and online for core notices.
- Analytics: Prefer privacy‑friendly analytics or configure IP anonymization and EU hosting. Be mindful of international transfer risks with certain analytics tools.
- Retention (bokføringsloven): Accounting records retained for 5 years.
- Nordic events: If events occur outside Norway, consult the local DPA’s guidance (e.g., IMY SE, Datatilsynet DK, Traficom FI) and adapt signage language accordingly.

---

## 2) Stakeholder data inventory and purposes

For each group, list typical data, purpose, legal basis, retention.

### A) Attendees

- Data: name, email, company, role/title, billing details (if paid), ticket type, dietary/accessibility notes (avoid where possible), check‑in status, optional newsletter consent, photos/recordings incidental to attendance.
- Purposes: registration, access control, safety, event communications, post‑event wrap‑up, optional marketing/newsletter.
- Legal bases: contract (ticketing), legitimate interests (security/ops), consent (newsletter).
- Retention: registration records 3–5 years; accounting 5 years per Norwegian bookkeeping rules; check‑in logs ≤ 12 months; marketing consent until withdrawn; photos/recordings per media policy below.

Note: CNB does not share attendee lists with sponsors and does not provide lead‑scanning services.

### B) Speakers

- Data: name, bio, photo, contact info, talk details, travel arrangement data (if applicable), media (recordings), bank details for reimbursements.
- Purposes: CFP selection, scheduling, logistics, publication of talk info and recordings, travel support if offered, reimbursements.
- Legal bases: contract (speaking engagement), legitimate interests (publishing talk info/recordings as core event output), consent (optional promotional uses beyond core publication), legal obligation (financial records).
- Retention: program archive indefinitely (talk title, abstract, speaker name/bio); raw recordings per media policy; financial records 5 years.

### C) Sponsors

- Data: company contact(s), logos/brand assets, deliverables tracking, invoicing/payment details.
- Purposes: fulfill sponsorship benefits, visibility on site/on‑site, accounting.
- Legal bases: contract, legitimate interests (ops), legal obligation (finance).
- Retention: contract and invoicing 5 years.

Note: CNB does not offer attendee lead‑scanning or attendee list sharing. Sponsors who collect personal data directly at their booths act as independent controllers and must provide their own notices and collect any required consents.

### D) Volunteers

- Data: name, contact info, shift schedules, emergency contact (minimize), role fit notes.
- Purposes: scheduling and operations, safety.
- Legal bases: contract/legitimate interests; consent where not strictly necessary.
- Retention: keep rosters ≤ 12 months; incident logs as required by safety rules; minimal archive for recognition if agreed.

### E) Contractors/Vendors

- Data: contact info, contract, access logs if needed, invoices.
- Purposes: execution of services.
- Legal bases: contract; legal obligation (finance).
- Retention: contracts and invoices 5 years; access logs ≤ 12 months.

### F) Subprocessors/Service providers

- Data processed: depends on service (ticketing, email, forms, video hosting, payment, cloud). Maintain an Article 30 record and DPAs.
- Legal bases: necessity for services; ensure SCCs/TIAs for non‑EEA providers.
- Retention: per service configuration; ensure deletion/return at contract end.

### G) Organizers

- Data: internal emails, planning docs, task systems. Ensure appropriate access controls and retention policies.

---

## 3) Conference lifecycle SOPs

### 3.1 Planning phase

- Map data flows (diagram) for registration, communications, content production, sponsorship, travel support.
- Update Article 30 Record of Processing Activities (ROPA).
- DPIA screening; conduct a DPIA if high risk (e.g., extensive profiling, special category data, systematic monitoring).
- Vendor due diligence: collect DPAs, confirm SCCs/TIAs for non‑EEA transfers (video platform provider, email/CRM, ticketing, analytics).
- Draft/update: Privacy Policy, Cookie Banner/Policy (ekomloven‑compliant), Photography & Recording Notice, Speaker Agreement/Media Release.
- Configure systems for data minimization and retention timers (ticketing export retention, CRM suppression lists, file storage structure with retention labels).
- Define access control model (who can access attendee lists, speaker docs, financial data). Enforce least privilege.
- Security prep: password manager, MFA, shared vaults, SSO where possible; incident response plan and contact tree.
- On‑site plan: signage placement, consent tokens (e.g., lanyard stickers), no‑filming zones, press/media brief.
- Children/minors handling policy (avoid collection; if present, parental consent and additional safeguards).
- Train organizers/volunteers on privacy procedures, especially handling recording opt‑outs and basic data minimization.

### 3.2 Execution phase (event days)

- Check‑in: limit access to attendee lists; avoid printing PII on badges beyond name/org. Separate invoice data from check‑in.
- Photography/recording: display entrance signage; verbally remind at session starts; respect no‑filming areas; provide a discreet opt‑out mechanism and seating.
- Media handling: centralize storage; name files consistently; restrict raw footage access; log who accesses/edits.
- Speaker relations: confirm on-site that media consent/terms are understood; provide a way to request redactions.
- Safety/security: handle incidents per plan; document only necessary facts; avoid sensitive details in open channels.

### 3.3 Post‑event

- Publish content: review recordings for removals/blur requests; add video descriptions/metadata with privacy info and contact; consider disabling precise location and moderate comments.
- Video embeds: when embedding videos on the CNB website, use privacy-preserving embed modes:
  - YouTube: use `youtube-nocookie.com` domain which does not set tracking cookies until the user plays the video
  - Vimeo: include `dnt=1` (Do Not Track) parameter to disable tracking
  - These measures reduce passive tracking while preserving full video functionality
- Data minimization: delete unused drafts, duplicate exports, and raw data beyond retention; move canonical archives to controlled storage.
- DSRs: run the intake process; verify identity; coordinate across systems; respond within 30 days.
- Retention enforcement: implement the schedule below; set calendar tasks or automation for deletions.
- Review: run a post‑mortem on privacy issues; update this playbook and training.

---

## 4) Retention schedule (baseline)

Adjust as needed; document exceptions.

- Registration (name, email, ticket, check‑in): 12 months after event
- Accounting/finance (invoices, reimbursements): 5 years (Norwegian law)
- Marketing consent logs: duration of consent + 24 months inactive, then delete or re-permission
- Speaker program archive (talk title, abstract, speaker name/bio): indefinitely (archival/public interest)
- Raw video/photo assets: 12–24 months, then keep only mastered/publication versions needed for archive
- Safety/incident logs: 3 years unless legal need requires longer

---

## 5) Data subject requests (DSR) SOP

- Intake: use the template in Appendix C (web form/email alias like [privacy@cloudnativebergen.dev](mailto:privacy@cloudnativebergen.dev)). Accept access/erasure/rectification/objection/portability/restriction requests.
- Verify identity: email challenge to registered address, or reasonable verification for other channels.
- Triage: log request, category, deadline (30 days), systems to search (ticketing, email/CRM, file storage, video platform).
- Evaluate exceptions: legal obligations (accounting), freedom of expression and information for published content, overriding legitimate interests.
- Execute: collect data, redact third‑party info, provide machine‑readable export where required; delete/suppress as applicable; inform subprocessors.
- Respond: clear language; note what was done and why; provide appeal path to Datatilsynet.

---

## 6) Subprocessor register (examples)

Maintain a live register with purpose, data types, location, DPA link, SCC/TIA status, retention controls.

- Ticketing/registration: [provider]
- Email/newsletter: [provider]
- Payment: [provider]
- Cloud storage: [provider]
- Analytics: [provider]
- Video platform: [provider] — may act as an independent controller for published content; ensure appropriate SCCs/TIA for any related processing; link to provider's privacy notice.

---

## 7) Media policy — recordings and photos (third‑party platforms)

- Transparency: Announce prominently that sessions will be recorded and published on your official online video channels/platforms. Include signage and website notice.
- Legal bases:
  - Speakers: contract + legitimate interests to publish talks; optional consent for broader promotional use.
  - Attendees: legitimate interests for documenting the event; provide meaningful opt-out (no‑filming areas, blur on request for close-ups not essential to content). Avoid focusing on identifiable attendees without consent.
- International transfers: Publishing on third‑party platforms may involve transfers outside the EEA; document SCCs/TIA; link to the platform provider’s privacy notice.
- Safeguards: minimize audience shots; avoid capturing special category data; honor opt‑out indicators; enable comment moderation.
- Takedown/redaction: publish a simple process for requests; evaluate freedom-of-expression exceptions for talk content.

---

## 8) Security basics

- MFA and role‑based access for all systems.
- Shared credentials only via a password manager; rotate after event.
- Use organizational accounts, not personal, for content channels (video platform) and ticketing.
- Encrypt devices; avoid storing exports on personal laptops if possible; use shared, access‑controlled storage.
- Incident response: see Appendix F.

---

## 9) Subprocessor onboarding and change management

Use this section when introducing a new service provider (subprocessor) or expanding the purposes or scope of processing with an existing provider.

Checklist (before onboarding):

- Purpose fit: Define the precise purpose(s) and data categories; confirm necessity and data minimization.
- DPIA screening: Screen for high risk; run a DPIA if criteria met (e.g., systematic monitoring, special categories, large‑scale profiling).
- DPA & terms: Execute a GDPR‑compliant Data Processing Agreement (Art. 28). Confirm roles (processor vs. independent controller), instructions, confidentiality, security, assistance with DSRs, subprocessing approval, and deletion/return of data at end of service.
- International transfers: Identify data locations; if outside EEA, put SCCs in place and complete a Transfer Impact Assessment (TIA). Check encryption at rest/in transit and key management.
- Security due diligence: Review provider’s security posture (SOC 2/ISO 27001 if available), access controls, MFA support, audit logs, incident response, vulnerability management, and breach notification timelines.
- Access control: Define least‑privilege roles; use SSO/MFA; restrict exports; log access.
- Retention & deletion: Ensure configurable retention and verified deletion; test export and deletion procedures.
- Vendor risk: Record in the vendor register with owner, risk rating, and review cadence.

Change management (after onboarding):

- Material change triggers: new data categories, new purposes, new regions/locations, sub‑subprocessors, or product feature changes that affect privacy.
- Re‑assess: update ROPA, DPIA (if needed), SCCs/TIA, and DPA if scope changes.
- Communication: update privacy notices if impact to data subjects; schedule internal training for changed workflows.
- Exit plan: document how to migrate/export and delete data; verify deletion certificates on termination.

See Appendices G and H for a sample onboarding questionnaire and a lightweight ROPA entry template.

---

## Appendices (templates)

### Appendix A: Entrance signage (short form)

English:

“We are recording photo and video at this event. Talks will be published on our official video channels/platforms. By entering, you acknowledge this. If you prefer not to be recorded, please speak to staff for seating options and a no‑filming area. Privacy contact: [privacy@cloudnativebergen.dev](mailto:privacy@cloudnativebergen.dev).”

Norwegian (draft – localize as needed):

“Vi tar bilder og gjør opptak av foredrag under arrangementet. Foredrag publiseres på våre offisielle videokanaler/plattformer. Ved å gå inn godtar du dette. Gi beskjed til våre frivillige hvis du ikke ønsker å bli filmet; vi har egne soner uten filming. Kontakt for personvern: [privacy@cloudnativebergen.dev](mailto:privacy@cloudnativebergen.dev).”

Long‑form poster (link via QR): see Appendix B/C references.

### Appendix B: Speaker media release (core terms)

- Grant: Speaker grants CNB the right to record, edit, and publish the talk (video, audio, slides) on CNB channels, including official online video platforms.
- License: Non‑exclusive, worldwide, perpetual license to host and share the recording for educational and promotional purposes related to CNB events.
- Moral rights: Credit will be given; speaker retains underlying IP in their materials.
- Warranties: Speaker confirms they have rights to present included material.
- Optional consents: Speaker may opt‑in to broader promotional use (e.g., short social clips).
- Takedown: CNB will consider reasonable takedown or redaction requests, balancing freedom of expression and documentation interests.
- Data and privacy: Processing details and contact for queries.

Include checkboxes in the CFP/acceptance flow:

- [ ] I agree that my talk will be recorded and published on CNB’s official online video channels/platforms.
- [ ] I consent to the creation of short promotional clips from my talk.

### Appendix C: Data subject request (DSR) intake form

- Name:
- Email used for registration:
- Request type: access / rectification / erasure / restriction / objection / portability
- Event(s) affected:
- Details:
- Identity verification method:

Submit to: [privacy@cloudnativebergen.dev](mailto:privacy@cloudnativebergen.dev)

### Appendix D: Subprocessor register template

- Service name:
- Purpose:
- Data categories:
- Location / transfer mechanism:
- DPA link:
- SCCs/TIA status:
- Retention controls:
- Contact at provider:

### Appendix E: Transfer Impact Assessment (TIA) — Third‑party video platform (outline)

- Description: Publication of conference talk recordings to a third‑party video platform channel; public content; viewers worldwide.
- Roles: CNB as controller for creation/upload; the platform provider as an independent controller for hosting/publication.
- Data: personal data in videos (speakers; incidental attendees); channel/account metadata.
- Transfer: outside the EEA (e.g., to the US); SCCs where applicable; public availability may reduce some transfer risk; assess third‑country law access risks; document residual risk and mitigations (minimize audience capture, opt‑outs, blur on request).
- Public interest/freedom of expression: balance where applicable.

### Appendix F: Incident response checklist

- Detect and contain (limit access, isolate systems)
- Assess scope and affected data
- Decide notification obligations (Datatilsynet and data subjects where required) within 72 hours for notifiable breaches
- Remediate and recover; rotate credentials; patch systems
- Document incident and lessons learned; update training and SOPs

---

### Appendix G: Subprocessor onboarding questionnaire (sample)

Use this to collect key facts before signing.

- Company name, contact, DPA URL
- Role (processor/controller), purpose(s) of processing
- Data categories processed; data subjects
- Storage/processing locations; transfers; SCCs/TIA status
- Security certifications (ISO 27001, SOC 2), penetration tests, audit reports
- Access controls (RBAC), MFA/SSO support, audit logging
- Encryption (in transit/at rest), key management
- Sub‑subprocessors (list + locations)
- Data retention controls; deletion on termination; backups handling
- DSR assistance capabilities (export, deletion)
- Incident response SLAs and breach notification timeline
- Business continuity and disaster recovery

### Appendix H: ROPA entry template (lightweight)

- Processing activity name:
- Controller: Cloud Native Bergen
- Purpose(s):
- Categories of data subjects:
- Categories of personal data:
- Recipients (including processors/subprocessors):
- International transfers (locations + mechanism):
- Retention schedule:
- Security measures (high level):
- Legal basis:

---

## Public‑facing privacy notice — suggested clause for recordings and online publication

“Recordings and publication. We record conference sessions and publish talks on our official online video channels/platforms. The legal basis for speakers is our speaking agreement and our legitimate interest in documenting and sharing the event. For attendees, our legitimate interest allows incidental capture; we provide no‑filming areas and will honor reasonable requests for removal or blurring where feasible. Publication on third‑party platforms may involve transfers outside the EEA; we rely on standard contractual clauses and have assessed transfer risks. You can read more in our Privacy Operations Playbook and contact us at [privacy@cloudnativebergen.dev](mailto:privacy@cloudnativebergen.dev).”

Add a link to this playbook from your website privacy page.
