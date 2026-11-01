# sql-mcp-server

An open-source MCP server that lets business staff ask questions of their organisation's SQL database from the AI tools they already use. It is self-hosted in your own cloud. Each Staff member signs in with your organisation's Identity provider, the Agent sees only what your Database administrator grants, and every Tool call is recorded as an Audit record on your own Host.

## What this release supports

- **Pairings:**
  - PostgreSQL on Supabase, served from Cloudflare (a Worker, through Hyperdrive). Its Deployment kit is ready: [deploy/cloudflare/guide.md](deploy/cloudflare/guide.md).
  - MS SQL Server, served from Azure (Container Apps), is being built and has no Deployment kit yet.
  - Other PostgreSQL hosts, and AWS, are planned for a later release.
- **AI tools:** Claude and ChatGPT, signing in with Microsoft Entra ID. Copilot and other AI tools are planned for a later release. Any OpenID Connect Identity provider that publishes discovery should work, but only Entra ID is tested.
- **Deployments:** public only, with an HTTPS endpoint the hosted AI tools can reach. Private Deployments are planned.
- **Permission tier:** read-only.

## Before you start

On Cloudflare, Audit records live in Workers Logs, which keeps them 3 days on the Workers Free plan and 7 on Paid. That cannot be extended while the records stay on your Host. If your policy needs them kept longer, this release cannot meet it on Cloudflare.

A Deployment needs:
- a Cloudflare account;
- a Supabase project;
- Node 24 and git on the machine you deploy from;
- someone who can create a role in the Database;
- for Sign-in, someone who can register an application in Entra ID.

Following [the guide](deploy/cloudflare/guide.md), a Deployment should be deployed, connected and reachable within an hour. Sign-in and granting tables come after that.

## For security reviewers

[docs/security-material/](docs/security-material/) covers what the Agent can see, what it can run, who can call the Server, and what is logged.

## For developers

[docs/system-spec/environments.md](docs/system-spec/environments.md) gives the local setup, the tests and every variable.
