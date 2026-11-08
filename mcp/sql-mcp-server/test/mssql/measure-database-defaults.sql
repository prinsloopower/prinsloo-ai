-- Every database permission row the reader's principals hold, read as the reader itself, in the user
-- database (never master). defaults.int.test.ts runs it in Docker; on Azure SQL Database:
--   sqlcmd -S <server> -d <database> -U sqlmcp_reader -i test/mssql/measure-database-defaults.sql
SELECT dp.name AS principal, p.class_desc, p.permission_name, p.state_desc, p.major_id
FROM sys.database_permissions p
JOIN sys.user_token ut ON ut.principal_id = p.grantee_principal_id
JOIN sys.database_principals dp ON dp.principal_id = p.grantee_principal_id
ORDER BY dp.name, p.class_desc, p.permission_name, p.major_id;
