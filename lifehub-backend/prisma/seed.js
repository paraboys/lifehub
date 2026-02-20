import bcrypt from "bcrypt";
import prisma from "../src/config/db.js";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Lifehub@123";

const ROLES = ["customer", "shopkeeper", "provider", "delivery", "business", "admin"];

const USERS = [
  {
    key: "customer",
    name: "Demo Customer",
    phone: "9000000001",
    email: "customer@lifehub.local",
    roles: ["customer"]
  },
  {
    key: "shopkeeper",
    name: "Demo Grocery Shop",
    phone: "9000000002",
    email: "shop@lifehub.local",
    roles: ["shopkeeper"]
  },
  {
    key: "plumber",
    name: "Demo Plumber",
    phone: "9000000003",
    email: "plumber@lifehub.local",
    roles: ["provider"]
  },
  {
    key: "electrician",
    name: "Demo Electrician",
    phone: "9000000004",
    email: "electrician@lifehub.local",
    roles: ["provider"]
  },
  {
    key: "delivery",
    name: "Demo Delivery Partner",
    phone: "9000000005",
    email: "delivery@lifehub.local",
    roles: ["delivery"]
  },
  {
    key: "admin",
    name: "Demo Admin",
    phone: "9000000006",
    email: "admin@lifehub.local",
    roles: ["admin", "business"]
  }
];

const ORDER_WORKFLOW = {
  name: "ORDER_FLOW",
  description: "Grocery order lifecycle with cancellation path",
  states: ["CREATED", "PAID", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  transitions: [
    { from: "CREATED", to: "PAID", event: "PAYMENT_SUCCESS" },
    { from: "PAID", to: "ASSIGNED", event: "PROVIDER_ASSIGNED" },
    { from: "ASSIGNED", to: "IN_PROGRESS", event: "JOB_STARTED" },
    { from: "IN_PROGRESS", to: "COMPLETED", event: "JOB_DONE" },
    { from: "CREATED", to: "CANCELLED", event: "ORDER_CANCELLED" },
    { from: "PAID", to: "CANCELLED", event: "ORDER_CANCELLED" },
    { from: "ASSIGNED", to: "CANCELLED", event: "ORDER_CANCELLED" },
    { from: "IN_PROGRESS", to: "CANCELLED", event: "ORDER_CANCELLED" }
  ]
};

const SERVICE_WORKFLOW = {
  name: "SERVICE_FLOW",
  description: "Service request lifecycle for plumber/electrician hiring",
  states: ["CREATED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  transitions: [
    { from: "CREATED", to: "ASSIGNED", event: "REQUEST_ACCEPTED" },
    { from: "ASSIGNED", to: "IN_PROGRESS", event: "JOB_STARTED" },
    { from: "IN_PROGRESS", to: "COMPLETED", event: "JOB_DONE" },
    { from: "CREATED", to: "CANCELLED", event: "REQUEST_CANCELLED" },
    { from: "ASSIGNED", to: "CANCELLED", event: "REQUEST_CANCELLED" }
  ]
};

async function ensureRoles() {
  const roleMap = new Map();
  for (const roleName of ROLES) {
    const role = await prisma.roles.upsert({
      where: { role_name: roleName },
      update: {},
      create: { role_name: roleName }
    });
    roleMap.set(roleName, role);
  }
  return roleMap;
}

async function ensureUser(userDef, roleMap) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let user = await prisma.users.findUnique({
    where: { phone: userDef.phone }
  });

  if (!user) {
    user = await prisma.users.create({
      data: {
        name: userDef.name,
        phone: userDef.phone,
        email: userDef.email,
        password_hash: passwordHash
      }
    });
  } else {
    user = await prisma.users.update({
      where: { id: user.id },
      data: {
        name: userDef.name,
        email: userDef.email,
        password_hash: passwordHash
      }
    });
  }

  await prisma.wallets.upsert({
    where: { user_id: user.id },
    update: {},
    create: { user_id: user.id, balance: 5000 }
  });

  for (const roleName of userDef.roles) {
    const role = roleMap.get(roleName);
    if (!role) continue;
    await prisma.user_roles.upsert({
      where: {
        user_id_role_id: {
          user_id: user.id,
          role_id: role.id
        }
      },
      update: {},
      create: {
        user_id: user.id,
        role_id: role.id
      }
    });
  }

  return user;
}

