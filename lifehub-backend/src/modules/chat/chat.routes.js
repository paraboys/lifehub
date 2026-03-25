import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  createConversation,
  createConversationByPhone,
  createGroupConversationByPhones,
  listConversations,
  resolveContacts,
  listContactDirectory,
  requestContact,
  respondContactRequest,
  listMessages,
  sendMessage,
  markRead,
  markDelivered,
  typing,
  presence,
  presenceList,
  sync,
  createStory,
  listStories
} from "./chat.controller.js";
import { getBundle, publishBundle } from "./e2ee.controller.js";

const router = Router();
const allowChatRole = authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN");

router.post("/conversations", authenticate, allowChatRole, abuseGuard("chat"), createConversation);
router.post("/conversations/by-phone", authenticate, allowChatRole, abuseGuard("chat"), createConversationByPhone);
router.post("/conversations/group-by-phones", authenticate, allowChatRole, abuseGuard("chat"), createGroupConversationByPhones);
router.get("/conversations", authenticate, allowChatRole, abuseGuard("chat"), listConversations);
router.post("/contacts/resolve", authenticate, allowChatRole, abuseGuard("chat"), resolveContacts);
router.get("/contacts", authenticate, allowChatRole, abuseGuard("chat"), listContactDirectory);
router.post("/contacts/request", authenticate, allowChatRole, abuseGuard("chat"), requestContact);
router.post("/contacts/requests/:requestId/respond", authenticate, allowChatRole, abuseGuard("chat"), respondContactRequest);
router.get("/conversations/:conversationId/messages", authenticate, allowChatRole, abuseGuard("chat"), listMessages);
router.post("/conversations/:conversationId/messages", authenticate, allowChatRole, abuseGuard("chat"), sendMessage);
router.post("/conversations/:conversationId/read", authenticate, allowChatRole, abuseGuard("chat"), markRead);
router.post("/conversations/:conversationId/delivered", authenticate, allowChatRole, abuseGuard("chat"), markDelivered);
router.post("/conversations/:conversationId/typing", authenticate, allowChatRole, abuseGuard("chat"), typing);
router.get("/presence", authenticate, allowChatRole, abuseGuard("chat"), presenceList);
router.get("/presence/:userId", authenticate, allowChatRole, abuseGuard("chat"), presence);
router.get("/sync", authenticate, allowChatRole, abuseGuard("chat"), sync);
router.post("/e2ee/bundles/me", authenticate, allowChatRole, abuseGuard("chat"), publishBundle);
router.get("/e2ee/bundles/:userId/:deviceId", authenticate, allowChatRole, abuseGuard("chat"), getBundle);


router.get("/stories", authenticate, allowChatRole, abuseGuard("chat"), listStories);
router.post("/stories", authenticate, allowChatRole, abuseGuard("chat"), createStory);
export default router;
