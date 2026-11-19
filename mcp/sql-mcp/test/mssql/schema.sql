-- The test schema and the reader's grants, run in the user database as dbo, after the reader exists:
-- `npm run db:mssql:seed` in Docker, or `sqlcmd` after contained-user.sql on Azure SQL Database.
-- Never run in master.
DROP TABLE IF EXISTS sqlmcp_test.[a.b]]c];
DROP TABLE IF EXISTS sqlmcp_test.orders;
DROP TABLE IF EXISTS sqlmcp_test.customers;
DROP TABLE IF EXISTS sqlmcp_test.staff;
DROP TYPE IF EXISTS sqlmcp_test.phone;
DROP SCHEMA IF EXISTS sqlmcp_test;
GO
CREATE SCHEMA sqlmcp_test AUTHORIZATION dbo;
GO
-- An alias type: its name must never reach the Agent, because it can name a hidden object.
CREATE TYPE sqlmcp_test.phone FROM nvarchar(20);
GO
CREATE TABLE sqlmcp_test.orders (
  id int NOT NULL PRIMARY KEY,
  customer_id int NOT NULL,
  total decimal(10, 2) NOT NULL,
  notes nvarchar(max) NULL,
  placed_at datetime2 NOT NULL,
  contact sqlmcp_test.phone NULL
);
CREATE TABLE sqlmcp_test.customers (
  id int NOT NULL PRIMARY KEY,
  name nvarchar(100) NOT NULL,
  region nvarchar(50) NULL,
  email nvarchar(200) NULL
);
CREATE TABLE sqlmcp_test.staff (id int NOT NULL, name nvarchar(100) NOT NULL, salary decimal(10, 2) NOT NULL);
CREATE TABLE sqlmcp_test.[a.b]]c] (id int NOT NULL, label varchar(30) NULL);
GO
INSERT INTO sqlmcp_test.customers VALUES (1, N'Avery', N'North', N'avery@example.com'), (2, N'Blake', N'South', NULL);
INSERT INTO sqlmcp_test.orders VALUES (10, 1, 120.50, NULL, '2026-10-01', NULL), (11, 2, 75.00, N'gift', '2026-10-02', N'555-0100');
INSERT INTO sqlmcp_test.staff VALUES (1, N'Casey', 50000.00);
GO
GRANT SELECT ON sqlmcp_test.orders TO sqlmcp_reader;
GRANT SELECT ON sqlmcp_test.customers (id, name, region) TO sqlmcp_reader;
GO