async function ensureShopData(shopUserId) {
  const shop = await prisma.shop_profiles.upsert({
    where: { id: 1n },
    update: {
      user_id: shopUserId,
      shop_name: "LifeHub Fresh Mart",
      address: "Sector 1, Demo City",
      lat: 28.6139,
      lng: 77.209
    },
    create: {
      id: 1n,
      user_id: shopUserId,
      shop_name: "LifeHub Fresh Mart",
      address: "Sector 1, Demo City",
      lat: 28.6139,
      lng: 77.209,
      verified: true,
      rating: 4.8
    }
  });

  const productSpecs = [
    {
      name: "Rice 5kg",
      company: "Fortune",
      description: "Premium long grain basmati rice, 5kg family pack.",
      imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80",
      category: "grocery",
      price: 499,
      qty: 120
    },
    {
      name: "Milk 1L",
      company: "Amul",
      description: "Fresh toned milk, 1L pouch.",
      imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80",
      category: "dairy",
      price: 56,
      qty: 350
    },
    {
      name: "Eggs 12 Pack",
      company: "Farm Fresh",
      description: "Grade A white eggs, hygienically packed.",
      imageUrl: "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=900&q=80",
      category: "dairy",
      price: 78,
      qty: 200
    }
  ];

  for (const spec of productSpecs) {
    let product = await prisma.products.findFirst({
      where: {
        shop_id: shop.id,
        name: spec.name
      }
    });

    if (!product) {
      product = await prisma.products.create({
        data: {
          shop_id: shop.id,
          name: spec.name,
          company: spec.company,
          description: spec.description,
          image_url: spec.imageUrl,
          category: spec.category,
          price: spec.price
        }
      });
    } else {
      product = await prisma.products.update({
        where: { id: product.id },
        data: {
          company: spec.company,
          description: spec.description,
          image_url: spec.imageUrl,
          category: spec.category,
          price: spec.price
        }
      });
    }

    await prisma.inventory.upsert({
      where: { product_id: product.id },
      update: {
        quantity: spec.qty,
        last_updated: new Date()
      },
      create: {
        product_id: product.id,
        quantity: spec.qty
      }
    });
  }

  return shop;
}

async function ensureShopFeedback(customerId, shopId) {
  const existing = await prisma.shop_feedbacks.findFirst({
    where: {
      shop_id: shopId,
      user_id: customerId,
      order_id: null
    }
  });

  if (!existing) {
    await prisma.shop_feedbacks.create({
      data: {
        shop_id: shopId,
        user_id: customerId,
        order_id: null,
        rating: 4.8,
        comment: "Quick delivery and fair pricing. Inventory is usually accurate."
      }
    });
  }

  const aggregate = await prisma.shop_feedbacks.aggregate({
    where: { shop_id: shopId },
    _avg: { rating: true }
  });
  const avgRating = aggregate?._avg?.rating;
  if (avgRating !== null && avgRating !== undefined) {
    await prisma.shop_profiles.update({
      where: { id: shopId },
      data: {
        rating: Number(Number(avgRating).toFixed(1))
      }
    });
  }
}

async function ensureProvider(userId, skillNames, location) {
  let provider = await prisma.provider_profiles.findFirst({
    where: { user_id: userId }
  });
  if (!provider) {
    provider = await prisma.provider_profiles.create({
      data: {
        user_id: userId,
        experience_years: 4,
        verified: true,
        rating: 4.7
      }
    });
  }

  await prisma.provider_locations.upsert({
    where: { provider_id: provider.id },
    update: {
      lat: location.lat,
      lng: location.lng,
      available: true
    },
    create: {
      provider_id: provider.id,
      lat: location.lat,
      lng: location.lng,
      available: true
    }
  });

  for (const skill of skillNames) {
    await prisma.provider_skills.upsert({
      where: {
        provider_id_skill_name: {
          provider_id: provider.id,
          skill_name: skill
        }
      },
      update: {},
      create: {
        provider_id: provider.id,
        skill_name: skill
      }
    });
  }
}

