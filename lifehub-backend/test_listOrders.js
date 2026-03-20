import { listOrders } from './src/modules/orders/order.service.js';

async function test() {
  try {
    const res = await listOrders({ userId: "1", roles: ["CUSTOMER"], limit: 50, status: undefined });
    console.log("Success! Count:", res.length);
  } catch(e) {
    console.error("Error running listOrders:", e);
  }
}

test();
