# Visibility: what the Agent can see, and what is logged

This section answers two of a security reviewer's four questions: *what the Agent can see* and *what is logged*. It covers what this release does.

## In short

- The Agent sees only the tables and columns that your **database administrator has granted** to the Server's Database account, in the database itself. That grant is the whole Allow-list. Claude, ChatGPT and the people using them cannot widen it: nothing they send affects what is visible.
- A grant or a revoke takes effect on the **next question**. The Server keeps no copy, reads the grants every time, and does not cache them.
- The Server **refuses to answer** while its Database account holds any grant that reaches every table at once.
- Every question that reaches a tool leaves **one Audit record**, which names who asked and what they asked. It never contains what the database returned.

## How your database administrator controls it (PostgreSQL)

Create a dedicated account for the Server and grant it exactly what the Agent may read:

```sql
CREATE ROLE sqlmcp_reader LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA sales TO sqlmcp_reader;                       -- needed to reach any table in it
GRANT SELECT ON sales.orders TO sqlmcp_reader;                      -- a whole table
GRANT SELECT (id, name, region) ON sales.customers TO sqlmcp_reader; -- some columns only
REVOKE SELECT ON sales.orders FROM sqlmcp_reader;                   -- hidden again on the next question
```

Points a reviewer should check:
- **Grants to `PUBLIC` count.** Anything granted to `PUBLIC` is granted to the Server's account too, and appears.
- **Schema `USAGE` is required.** A table in a schema the account has no `USAGE` on is never shown, even if SELECT on the table is granted.
- **Views and functions are never listed**. Granting a view shows nothing.
- **Tables the account owns are never listed**. That includes tables owned by any role the account is a member of, because ownership passes every privilege check and a revoke could not hide them. An account that owns your business tables therefore sees none of them. Use a dedicated account that owns nothing.
- **System catalogs are never listed** (`pg_catalog`, `information_schema`), although every account can read them, because they would list every hidden table.
- **The Operator's Boundary** (`BOUNDARY`) can further exclude schemas or tables, whatever is granted. When it is unset, the grants alone decide.

## The account check

On every question, and on every `/healthz` check, the Server reads whether its account is a superuser, has `BYPASSRLS`, or is a member of `pg_read_all_data` or `pg_write_all_data`. If any is true:
- questions are answered `503 Deployment misconfigured: Database account bypasses grants (reference …)`;
- an operational `config_invalid` line and an Audit record (a Refusal of class `unsafe_account`) are written;
- `/healthz` reports `database: unsafe`.

Sign-in keeps working, so the Operator can see what is wrong.

## What the Agent receives when something fails

Errors from the database are never passed through. The Agent gets one fixed sentence per kind of failure, such as "The database refused this for lack of permission." The sentence is followed by a reference to the Audit record, so no table name can leak through an error. A request for a schema that is hidden gets exactly the same answer as one for a schema that does not exist.

## What an Audit record holds

One JSON line per tool call, kept by the Host's own log facility:

| holds | never holds |
|---|---|
| time, a unique id, the Deployment | anything the database returned, including the table list itself |
| who asked: subject, name and issuer from Sign-in | access, refresh or ID tokens, or secrets |
| the Request text, as the AI tool sent it, up to 4,000 characters (it cannot be verified) | the driver's error messages |
| which tool, and its inputs (a schema name) | |
| the outcome: listed, refused (and why), or database error (and its class) | |

`initialize`, `tools/list` and calls with no Sign-in leave no Audit record. Neither does a Deployment whose own settings are invalid. Those calls never reach a tool.

## Retention

Audit records stay on the Host for as long as the Host's log facility keeps them, under your own retention policy. On Cloudflare that is Workers Logs, which keeps logs for **3 days on the Free plan and 7 on Paid** and cannot be extended while records stay on the Host. An organisation that must keep them longer cannot meet that on Cloudflare this release.

Measured on the project's own Deployment on 2026-10-31, on the Free plan, records were kept longer than documented. An Audit record 5 days 22 hours old was still there, and records from 2026-10-22, 9 days old, were gone. Plan around the documented figures, not this one: Cloudflare can enforce them at any time, and moves Workers Logs to new pricing on 1 December 2026.

To find Audit records in the Cloudflare dashboard, open Workers & Pages → the Worker → Observability, and filter on `$metadata.type` equals `cf-worker` and `type` equals `audit`. Workers Logs splits each record into fields, so it has no message text, and a text search for `"type":"audit"` finds nothing.
