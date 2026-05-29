# Portal Notes

## Done
- ~~Tab-select should use our orange colour~~
- ~~Dashboard can go~~
- ~~QuickStart needs to be simpler - just the request and then the fetch, don't provide a loop~~
- ~~We don't need a "show code examples" link after creating a key. Dismiss can become an X in the top right~~
- ~~The delete action is aggressive, so is rotate. Replace with icon buttons.~~
- ~~Infinity icon needs a tooltip in case people don't recognise it~~
- ~~The table sorting is odd - "don't sort by Time" is the same as "sort descending by time" because it's our default key, isn't it?~~
- ~~Why don't we allow showing keys again? We allow creating new ones without a check, which is just as dangerous. So make them copyable?~~
- ~~Refactor billing and usage into billing + history pages~~
- ~~Billing page: stat cards, prominent manage billing, invoices~~
- ~~Key name validation (duplicates, bad chars, length)~~

## Quotas & Billing (needs design)
- Still need a way to assign and alter quotas per API key
- Users should start with a default API key that fits inside the free quota
- When we create a key it has a default quota but we can change that without friction (slider? just some sensible orders-of-magnitude defaults?)
- Need a global quota as well (more configurable)
- Do we have checks for stripe setup before we let people go over the free budget?
- Default key quota should be 1GB?

## Visual polish
- We don't make much use of our bright orange. Maybe that should be our default main button colour?
- The code examples could probably be split into "submit" and "request" snippets — review new quickstart first

- Need to structure our API so that downloading well-named variants of your job's files is easy to extend (e.g. downloading the redacted version in future)