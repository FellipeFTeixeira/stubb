#!/bin/sh
set -eu

CONNECT_URL="http://connect:8083"
NAME="stubb-outbox"

echo "connect-init: waiting for Kafka Connect"
i=0
until curl -fsS "$CONNECT_URL/connectors" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "connect-init: Kafka Connect did not respond" >&2
    exit 1
  fi
  sleep 2
done

# Unquoted delimiter: DB_* are expanded; \${routedByValue} reaches Debezium literally.
CONFIG=$(cat <<JSON
{
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "tasks.max": "1",
  "database.hostname": "${DB_HOST}",
  "database.port": "${DB_PORT}",
  "database.user": "${DB_USER}",
  "database.password": "${DB_PASSWORD}",
  "database.dbname": "${DB_NAME}",
  "topic.prefix": "stubb",
  "plugin.name": "pgoutput",
  "slot.name": "stubb_outbox",
  "publication.name": "stubb_outbox",
  "publication.autocreate.mode": "filtered",
  "table.include.list": "public.outbox",
  "snapshot.mode": "no_data",
  "tombstones.on.delete": "false",
  "key.converter": "org.apache.kafka.connect.storage.StringConverter",
  "value.converter": "org.apache.kafka.connect.json.JsonConverter",
  "value.converter.schemas.enable": "false",
  "transforms": "outbox",
  "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
  "transforms.outbox.table.field.event.id": "id",
  "transforms.outbox.table.field.event.key": "aggregate_id",
  "transforms.outbox.table.field.event.payload": "payload",
  "transforms.outbox.route.by.field": "bounded_context",
  "transforms.outbox.route.topic.replacement": "\${routedByValue}.events",
  "transforms.outbox.table.expand.json.payload": "true",
  "transforms.outbox.table.json.payload.null.behavior": "optional_bytes",
  "transforms.outbox.table.fields.additional.placement": "id:header:eventId,event_type:header:eventType"
}
JSON
)

echo "connect-init: registering connector $NAME"
curl -fsS -X PUT -H "Content-Type: application/json" \
  --data "$CONFIG" "$CONNECT_URL/connectors/$NAME/config" >/dev/null

echo "connect-init: waiting for RUNNING state"
i=0
STATUS=""
while [ "$i" -lt 30 ]; do
  STATUS=$(curl -fsS "$CONNECT_URL/connectors/$NAME/status" 2>/dev/null || true)
  COUNT=$(printf '%s' "$STATUS" | grep -o '"state":"RUNNING"' | wc -l)
  if [ "$COUNT" -ge 2 ]; then
    echo "connect-init: connector and task RUNNING"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done
echo "connect-init: connector did not reach RUNNING" >&2
echo "$STATUS" >&2
exit 1
