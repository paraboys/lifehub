import { Kafka } from "kafkajs";
import { eventBus } from "./eventBus.js";

let consumer;
let enabled = false;

export function isKafkaConsumerEnabled() {
  return enabled;
}

function resolveTopics() {
  if (process.env.KAFKA_CONSUMER_TOPICS) {
    return process.env.KAFKA_CONSUMER_TOPICS.split(",").map(topic => topic.trim()).filter(Boolean);
  }

  const prefix = process.env.KAFKA_WORKFLOW_TOPIC_PREFIX || "workflow";
  return [`${prefix}.events`, `${prefix}.retry`, `${prefix}.saga`];
}

export async function initKafkaConsumer() {
  const {
    ENABLE_KAFKA_CONSUMERS = "false",
    KAFKA_CLIENT_ID = "lifehub",
    KAFKA_BROKERS = "localhost:9092",
    KAFKA_CONSUMER_GROUP = "lifehub-core"
  } = process.env;

  enabled = ENABLE_KAFKA_CONSUMERS === "true";
  if (!enabled) return;

  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS.split(",").map(b => b.trim()).filter(Boolean)
  });

  consumer = kafka.consumer({ groupId: KAFKA_CONSUMER_GROUP });
  await consumer.connect();

  const topics = resolveTopics();
  await Promise.all(
    topics.map(topic => consumer.subscribe({ topic, fromBeginning: false }))
  );

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message?.value) return;
      try {
        const parsed = JSON.parse(message.value.toString());
        const eventType = parsed?.type;
        if (!eventType) return;
        const payload = {
          ...(parsed.payload || {}),
          __pipeline: {
            ingested: true,
            transport: "kafka"
          }
        };
        eventBus.emit(eventType, payload);
      } catch {
        // ignore malformed messages
      }
    }
  });
}

export async function shutdownKafkaConsumer() {
  if (!consumer) return;
  await consumer.disconnect();
  consumer = null;
  enabled = false;
}
