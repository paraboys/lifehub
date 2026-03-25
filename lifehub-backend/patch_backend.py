import os

def patch_backend():
    base_dir = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-backend\src\modules\chat"
    
    # 1. ADD TO chat.service.js
    service_path = os.path.join(base_dir, "chat.service.js")
    with open(service_path, "a", encoding="utf-8") as f:
        f.write("""
// ======= NEW STORIES LOGIC =======
const STORY_TABLE = "chat_stories";
let chatStoriesEnsured = false;

async function ensureChatStoriesTable() {
  if (chatStoriesEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${STORY_TABLE}" (
      "id" BIGSERIAL PRIMARY KEY,
      "user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "content" TEXT,
      "media_url" TEXT,
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expires_at" TIMESTAMP(6) NOT NULL
    )
  `);
  chatStoriesEnsured = true;
}

export async function createStory(userId, { content = "", mediaUrl = null }) {
  await ensureChatStoriesTable();
  const uid = String(BigInt(userId));
  
  // 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  const c = content ? `'${content.replace(/'/g, "''")}'` : "NULL";
  const m = mediaUrl ? `'${mediaUrl.replace(/'/g, "''")}'` : "NULL";
  
  const res = await prisma.$queryRawUnsafe(`
    INSERT INTO "${STORY_TABLE}" ("user_id", "content", "media_url", "expires_at")
    VALUES (${uid}, ${c}, ${m}, '${expiresAt}')
    RETURNING "id", "user_id" AS "userId", "content", "media_url" AS "mediaUrl", "created_at" AS "createdAt"
  `);
  return res[0];
}

export async function listStories(userId) {
  await ensureChatStoriesTable();
  const uid = String(BigInt(userId));
  
  // First, gather all friends
  const friendsRows = await prisma.$queryRawUnsafe(`
    SELECT CASE WHEN "requester_user_id" = ${uid} THEN "addressee_user_id" ELSE "requester_user_id" END AS "contact_id"
    FROM "chat_contacts"
    WHERE ("requester_user_id" = ${uid} OR "addressee_user_id" = ${uid}) AND "status" = 'ACCEPTED'
  `);
  const friends = friendsRows.map(f => String(f.contact_id));
  friends.push(uid); // Include own stories

  if (friends.length === 0) return [];

  const inClause = friends.join(",");
  
  const stories = await prisma.$queryRawUnsafe(`
    SELECT 
      s."id", s."user_id" AS "userId", s."content", s."media_url" AS "mediaUrl", s."created_at" AS "createdAt",
      u."name", u."avatar_url" AS "avatarUrl"
    FROM "${STORY_TABLE}" s
    JOIN "users" u ON u."id" = s."user_id"
    WHERE s."user_id" IN (${inClause})
      AND s."expires_at" > CURRENT_TIMESTAMP
    ORDER BY s."created_at" DESC
  `);
  
  return stories.map(s => ({
    id: String(s.id),
    userId: String(s.userId),
    userName: s.name,
    userAvatar: s.avatarUrl,
    content: s.content,
    mediaUrl: s.mediaUrl,
    createdAt: s.createdAt
  }));
}
""")

    # 2. ADD TO chat.controller.js
    controller_path = os.path.join(base_dir, "chat.controller.js")
    with open(controller_path, "a", encoding="utf-8") as f:
        f.write("""
import { createStory as svcCreateStory, listStories as svcListStories } from "./chat.service.js";

export const createStory = async (req, res, next) => {
  try {
    const story = await svcCreateStory(req.user.id, req.body);
    res.status(201).json({ success: true, story });
  } catch (error) {
    next(error);
  }
};

export const listStories = async (req, res, next) => {
  try {
    const stories = await svcListStories(req.user.id);
    res.json({ success: true, stories });
  } catch (error) {
    next(error);
  }
};
""")

    # 3. PATCH chat.routes.js
    routes_path = os.path.join(base_dir, "chat.routes.js")
    with open(routes_path, "r", encoding="utf-8") as f:
        r_lines = f.readlines()
        
    for i, line in enumerate(r_lines):
        if "sync" in line and "from" not in line and "{" not in line:
            r_lines.insert(i + 1, "  createStory,\n  listStories\n")
            break
            
    # Add the routes at the end before default export
    for i, line in enumerate(r_lines):
        if "export default router;" in line:
            r_lines.insert(i, """
router.get("/stories", authenticate, allowChatRole, abuseGuard("chat"), listStories);
router.post("/stories", authenticate, allowChatRole, abuseGuard("chat"), createStory);
""")
            break
            
    with open(routes_path, "w", encoding="utf-8") as f:
        f.writelines(r_lines)
    
    print("Backend patched successfully")

patch_backend()
