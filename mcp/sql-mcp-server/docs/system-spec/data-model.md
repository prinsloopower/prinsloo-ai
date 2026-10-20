# Data model — sql-mcp-server

A Deployment has no store of its own (ADR-004, ADR-006, ADR-007), so most entities here are **values**, not tables. Each one is a self-contained token or line, and its fields are what it carries. "Retention" is how long the value stays valid or kept. "Migration" is how a format change reaches values already issued.

Every token carries a format version `v`. A format change ships across two releases. Release N learns to read `v+1` but still issues `v`. Release N+1 issues `v+1` and still reads `v`. Every release therefore reads the version before and after the one it issues. Upgrading or rolling back one release at a time never voids a token. Rolling back two or more releases across a change does void tokens issued under the newer version, which means every Staff member signs in again and Created objects drop out of the Conversations that used them. The release notes of any release that raises `v` say so.

Keys come from the deployment secret (`SERVER_SECRET`, environments.md) through HKDF-SHA-256, with one label per use: `enc` for encrypted tokens (JWE, `dir` + `A256GCM`), `sig` for signed tokens (JWS, `HS256`), and `cookie`. Rotation is described in security.md.

Four entities are not domain terms: the OAuth values a stateless authorization server needs (Client registration, Authorization request, Authorization code, Refresh token). They exist to serve ADR-004, not as product concepts (D-050).

## Sign-in
Traces: R-009, R-017, J-002
The access token the Server issues once a Staff member completes Sign-in, presented as `Authorization: Bearer` on every MCP request. It is a JWE, so its contents are opaque to the AI tool.

| field | type | notes |
|---|---|---|
| v | integer | format version; 1 |
| sub | string | the Identity provider's subject for the Staff member; becomes the Audit record's Staff member identity |
| name | string | display name from the ID token (`name`, else `preferred_username`, else `email`); for Audit records only, never used in a decision |
| iss | string | the Identity provider issuer it came from; must equal the Deployment's `IDP_ISSUER` when presented |
| aud | string | the exact resource URL signed in to, Allow-list segment included (ADR-006); must equal the request's resource URL |
| client_id | string | the Client registration it was issued to |
| iat | integer | issue time, seconds |
| exp | integer | the ID token's `exp` (D-024), and never more than 24 hours after `iat` |

Retention: valid until `exp`, then useless. Nothing is stored, so there is nothing to delete. When a Staff member leaves, the Identity provider stops renewing them, and their last token expires within the 24-hour cap.
Migration: new; the walking skeleton issues none.

## Refresh token
Traces: R-009, J-002
A JWE that lets an AI tool renew Sign-in without the Staff member signing in again. Each renewal goes back to the Identity provider, so an account removed there cannot renew.

| field | type | notes |
|---|---|---|
| v | integer | 1 |
| sub, iss, aud, client_id | string | as in Sign-in; checked on use |
| idp_refresh | string | the Identity provider's own refresh token; absent if it issued none, in which case this token is not issued either |
| iat | integer | |
| exp | integer | 30 days after `iat`, or the Identity provider's refresh expiry if earlier and stated |

Retention: valid until `exp`. A renewal returns the same Refresh token, or, when the provider rotates its own, a new one with the same `exp` (D-071), so a chain of renewals ends 30 days after Sign-in. Earlier Refresh tokens stay valid until their `exp`, because without a store they cannot be refused (D-051).
Migration: new.

## Client registration
Traces: R-009, J-002
Who an AI tool is, as the Server knows it. There are two forms (ADR-004):
- **Client ID Metadata Document.** The `client_id` is an HTTPS URL. The Server fetches the document at that URL on every `/authorize` and `/token` call, under the fetch rules in security.md, and caches nothing.
- **Stateless dynamic registration.** `POST /register` returns a `client_id` that is a JWS carrying:

| field | type | notes |
|---|---|---|
| v | integer | 1 |
| redirect_uris | string[] | 1–5 entries; each `https://`, or `http://localhost`/`http://127.0.0.1` with any port |
| client_name | string | up to 100 characters; shown nowhere except the Server's operational log |
| iat | integer | |

Every client is public: `token_endpoint_auth_method` is `none`, and PKCE S256 is required.
Retention: a registration does not expire. It stops working when `SERVER_SECRET` rotates past its key (D-051).
Migration: new.

## Authorization request
Traces: R-009, J-002
What the Server must remember while the Staff member is away at the Identity provider. It is a JWE carried in the `state` parameter sent to the provider, paired with a `__Host-sqlmcp-auth` cookie (HttpOnly, Secure, SameSite=Lax, Path=/) holding a random 32-byte value.

| field | type | notes |
|---|---|---|
| v | integer | 1 |
| client_id | string | |
| redirect_uri | string | already checked against the Client registration |
| client_state | string | the AI tool's own `state`, returned unchanged |
| code_challenge | string | the AI tool's PKCE S256 challenge |
| resource | string | the resource URL being signed in to |
| idp_verifier | string | the Server's own PKCE verifier toward the Identity provider |
| nonce | string | sent to the Identity provider and checked in the ID token |
| cookie_hash | string | SHA-256 of the cookie value; the callback refuses a mismatch, which stops a sign-in started in one browser from completing in another |
| exp | integer | 10 minutes after issue |

