#!/usr/bin/env bash
# Draait schema.sql + test.sql tegen een wegwerp-PostgreSQL, zodat je het
# beveiligingsmodel kunt controleren zonder je echte Supabase-project aan te
# raken. Vereist een lokale PostgreSQL-installatie (postgresql-16 of nieuwer).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="${CAMP_PGDATA:-/var/tmp/camp-testdb}"
PORT="${CAMP_PGPORT:-55432}"
SOCK=/tmp

cleanup() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$DATA"
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK" -l /tmp/camp-pg.log start >/dev/null
until psql -h "$SOCK" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1; do sleep 0.5; done

psql -h "$SOCK" -p "$PORT" -U postgres -q -c 'create database camp'
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d camp -v ON_ERROR_STOP=1 -q)

# client_min_messages=warning onderdrukt de "does not exist, skipping"-ruis van
# de drop-policy-regels, maar laat echte fouten wel hard falen.
"${PSQL[@]}" -f "$HERE/local-stub.sql"
"${PSQL[@]}" -c 'set client_min_messages = warning' -f "$HERE/schema.sql"
"${PSQL[@]}" -f "$HERE/test.sql"

echo
echo "Alle controles gedraaid. Lees de kolommen hierboven na: 'binnen_straal',"
echo "'lat_vervaagd', 'vervaagd' en 'zelfde_seed_zelfde_punt' horen t te zijn,"
echo "en 'plekken_zichtbaar', 'shares_zichtbaar', 'gedeeld_met_buitenstaander'"
echo "en 'na_intrekken' horen 0 te zijn."
