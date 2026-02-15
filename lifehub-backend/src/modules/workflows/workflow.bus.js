const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(handler);
}

export async function emit(event, payload) {
  if (!listeners.has(event)) return;

  for (const handler of listeners.get(event)) {
    await handler(payload);
  }
}
