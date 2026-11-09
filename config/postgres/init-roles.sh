#!/usr/bin/env bash
# Development and CI only: creates the owner role (the migrator), one login role per
# bounded context (ADR-0027) and two databases with the same roles: DB_NAME for development
# and DB_TEST_NAME for the e2e tests, so tests never touch development data. Production
# roles come from the infrastructure, never from this script. Runs once, on an empty volume.
# psql reads the values with \getenv, so they never appear on a command line, and the
# statements are built with format(%I, %L) so names and passwords are always quoted.
set -euo pipefail

CONTEXTS=(BUSINESS_ACCESS CATALOG DINERS INTERACTIONS MEASUREMENT)

run_sql() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres
}

run_sql <<'SQL'
\getenv owner DB_MIGRATOR_USER
\getenv owner_login DB_MIGRATOR_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'owner', :'owner_login') \gexec
SQL

for context in "${CONTEXTS[@]}"; do
  run_sql <<SQL
\getenv role DB_${context}_USER
\getenv role_login DB_${context}_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'role_login') \gexec
SQL
done

for database_variable in DB_NAME DB_TEST_NAME; do
  run_sql <<SQL
\getenv db ${database_variable}
\getenv owner DB_MIGRATOR_USER
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SQL
  for context in "${CONTEXTS[@]}"; do
    run_sql <<SQL
\getenv db ${database_variable}
\getenv role DB_${context}_USER
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db', :'role') \gexec
SQL
  done
done
