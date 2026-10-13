# Product brief (verbatim from the product owner, 2026-10-10)

Cloud-hosted custom SQL MCP Server. The SQL MCP Server supports secure "Natural Language to SQL" (NL2SQL) text generation for MS SQL server and PostgreSQL. It must not risk schema exposure and result in unpredictable database queries. Exposes deterministic, typed tools that AI tools can safely execute, but allows a certain degree of freedom to generate its own queries in the presence of semantic models provided to the agent as skills.

Features:

Cloud-hosted: supports AWS, Azure and Cloudflare.
Configurable support for DDL and DML.
Authorization: Can be preconfigured for read-only operations, or read, write and delete. MCP-level read/write/delete settings override the SQL user account's access.
Authentication via OAuth
Support for monitoring/logging: Logs every user request and resulting SQL query on the cloud container where the MCP is hosted.
