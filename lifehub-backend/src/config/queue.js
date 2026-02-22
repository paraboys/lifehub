import { Queue } from "bullmq";
import { createRedisClient } from "./redis.js";

const queues = new Map();
let sharedConnection;

export function  getQueueConnection() {
  if (sharedConnection) return sharedConnection;
  sharedConnection = createRedisClient("bullmq-shared-connection");
  return sharedConnection;
}

export function getQueue(name) {
  if (queues.has(name)) return queues.get(name);

  const queue = new Queue(name, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  queues.set(name, queue);
  return queue;
}