Retention: 10 minutes. The cookie has the same Max-Age.
Migration: new.

## Authorization code
Traces: R-009, J-002
A JWE handed to the AI tool's redirect URI and exchanged at `/token`.

| field | type | notes |
|---|---|---|
| v | integer | 1 |
| sub, name, iss | string | from the verified ID token |
| client_id, redirect_uri, resource, code_challenge | string | all checked again at `/token` |
| id_exp | integer | the ID token's `exp`, which becomes Sign-in's `exp` |
| idp_refresh | string | optional; carried into the Refresh token |
| exp | integer | 60 seconds after issue |

Retention: 60 seconds. Single use cannot be enforced without a store. PKCE limits a stolen code to whoever also holds the verifier (D-051).
Migration: new.

## Allow-list
Traces: R-003, R-017, J-003
The `<encoded>` segment of the connector URL (ADR-006). Decoding is base64url, then raw DEFLATE, then UTF-8 JSON:

```json
{"v":1,"t":[["sales","orders"],["sales","customers",["id","name","region"]]]}
```

| field | type | notes |
|---|---|---|
| v | integer | 1 |
| t | array | entries of `[schema, table]` for every column of the table, or `[schema, table, [column, …]]` for named columns only |

Names are matched exactly against the Database catalog: case-sensitive on PostgreSQL, and by the Database's collation on MS SQL Server. Entries must name a schema, because an unqualified table would resolve differently per Database account. Duplicate entries merge. A malformed segment, an unknown `v` or a breached limit (operations.md) ends every Tool call that carries it in a Refusal of class `invalid_allow_list`, telling the Agent the connector URL is invalid (D-053). The Server never falls back to a partial reading. A URL with no `/a/<encoded>` segment is not invalid: it simply has no Allow-list (D-012).
Retention: none on the Server. It lives in Managed client configuration.
Migration: new. Version 2 will be read alongside version 1, as for tokens.

## Conversation
Traces: R-016, J-006
The Conversation token (ADR-007), a JWS returned by the create-table Typed tool and passed back by the Agent as an optional `conversation` input.

| field | type | notes |
|---|---|---|
| v | integer | 1 |
| sub | string | the Staff member it is honoured for; any other Staff member presenting it gets no Created objects from it |
| aud | string | the Deployment's origin, so a token from one Deployment is worthless on another |
| objs | array | Created objects, as `[schema, table]`, at most 50 |
| iat | integer | |

Retention: no expiry, because a reopened Conversation continues indefinitely (D-025). It stops working when `SERVER_SECRET` rotates past its key.
Migration: new.

## Created object
Traces: R-016, J-006
A real table in the Database, created by a Typed tool inside the Boundary (D-031). The Server records it nowhere except the Conversation token and the Audit record of the call that created it.
Retention: the Server never drops it, because no drop tool exists (D-030). It stays until someone with Database rights removes it. Removing it makes it disappear from every Conversation, since visibility is checked against the catalog on each Tool call.
Migration: none. The Server issues no DDL other than the create.

## Audit record
Traces: R-010, R-011, J-008
One JSON line per Tool call on standard output (ADR-013). The top-level `type` is always `"audit"`, so it can be told apart from operational log lines.

| field | type | notes |
|---|---|---|
| type | string | `"audit"` |
| v | integer | 1 |
| ts | string | RFC 3339 UTC time the Tool call arrived |
| id | string | UUID v4 for this Tool call; also returned to the Agent in error responses, so an Operator can find the record |
| deployment | string | the Deployment's origin |
| staff | object | `{sub, name, iss}` from Sign-in |
| request_text | string | as received, never redacted (R-011); at most 4,000 characters (operations.md) |
| tool | string | the MCP tool name |
| inputs | object | the tool's inputs other than `request_text` and `conversation`, with values redacted when Redaction is on (D-028) |
| allow_list | string | SHA-256 (hex) of the encoded Allow-list segment, or `null`; lets J-008 match records to a connector URL without logging the list |
| conversation_objs | array | the Created objects the presented Conversation token named; names only |
| statements | array | `{sql, rows, ms}` per Statement sent, with `sql` redacted when Redaction is on; Server statements excluded (D-026) |
| submitted_sql | string | for a refused Agent-written query only, redacted when Redaction is on |
| outcome | object | `{kind: "ok" \| "refusal" \| "database_error", row_count, cut_short, reason_class, reason}` |
| duration_ms | integer | arrival to response |
| shortened | boolean | `true` if the record exceeded 64 KiB and the longest SQL strings were cut, each ending with `…[cut]` |

`reason_class` is one of `hidden_object`, `query_check`, `tier`, `boundary`, `invalid_input`, `invalid_allow_list` for a Refusal, and `permission`, `constraint`, `timeout`, `connection`, `other` for a Database error. `reason` is the text the Agent was given, which is already free of Hidden object names (D-005).
Retention: whatever the Host log facility keeps, set by the Operator's own policy (D-052). The Server sets none. When a Staff member leaves, their records stay for that period. Deleting a person's records is the Operator's task, done in the Host log facility.
Migration: new. Adding a field leaves `v` unchanged. Renaming or removing one raises `v`, and the Security material lists each version's fields.
