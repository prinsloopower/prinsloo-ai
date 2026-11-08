-- Every server permission row the reader's login principals hold, read as the reader. Only where the
-- server level can be read: not on Azure SQL Database, whose user databases cannot see it.
SELECT sp.name AS principal, p.class_desc, p.permission_name, p.state_desc, p.major_id
FROM sys.server_permissions p
JOIN sys.login_token lt ON lt.principal_id = p.grantee_principal_id
JOIN sys.server_principals sp ON sp.principal_id = p.grantee_principal_id
ORDER BY sp.name, p.class_desc, p.permission_name, p.major_id;
