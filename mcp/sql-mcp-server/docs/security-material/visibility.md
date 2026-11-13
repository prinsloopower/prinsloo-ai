# Visibility: what the Agent can see, and what is logged

This section answers two of the four questions a Security reviewer asks, listed in the [README](../../README.md#for-security-reviewers): *what the Agent can see* and *what is logged*. It covers what this release does.

## In short

- The Agent sees only the tables and columns that your **database administrator has granted** to the Server's Database account, in the database itself. That grant is the whole Allow-list. Claude, ChatGPT and the people using them cannot widen it: nothing they send affects what is visible.
- A grant or a revoke takes effect on the **next question**. The Server keeps no copy, reads the grants every time, and does not cache them.
- The Server **refuses to answer** while its Database account could read past its grants. On PostgreSQL, that means any of a named set of privileges that reach every table. On MS SQL Server, it means anything at all beyond a short list of what a read-only account needs.
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

## How your database administrator controls it (MS SQL Server)

The Server's account is a user in your database, granted `SELECT` on exactly what the Agent may read. On Azure SQL Database it must be a contained user with its own password (see *MS SQL Server: only a listed set is allowed* below):

```sql
CREATE USER sqlmcp_reader WITH PASSWORD = '…';                      -- in your database, not master
GRANT SELECT ON sales.orders TO sqlmcp_reader;                       -- a whole table
GRANT SELECT ON sales.customers (id, name, region) TO sqlmcp_reader; -- some columns only
GRANT SELECT ON SCHEMA::reporting TO sqlmcp_reader;                  -- every table in a schema
DENY SELECT ON reporting.salaries TO sqlmcp_reader;                  -- hidden, whatever else is granted
REVOKE SELECT ON sales.orders FROM sqlmcp_reader;                    -- hidden again on the next question
```

Points a reviewer should check:
- **Grants through roles and `public` count**, at any depth, and so do schema-level grants. A `DENY` always wins, and hides the table or column.
- **Only user tables are listed.** Views, functions and synonyms are never listed, even when granted.
- **System schemas are never listed** (`sys`, `INFORMATION_SCHEMA`).
- **Column types of your own are shown as `user-defined`**, never by name, because a type's name can carry the name of a hidden table. Built-in types are shown with their length in characters, such as `nvarchar(100)`.
- **The Operator's Boundary** (`BOUNDARY`) narrows the list exactly as it does on PostgreSQL.

## The account check

The Server checks its own Database account on every question, and on every `/healthz` check, in the same statement that reads the grants. The two Engines check it differently, as the sections below explain. If the account fails:
- questions are answered `503 Deployment misconfigured: Database account bypasses grants (reference …)`;
- an operational `config_invalid` line and an Audit record (a Refusal of class `unsafe_account`) are written;
- `/healthz` reports `database: unsafe`.

Sign-in keeps working, so the Operator can see what is wrong. The `config_invalid` line names `DATABASE_URL`, the setting that chose the account. It does not say which condition failed.

### PostgreSQL: named routes are refused

The account is refused if it is a superuser, has `BYPASSRLS`, or is a member of `pg_read_all_data` or `pg_write_all_data`. Membership through another role counts, and so does a role that is a superuser or has `BYPASSRLS`. The account is also refused if it has `CREATEROLE`, or if the login it connected as is a superuser. Each of these is a way to read every table whatever the grants say. Anything else the account holds is allowed.

### MS SQL Server: only a listed set is allowed

MS SQL Server has many more ways past a grant: fixed and user-defined roles, ownership, impersonation, and permissions that imply others. A list of refused routes can always miss one more. So on MS SQL Server the check runs the other way round. The account passes only if **everything** it holds is on the list below, and anything not listed refuses it, including a route nobody has thought of.

The check reads the session's own security tokens, so it sees every role the account reaches at any depth, `public`, and any Windows or Entra group the token carries. Every permission counts as the effective permission, so one implied by another counts too. The account passes only if:
- **it is not `dbo`**, and none of its principals owns the database;
- **it is in no fixed role but `public`**: no fixed database role and, where the server level can be read, no fixed or user-defined server role;
- **it owns nothing**: no schema, table, type, role, certificate, key or other securable in the database and, where the server level can be read, no login, server role, endpoint or server audit;
- **its database grants are only** `CONNECT` and `SHOWPLAN` on the database, `SELECT` on schemas, tables or columns, and what `public` holds by default (the two `VIEW ANY COLUMN … KEY DEFINITION` permissions, and its rows on system objects);
- **its server grants are only** `CONNECT SQL`, `VIEW ANY DATABASE` and `CONNECT` on an endpoint, where the server level can be read.

`DENY` rows never refuse the account, because they only narrow what it reads. Any error while the check runs refuses the account, so the check fails closed. `public`'s default grants were measured on SQL Server 2022 and on Azure SQL Database before the check shipped, and every one is on the list.

**On Azure SQL Database,** the server level cannot be read from inside a database, so the Server cannot see a login's server roles. There, the account must be a **contained user with its own password** (`CREATE USER … WITH PASSWORD`), mapped to no login. A user mapped to a login made in `master`, the server admin, and an Entra user are all refused, because some of what they hold would be invisible to the check.

**Only `read-only` on MS SQL Server.** The list above is the read-only tier's. On MS SQL Server, any other `PERMISSION_TIER` makes every MCP request answer 503 "Deployment misconfigured: PERMISSION_TIER".

### How the two Engines differ

The same account can pass on PostgreSQL and be refused on MS SQL Server. An extra grant that is not `SELECT`, such as `VIEW DEFINITION`, or ownership of any table, refuses it on MS SQL Server only. This is deliberate. MS SQL Server's check is stricter because its routes past a grant are too many to name one by one. On PostgreSQL, a table the account owns is simply not listed, while on MS SQL Server owning it refuses the account. On both, what the Agent sees is still decided by `SELECT` grants alone.

## What the Server fetches from the network, in the container

The container image fetches two kinds of URL: an AI tool's Client ID Metadata Document, and the Identity provider's discovery, keys and token endpoints. Both go through one guarded connection that refuses any address that is not public: loopback, private (RFC 1918), link-local (including the cloud metadata address `169.254.169.254`), carrier-grade NAT, IPv6 unique-local, multicast, unspecified and reserved addresses. An IPv4 address written inside IPv6 is checked as IPv4.

The address is checked when the connection is made, not before, so a DNS answer cannot change between the check and the connection. A host that resolves to several addresses is refused if any one of them is private, and a host written as an IP address is checked against the same list. A refused fetch fails as an unreachable host does: a registration ends with `invalid_client`, and a Sign-in reports that the Identity provider did not answer. An Identity provider on a private network is therefore refused too, until private Deployments are supported.

On Cloudflare, the platform's own egress applies instead, and private ranges are not reachable.

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

Measured on a test Deployment on 2026-10-31, on the Free plan, records were kept longer than documented. An Audit record 5 days 22 hours old was still there, and records from 2026-10-22, 9 days old, were gone. Plan around the documented figures, not this one: Cloudflare can enforce them at any time, and moves Workers Logs to new pricing on 1 December 2026.

To find Audit records in the Cloudflare dashboard, open Workers & Pages → the Worker → Observability, and filter on `$metadata.type` equals `cf-worker` and `type` equals `audit`. Workers Logs splits each record into fields, so it has no message text, and a text search for `"type":"audit"` finds nothing.
