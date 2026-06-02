# Portal Notes

## Quotas & Billing
- Still need a way to assign and alter quotas per API key
- Users should start with a default API key that fits inside the free quota
- When we create a key it has a default quota but we can change that without friction (slider? just some sensible orders-of-magnitude defaults?)
- Need a global quota as well (more configurable)
- Do we have checks for stripe billing setup before we let people go over the free budget?
- Default key quota should be 1GB?

## Visual polish
- The code examples could probably be split into "submit" and "request" snippets — review new quickstart first

- Need to structure our API so that downloading well-named variants of your job's files is easy to extend (e.g. downloading the redacted version in future)

##
- Portal should connect to the tables using managed identity
- Everything should be using managed identity for redis
- We have duplicated things like CopyButton
- request-table is a total mess of code
- The list of jobs completed should indicate when the artefacts will be deleted
- DNS!
- Add portal.canonizr.com to the APIM CORS so we can use the playground
- Page re-renders generate a new random API key each time
- How do users know they've been blocked?
- Email on completion - either notification of which job (and the polling link), or a passwordless download link for exactly that file (need to validate email before delivery?), need to add a forward message for A2A so you can have it continue the instruction on arrival. Scoped by key?
- Send to S3 bucket (or Google drive?)
- Allow inputting URLs to the playground (no: CORS and SSRF)
- There's a lag on loading the API and playground pages. Is it fetching something heavy for the API keys?
- Mobile view isn't adaptive
- The actual key column should come first, it's what people are there for
- 504: docling service timeout (for a 10MB pdf) -- can split into pages first?