#!/usr/bin/env bash
# Development and CI only: creates the database, its owner (the migrator role) and one
# login role per bounded context (ADR-0027). Production roles come from the
# infrastructure, never from this script. Runs once, when the data volume is empty.
# psql reads the values with \getenv, so they never appear on a command line, and the
# statements are built with format(%I, %L) so names and passwords are always quoted.
set -euo pipefail

run_sql() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres
}

run_sql <<'SQL'
\getenv db DB_NAME
\getenv owner DB_MIGRATOR_USER
\getenv owner_login DB_MIGRATOR_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'owner', :'owner_login') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SQL

for context in BUSINESS_ACCESS CATALOG DINERS INTERACTIONS MEASUREMENT; do
  run_sql <<SQL
\getenv db DB_NAME
\getenv role DB_${context}_USER
\getenv role_login DB_${context}_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'role_login') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', :'role') \gexec
SQL
done