async function ensureWorkflow(definition) {
  let workflow = await prisma.workflows.findFirst({
    where: { name: definition.name }
  });
  if (!workflow) {
    workflow = await prisma.workflows.create({
      data: {
        name: definition.name,
        description: definition.description
      }
    });
  }

  const stateByName = new Map();
  for (const stateName of definition.states) {
    let state = await prisma.workflow_states.findFirst({
      where: {
        workflow_id: workflow.id,
        state_name: stateName
      }
    });
    if (!state) {
      state = await prisma.workflow_states.create({
        data: {
          workflow_id: workflow.id,
          state_name: stateName,
          is_final: stateName === "COMPLETED" || stateName === "CANCELLED"
        }
      });
    }
    stateByName.set(stateName, state);
  }

  for (const transitionDef of definition.transitions) {
    const from = stateByName.get(transitionDef.from);
    const to = stateByName.get(transitionDef.to);
    if (!from || !to) continue;

    const existing = await prisma.workflow_transitions.findFirst({
      where: {
        workflow_id: workflow.id,
        from_state: from.id,
        to_state: to.id,
        trigger_event: transitionDef.event
      }
    });
    if (!existing) {
      await prisma.workflow_transitions.create({
        data: {
          workflow_id: workflow.id,
          from_state: from.id,
          to_state: to.id,
          trigger_event: transitionDef.event,
          requires_action: false
        }
      });
    }
  }

  return workflow;
}

async function ensureConversation(customerId, providerUserId) {
  let conversation = await prisma.conversations.findFirst({
    where: {
      type: "DIRECT",
      conversation_participants: {
        some: { user_id: customerId }
      }
    },
    orderBy: { created_at: "desc" }
  });

  if (!conversation) {
    conversation = await prisma.conversations.create({
      data: {
        type: "DIRECT",
        created_by: customerId
      }
    });
  }

  for (const userId of [customerId, providerUserId]) {
    await prisma.conversation_participants.upsert({
      where: {
        conversation_id_user_id: {
          conversation_id: conversation.id,
          user_id: userId
        }
      },
      update: {},
      create: {
        conversation_id: conversation.id,
        user_id: userId
      }
    });
  }
}

async function main() {
  const roleMap = await ensureRoles();
  const users = {};

  for (const userDef of USERS) {
    users[userDef.key] = await ensureUser(userDef, roleMap);
  }

  const shop = await ensureShopData(users.shopkeeper.id);
  await ensureShopFeedback(users.customer.id, shop.id);
  await ensureProvider(users.plumber.id, ["plumber", "pipe_repair"], { lat: 28.6139, lng: 77.209 });
  await ensureProvider(users.electrician.id, ["electrician", "wiring"], { lat: 28.612, lng: 77.2295 });
  await ensureProvider(users.delivery.id, ["delivery", "pickup_drop"], { lat: 28.611, lng: 77.221 });

  const orderWorkflow = await ensureWorkflow(ORDER_WORKFLOW);
  const serviceWorkflow = await ensureWorkflow(SERVICE_WORKFLOW);
  await ensureConversation(users.customer.id, users.plumber.id);

  // eslint-disable-next-line no-console
  console.log("Seed completed");
  // eslint-disable-next-line no-console
  console.log("Demo password:", DEMO_PASSWORD);
  // eslint-disable-next-line no-console
  console.log("Shop profile ID:", String(shop.id));
  // eslint-disable-next-line no-console
  console.log("ORDER_FLOW workflow ID:", String(orderWorkflow.id));
  // eslint-disable-next-line no-console
  console.log("SERVICE_FLOW workflow ID:", String(serviceWorkflow.id));
  // eslint-disable-next-line no-console
  console.log("Set env ORDER_WORKFLOW_ID and SERVICE_WORKFLOW_ID to the IDs above.");
}

await prisma.$connect();
try {
  await main();
} finally {
  await prisma.$disconnect();
}
