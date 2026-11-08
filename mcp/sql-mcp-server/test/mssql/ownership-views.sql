-- Every sys catalog view with a principal_id or owning_principal_id column. defaults.int.test.ts runs
-- it in Docker and checks each against the read-only list's ownership catalogs; on Azure SQL Database:
--   sqlcmd -S <server> -d <database> -U <admin> -i test/mssql/ownership-views.sql
SELECT DISTINCT v.name
FROM sys.all_views v
JOIN sys.all_columns c ON c.object_id = v.object_id
WHERE v.schema_id = SCHEMA_ID('sys') AND c.name IN ('principal_id', 'owning_principal_id')
ORDER BY v.name;
