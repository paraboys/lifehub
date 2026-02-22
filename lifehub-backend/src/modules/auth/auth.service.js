import prisma from "../../config/db.js";
import jwt from "jsonwebtoken";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken
} from "../../common/authUtils.js";
import { buildPhoneCandidates } from "./otp.service.js";

async function alignIdentitySequence(tableName, columnName = "id") {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('${tableName}', '${columnName}'),
      COALESCE((SELECT MAX(${columnName}) FROM ${tableName}), 0),
      true
    )
  `);
}

export const signupUser = async (data) => {
  const normalizedPhone = String(data.phone || "").trim();
  const normalizedEmail = data.email ? String(data.email).trim().toLowerCase() : null;
  const password = String(data.password || "");
  if (!normalizedPhone) throw new Error("phone is required");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");

  const exists = await prisma.users.findFirst({
    where: {
      OR: [
        { phone: normalizedPhone },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ]
    }
  });

  if (exists) throw new Error("User already exists");

  const normalizedRole = String(data.role || "CUSTOMER").trim().toLowerCase();
  const role = await prisma.roles.findFirst({
    where: {
      role_name: {
        equals: normalizedRole,
        mode: "insensitive"
      }
    }
  });
  if (!role) {
    throw new Error(`Invalid role: ${data.role || "CUSTOMER"}`);
  }
  const shouldCreateShopProfile = ["shopkeeper", "business"].includes(normalizedRole);
  const shouldCreateProviderProfile = normalizedRole === "provider";
  const displayName = String(data.name || "New User").trim() || "New User";

  if (shouldCreateShopProfile) {
    await alignIdentitySequence("shop_profiles", "id").catch(() => {});
  }
  if (shouldCreateProviderProfile) {
    await alignIdentitySequence("provider_profiles", "id").catch(() => {});
  }

  const user = await prisma.users.create({
    data: {
      name: displayName,
      phone: normalizedPhone,
      email: normalizedEmail,
      password_hash: await hashPassword(password),
      wallets: { create: { balance: 0 } },
      user_roles: {
        create: {
          role_id: role.id
        }
      },
      ...(shouldCreateShopProfile
        ? {
            shop_profiles: {
              create: {
                shop_name: `${displayName} Grocery`,
                address: "Please update shop address",
                verified: false,
                rating: 0
              }
            }
          }
        : {}),
      ...(shouldCreateProviderProfile
        ? {
            provider_profiles: {
              create: {
                experience_years: 0,
                verified: false,
                rating: 0
              }
            }
          }
        : {})
    }
  });

  return user;
};

export const loginUser = async (data, meta) => {
  const phoneCandidates = buildPhoneCandidates(data.phone);
  if (!phoneCandidates.length) throw new Error("Invalid credentials");

  const user = await prisma.users.findFirst({
    where: {
      phone: {
        in: phoneCandidates
      }
    },
    include: {
      user_roles: {
        include: { roles: true }
      }
    }
  });

  if (!user) throw new Error("Invalid credentials");

  const valid = await comparePassword(data.password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials");

  const payload = { id: user.id.toString() };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.user_sessions.create({
    data: {
      user_id: user.id,
      refresh_token: refreshToken,
      device: meta.device,
      ip: meta.ip,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return { accessToken, refreshToken, user };
};

export async function findUserWithRolesByPhone(rawPhone) {
  const phoneCandidates = buildPhoneCandidates(rawPhone);
  if (!phoneCandidates.length) {
    throw new Error("Phone is required");
  }

  return prisma.users.findFirst({
    where: {
      phone: {
        in: phoneCandidates
      }
    },
    include: {
      user_roles: {
        include: { roles: true }
      }
    }
  });
}

export async function resetPasswordByPhone({ phone, newPassword }) {
  const password = String(newPassword || "");
  if (password.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }

  const user = await findUserWithRolesByPhone(phone);
  if (!user) {
    throw new Error("No account found for this phone number");
  }

  await prisma.users.update({
    where: { id: user.id },
    data: {
      password_hash: await hashPassword(password)
    }
  });

  await prisma.user_sessions.deleteMany({
    where: { user_id: user.id }
  });

  return {
    userId: user.id,
    phone: user.phone
  };
}

export const rotateRefreshToken = async (oldToken) => {
  const session = await prisma.user_sessions.findUnique({
    where: { refresh_token: oldToken }
  });

  if (!session || session.expires_at < new Date())
    throw new Error("Session expired");

  const payload = jwt.verify(oldToken, process.env.JWT_REFRESH_SECRET);

  const newRefresh = generateRefreshToken({ id: payload.id });

  await prisma.user_sessions.update({
    where: { id: session.id },
    data: { refresh_token: newRefresh }
  });

  return {
    accessToken: generateAccessToken({ id: payload.id }),
    refreshToken: newRefresh
  };
};

export async function listSessions(userId) {
  return prisma.user_sessions.findMany({
    where: { user_id: BigInt(userId) },
    orderBy: { created_at: "desc" }
  });
}

export async function revokeSession(userId, sessionId) {
  const target = await prisma.user_sessions.findUnique({
    where: { id: BigInt(sessionId) }
  });
  if (!target || String(target.user_id) !== String(userId)) {
    throw new Error("Session not found");
  }

  await prisma.user_sessions.delete({
    where: { id: target.id }
  });
}
