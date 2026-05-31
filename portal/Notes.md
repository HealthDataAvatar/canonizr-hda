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
- We have duplicated things like CopyButton
- request-table is a total mess of code