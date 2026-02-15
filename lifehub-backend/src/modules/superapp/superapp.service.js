import prisma from "../../config/db.js";
import { searchProviders } from "../marketplace/marketplace.service.js";

export async function getHomeData(userId) {
  const uid = BigInt(userId);

  const [user, orders, serviceRequests, conversations, notifications, providers] =
    await Promise.all([
      prisma.users.findUnique({
        where: { id: uid },
        select: { id: true, name: true, phone: true, email: true }
      }),
      prisma.orders.findMany({
        where: { user_id: uid },
        orderBy: { created_at: "desc" },
        take: 5
      }),
      prisma.service_requests.findMany({
        where: { user_id: uid },
        orderBy: { created_at: "desc" },
        take: 5
      }),
      prisma.conversation_participants.findMany({
        where: { user_id: uid },
        include: { conversations: true },
        take: 10
      }),
      prisma.notifications.findMany({
        where: { user_id: uid },
        orderBy: { created_at: "desc" },
        take: 10
      }),
      searchProviders({ availableOnly: true, limit: 8 })
    ]);

  const orderIds = orders.map(o => o.id);
  const workflows = orderIds.length
    ? await prisma.workflow_instances.findMany({
        where: {
          entity_type: "ORDER",
          entity_id: { in: orderIds }
        },
        orderBy: { started_at: "desc" },
        take: 20
      })
    : [];

  return {
    user,
    dashboard: {
      activeOrders: orders.filter(o => !["CANCELLED", "COMPLETED"].includes(o.status)).length,
      activeServiceRequests: serviceRequests.filter(
        req => !["CANCELLED", "COMPLETED"].includes(req.status)
      ).length,
      unreadNotifications: notifications.length,
      conversations: conversations.length
    },
    recentOrders: orders,
    recentServiceRequests: serviceRequests,
    conversations: conversations.map(row => row.conversations),
    notifications,
    nearbyProviders: providers,
    workflowSnapshots: workflows
  };
}
