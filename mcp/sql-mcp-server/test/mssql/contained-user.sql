-- The reader as a contained SQL-authenticated user, for Azure SQL Database (security.md). Run as dbo in
-- the user database, never master, before schema.sql:
--   sqlcmd -S <server> -d <database> -U <admin> -i test/mssql/contained-user.sql -v READER_PASSWORD="$READER_PASSWORD"
-- The password comes from the shell; this file holds none.
IF USER_ID('sqlmcp_reader') IS NULL
  CREATE USER sqlmcp_reader WITH PASSWORD = '$(READER_PASSWORD)';
GO
