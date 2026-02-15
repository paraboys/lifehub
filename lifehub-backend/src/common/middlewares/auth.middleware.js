import jwt from "jsonwebtoken";
import prisma from "../../config/db.js";

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ error: "Auth required" });

    const token = header.split(" ")[1];

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.users.findUnique({
      where: { id: BigInt(payload.id) },
      include: {
        user_roles: {
          include: { roles: true }
        }
      }
    });

    if (!user) return res.status(401).json({ error: "Invalid token" });

    const resolvedRoles = (user.user_roles || [])
      .map(row => row.roles?.role_name)
      .filter(Boolean)
      .map(role => String(role).toUpperCase());

    req.user = {
      id: user.id.toString(),
      name: user.name,
      phone: user.phone,
      roles: resolvedRoles.length ? resolvedRoles : ["CUSTOMER"]
    };
    req.deviceId = req.headers["x-device-id"]
      ? String(req.headers["x-device-id"])
      : String(req.headers["user-agent"] || "unknown-device");
    req.clientIp = req.ip;

    next();
  } catch {
    res.status(401).json({ error: "Token expired/invalid" });
  }
};
