import { initKafkaConsumer } from "../common/events/kafkaConsumers.js";

export async function initKafkaConsumers() {
  await initKafkaConsumer();
}
