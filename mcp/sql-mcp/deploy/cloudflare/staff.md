# Asking questions of your organisation's data from Claude or ChatGPT

Your organisation runs a server that lets Claude or ChatGPT answer questions from its database. Your Operator gives you its address, which ends in `/mcp`.

The AI tool only reads. It sees only the tables and columns your Database administrator has made available, and every question you ask through it is recorded with your name.

## Claude

1. In Claude, open **Settings**, then **Connectors**, and choose **Add custom connector**.
2. Give it a name, such as your organisation's database, and paste the address.
3. Choose **Connect**. A browser window opens at your organisation's sign-in page. Sign in with your work account.
4. In a new conversation, make sure the connector is switched on, then ask your question.

## ChatGPT

1. In ChatGPT, open **Settings**, then **Apps & Connectors**, and create a connector. Your workspace may need developer mode switched on first; if it is not available, ask whoever runs your ChatGPT workspace.
2. Paste the address, and choose OAuth as its authentication.
3. Sign in with your work account when your organisation's sign-in page opens.
4. In a new conversation, add the connector, then ask your question.

These menus change from time to time. If a name here no longer matches, look for "connectors" or "MCP" in the tool's settings.

## What to expect

- **The AI tool first lists the tables it can see, then writes its own queries.** It shows you figures from the rows themselves.
- **A result can be cut short** at the server's row limit. The tool is told so, and should say so.
- **"Not accepted" or "refused"** means the query asked for something the server does not allow, such as a table you cannot see, or a change to data. The answer names nothing it hides. Ask the question another way, or ask your Database administrator whether the data can be made available.
- **Signed out:** sign-ins last up to 30 days. When one ends, the tool asks you to sign in again.
- **Connection failures on a managed machine** can come from security software that inspects HTTPS. Tell your IT team the server's address.
