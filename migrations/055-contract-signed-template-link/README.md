# 055: contract-signed template no longer says "attached"

Issue #1264. The organizer's **Send signed copy** links the stored signed document (a card under the body) and attaches nothing; the seeded `contract-signed` template (036) still says the agreement "is attached to this email". The confirmation the signing flow sends at signature time is a different path and still attaches the PDF.

## What it writes

For every `sponsorEmailTemplate` with slug `contract-signed`, it rewrites the one body span whose text is **exactly** the seeded sentence to "You will find a copy of the signed agreement with this email for your records." — true both for the organizer's Send signed copy (a link card under the body) and for the signing flow's own confirmation (the PDF attached), which share this template. An edited sentence is the organizer's and is never touched. Compare-and-set on the document's revision. Idempotent.

## Run

Not run automatically. `npx sanity migrate 055-contract-signed-template-link` (dry run), then with `--no-dry-run`. Until it is run, edit the template in Studio before using Send signed copy.
