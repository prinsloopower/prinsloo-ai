# Deployment — S-006

On 2026-11-17, commit d1501a4 was published to GHCR as `ghcr.io/prinsloopower/sql-mcp`, public, with two tags:
- `d1501a41b4b0dde53f2e6e5edcd6f7a2b15d6e33`, the tag that never moves;
- `0.2.0`.

Both tags name the manifest digest `sha256:da38d16a230da95c4a52e76ae980e88f504d413c6ffbca6b6f2eafdd92dfdc66`. The code is review 3's. d1501a4 adds only the review record to e121e30, the last commit with code in it. Following D-104, `main` was pushed to GitHub first (`00229dd..d1501a4`), and the image was built by hand from the clean tree: `npm run build:image && docker build -t sql-mcp:local .`.

This deploy has no migration and changes no Database. The image is a target of its own: the Worker Deployment from S-005 is untouched. The secrets went to the container in an env file, never as command arguments. That file is outside the repository, and it holds a `SERVER_SECRET` generated for this run and the Docker reader's local-only password. The GHCR token was typed by the product owner at `docker login`'s password prompt, and never reached this session.

## D-139's check, before the push

The local image `sql-mcp:local` was run as T-008 runs it, with the test CA mounted at `/certs/ca.crt` and named by `NODE_EXTRA_CA_CERTS`. Its settings were `ENGINE=mssql`, `PUBLIC_URL=http://localhost:8080`, `SERVER_SECRET`, and a `DATABASE_URL` for `sqlmcp_reader` at `host.docker.internal,51433`.

1. **Host smoke run:** `npm run smoke -- http://localhost:8080` gave 4 of 6. It failed "block says the connection is not authenticated" and "protected-resource metadata names this resource", with an empty body each time.
2. **In-network smoke run:** `docker run --rm --network container:sql-mcp-local -v <repo>\scripts\smoke.mjs:/smoke.mjs:ro node:24-slim node /smoke.mjs http://localhost:8080` gave 6 of 6.
3. **Norton paused:** the product owner turned Norton 360's web and network protection off, with Kaspersky still on. The host smoke run then gave **6 of 6**. Once Norton was back on, the host run gave 4 of 6 again, failing the same two checks. **Norton 360 is the cause.** Kaspersky did not need pausing.
4. Not reached, so the push went ahead.

`docker run --rm sql-mcp:local node dist/server.js --print-check-sql` gave SHA-256 `05d2e7e1223c880e705437dde3821a731dc5b112b986477d69fce8a297b0a8f2`. That is T-012's recorded value, so the Azure SQL Database statement has not changed since the second `sqlcmd` session.

## After the push

1. **Pushed:** `docker push` of both tags, after the product owner's `docker login ghcr.io`.
2. **Made public:** the product owner set the `sql-mcp` package to public in its GitHub package settings.
3. **Pulled without credentials:**
   - `docker logout ghcr.io` removed the credential;
   - `docker rmi` removed the local copies of the image;
   - `docker pull ghcr.io/prinsloopower/sql-mcp:d1501a41b4b0dde53f2e6e5edcd6f7a2b15d6e33` downloaded it with no login.
4. **The pulled image:**
   - its ID is `sha256:da38d16a…dfdc66`, and its user is `node`;
   - `--print-check-sql` gives the same SHA-256, `05d2e7e1…a8f2`;
   - running as the container `sql-mcp` with the same settings and CA, the smoke run below gave 6 of 6.

Verified by: docker cp scripts/smoke.mjs sql-mcp:/tmp/smoke.mjs && docker exec sql-mcp node /tmp/smoke.mjs http://localhost:8080

The smoke run executes inside the running container, so the host's Norton protection cannot affect it. It needs the published image running under the name `sql-mcp`, as in step 4 above.

Rollback: nothing serves anyone from this image yet, so a rollback means taking it out of use.
- **Unpublish the tags:** set the package back to private, or delete them under the package's versions on GitHub.
- **Stop the local container:** `docker rm -f sql-mcp`.
- **A later release that misbehaves** is rolled back by running the previous SHA tag, never `:0.2.0`, which a hand push overwrites.
- **Data:** the image keeps no state, and the deploy changed no Database. Rolling back loses nothing.

Try it: T-011. Run the published image on your machine, connect Claude Code to it, and ask which tables you can query.
1. **Pause Norton 360's web protection** while you do this (D-139): it cuts off `/mcp` responses on this machine.
2. **Check the Entra app registration** allows `http://localhost:8080/oauth/callback` as a redirect URI.
3. **Make an env file outside the repository**, with these lines:
   - `ENGINE=mssql`
   - `PUBLIC_URL=http://localhost:8080`
   - a new `SERVER_SECRET`: 32 random bytes, base64url, 43 characters
   - `IDP_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0`
   - `IDP_CLIENT_ID`
   - `IDP_CLIENT_SECRET`
   - `DATABASE_URL=Server=host.docker.internal,51433;Database=sqlmcp;User Id=sqlmcp_reader;Password=<the reader's>;Encrypt=true`
   - `NODE_EXTRA_CA_CERTS=/certs/ca.crt`
4. **Start the Docker SQL Server** if it is not running: `npm run db:mssql:seed`.
5. **Run the image by its SHA tag:**
   ```
   docker run -d --name sql-mcp -p 8080:8080 --env-file <file> -v <repo>\test\mssql\certs\ca.crt:/certs/ca.crt:ro ghcr.io/prinsloopower/sql-mcp:d1501a41b4b0dde53f2e6e5edcd6f7a2b15d6e33
   ```
6. **Connect Claude Code:** `claude mcp add --transport http sql http://localhost:8080/mcp`, then sign in with Entra ID when it asks.
7. **Ask "Which tables can I query?"** The answer should list `orders`, and `customers` with `id`, `name` and `region` only, and nothing else.
8. **Revoke and ask again:** as `sa`, run `REVOKE SELECT ON sqlmcp_test.orders FROM sqlmcp_reader;`, then ask again. `orders` should be gone. Grant it back afterwards: `GRANT SELECT ON sqlmcp_test.orders TO sqlmcp_reader;`.
9. **Check the log:** `docker logs sql-mcp` should hold one JSON Audit record line per question, with your identity.

## Not covered by the smoke check
- **Sign-in through Entra ID and a `list_tables` call:** the smoke run does no sign-in, so it never lists a table. Both are T-011's, at verification.
- **Grants taking effect on the next call, the 503 for an unsafe account, and the Audit record on standard output:** these are proven in the test suite against Docker SQL Server, not against the published image.
- **Azure SQL Database:** the published image's check statement matches T-012's hash, but the image has not been run against `mcp-test`. That is S-013's.
- **The host smoke run:** it passes only with Norton paused. Anyone running the image on this machine with Norton on gets cut-off `/mcp` responses, and the image is not at fault.
