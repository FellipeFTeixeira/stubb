#!/bin/bash
set -euo pipefail

KAFKA_BIN=/opt/kafka/bin
BOOTSTRAP=kafka:9092

"$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
  --topic diagnostics.events --partitions 3 --replication-factor 1 --config retention.ms=-1

"$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
  --topic catalog.events --partitions 3 --replication-factor 1 --config retention.ms=-1
