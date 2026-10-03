# 055: contract-signed template says "linked", not "attached"

Issue #1264. The organizer's **Send signed copy** links the stored signed document (a card under the body) and attaches nothing; the seeded `contract-signed` template (036) still says the agreement "is attached to this email". The confirmation the signing flow sends at signature time is a different path and still attaches the PDF.

## What it writes

For every `sponsorEmailTemplate` with slug `contract-signed`, it rewrites the one body span whose text is **exactly** the seeded sentence to "A copy of the signed agreement is available at the link below for your records." An edited sentence is the organizer's and is never touched. Compare-and-set on the document's revision. Idempotent.

## Run

Not run automatically. `npx sanity migrate 055-contract-signed-template-link` (dry run), then with `--no-dry-run`. Until it is run, edit the template in Studio before using Send signed copy.
