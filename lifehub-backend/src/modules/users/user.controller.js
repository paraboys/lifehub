import prisma from "../../config/db.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";
import {
  getUserSettings,
  setUserSettings
} from "./user.settings.store.js";

export async function getProfile(req, res) {
  try {
    const user = await prisma.users.findUnique({
      where: { id: BigInt(req.user.id) },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        created_at: true,
        user_roles: {
          include: {
            roles: {
              select: {
                role_name: true
              }
            }
          }
        }
      }
    });

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(
      jsonSafe({
        ...user,
        roles: (user.user_roles || [])
          .map(item => item.roles?.role_name)
          .filter(Boolean)
          .map(role => String(role).toUpperCase())
      })
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getSettings(req, res) {
  try {
    const settings = await getUserSettings(req.user.id);
    res.json(jsonSafe(settings));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateSettings(req, res) {
  try {
    const settings = await setUserSettings(req.user.id, req.body || {});
    res.json(jsonSafe(settings));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
