# Agent-Friendly API Considerations

## Context

Primary target: users handing an API key to an autonomous agent so it can read arbitrary files. The API needs to fit naturally into tool-use patterns (Claude, OpenAI function calling, LangChain, etc.).

## MCP Server

Offer an official MCP server that wraps our API. Handles polling, caching, quota checks, and retries internally — agents see a single `convert_document` tool with request-response semantics. Better than a sync HTTP endpoint because it works with any MCP-compatible agent without us maintaining blocking connections server-side. Reducto already does this.

## JSON Body with Base64 Input

Accept `{ "file": "<base64>", "filename": "doc.pdf" }` as an alternative to multipart form upload. Multipart is awkward in agent tool definitions.

## Quota Remaining on Every Response

Return `X-Quota-Remaining-Bytes` header on 202 and 200 responses. Cheap (one Redis read we're already doing) and saves agents a round-trip before each submission.

## Structured Errors

Return a machine-readable `error_type` field (e.g. `quota_exceeded`, `unsupported_format`, `timeout`) alongside `detail`. Include `Retry-After` header on rate limits.

Not doing partial results on timeout — agents can't interpret them reliably, and page-level chunking reduces timeouts in the first place.

## Output Format

Not adding frontmatter or page markers — metadata stays in the JSON response envelope, not mixed into the markdown output. Not adding language detection — agents consuming text don't need it.

## Archive Support

Not supporting archives in the gateway — it creates a pricing incentive to zip everything (cheaper ingress, more work for us). The MCP server or SDK can handle client-side extraction: unzip locally, submit each file individually, collect results. Users pay the real cost per file.

## Post-Job Delivery

### Webhook
POST a signed download URL to a user-specified callback URL. The core primitive for agent-to-agent flows — Agent A submits, Agent B receives.

Authentication: JWT signed with the user's secret (provided at webhook registration). The secret never travels over the wire; the recipient verifies authenticity via signature, with replay protection via `iat`/`exp` claims. Same approach as Stripe and Svix.

Needs retry with exponential backoff on delivery failure.

### S3/Blob Upload
User provides a pre-signed upload URL at submission time. We PUT the result to it — no credentials to store, no IAM roles, works with any S3-compatible storage. The user's agent can generate the pre-signed URL as part of the submission flow.

### Email
Email the result with a user-defined message. Relevant for both humans and agents — agents with MCP email tools (Claude, Devin, etc.) can receive and read emails. We already have email infrastructure. Low complexity.

### Competitor Reference
- **LlamaParse**: Sync SDK wrapper over polling, no delivery actions, agent skills for coding assistants.
- **Reducto**: Webhooks (basic + Svix enterprise), MCP server, cloud storage for VPC deployments.
- **Unstructured**: Batch results to remote storage, databases, and vector stores. Pipeline/ETL oriented.
