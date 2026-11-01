-- The Database account for one Deployment (S-005). `npm run setup` fills in the role's name and its
-- password's SCRAM-SHA-256 verifier, and prints this for you to run as postgres in the Supabase SQL
-- editor. The password itself never reaches Supabase (D-106).
--
-- The role gets LOGIN and nothing else: no BYPASSRLS, no role membership, no grant. The Server
-- refuses an account that bypasses grants (D-077). What the Agent can see is what the Database
-- administrator grants this role afterwards (D-074).

DO $setup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{{role}}') THEN
    RAISE EXCEPTION 'The role {{role}} already exists, so nothing was changed. Another Deployment may use it: choose another name and rerun npm run setup.';
  END IF;
  CREATE ROLE "{{role}}" LOGIN PASSWORD '{{verifier}}';
END
$setup$;

-- Every table and column the new role can already read outside the system schemas, as the Server's
-- Allow-list would see it, with no Boundary. Anything here was granted to PUBLIC, not to this role.
-- Expect no rows. If there are some, name your own schemas in the Boundary when setup asks (D-105).
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
  AND has_column_privilege('{{role}}', c.oid, a.attnum, 'SELECT')
ORDER BY 1, 2, 3;
