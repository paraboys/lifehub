import { Queue } from "bullmq";
import IORedis from "ioredis";

const queues = new Map();
let sharedConnection;

export function  getQueueConnection() {
  if (sharedConnection) return sharedConnection;
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  sharedConnection = new IORedis(url, { maxRetriesPerRequest: null });
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
