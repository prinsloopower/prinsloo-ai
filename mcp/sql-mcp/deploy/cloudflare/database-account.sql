-- The Database account for one Deployment. `npm run setup` fills in the role's name, the
-- Deployment it is for, and its password's SCRAM-SHA-256 verifier, and prints this for you to run
-- as postgres in the Supabase SQL editor. The password itself never reaches Supabase.
--
-- The role gets LOGIN and nothing else: no BYPASSRLS, no role membership, no grant. The Server
-- refuses an account that bypasses grants. What the Agent can see is what the Database
-- administrator grants this role afterwards.
--
-- Setup marks the role with a comment naming its Deployment. Run again, for a rerun or a new
-- password, this resets the password of that role only. It never touches a role made any other
-- way, which another Deployment may be using.

DO $setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{{role}}') THEN
    CREATE ROLE "{{role}}" LOGIN PASSWORD '{{verifier}}';
    COMMENT ON ROLE "{{role}}" IS '{{mark}}';
  ELSIF (SELECT shobj_description(oid, 'pg_authid') FROM pg_roles WHERE rolname = '{{role}}') IS DISTINCT FROM '{{mark}}' THEN
    RAISE EXCEPTION 'The role {{role}} already exists and was not made by setup for this Deployment, so nothing was changed. Another Deployment may use it: choose another name and rerun npm run setup.';
  ELSE
    ALTER ROLE "{{role}}" PASSWORD '{{verifier}}';
  END IF;
END
$setup$;

-- Every table and column the role can read outside the system schemas, as the Server's Allow-list
-- reads it, with no Boundary. A test keeps this equal to the Server's own read (src/engine/postgres.ts).
-- For a new role, any row here comes from a grant to PUBLIC; setup's prompt says what to do about it
--. For a role already in use, the rows are what the Database administrator granted it.
SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE c.relkind IN ('r', 'p')
  AND NOT c.relispartition
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%'
  AND n.nspname NOT LIKE 'pg\_temp%'
  AND has_schema_privilege('{{role}}', n.oid, 'USAGE')
  AND NOT pg_has_role('{{role}}', c.relowner, 'MEMBER')
  AND has_column_privilege('{{role}}', c.oid, a.attnum, 'SELECT')
ORDER BY 1, 2, 3;
