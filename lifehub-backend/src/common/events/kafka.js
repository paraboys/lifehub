import { Kafka, Partitioners } from "kafkajs";
import { normalizeBigInt } from "../utils/bigint.js";

let producer;
let enabled = false;

export function isKafkaEnabled() {
  return enabled;
}

export async function initKafka() {
  const {
    ENABLE_KAFKA = "false",
    KAFKA_CLIENT_ID = "lifehub",
    KAFKA_BROKERS = "localhost:9092"
  } = process.env;

  enabled = ENABLE_KAFKA === "true";
  if (!enabled) return;

  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS.split(",").map(b => b.trim())
  });

  producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner
  });
  await producer.connect();
}

export async function publish(topic, key, payload) {
  if (!enabled || !producer) return;
  const safePayload = normalizeBigInt(payload);

  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(safePayload)
      }
    ]
  });
}

export async function shutdownKafka() {
  if (producer) {
    await producer.disconnect();
  }
  producer = null;
  enabled = false;
}
