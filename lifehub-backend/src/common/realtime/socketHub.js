import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { enqueueOfflineEvent } from "./offlineEvents.js";
import {
  joinCallRoom,
  leaveCallRoom,
  listCallParticipants
} from "./callRooms.js";

let io;
const userSockets = new Map();
const onlineUsers = new Map();

function getUserRoom(userId) {
  return `user:${String(userId)}`;
}

export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.CORS_ORIGINS || "http://localhost:5173")
        .split(",")
        .map(v => v.trim()),
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      if (!token) return next(new Error("Auth token missing"));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(payload.id);
      socket.deviceId = socket.handshake.auth?.deviceId || "socket-device";
      return next();
    } catch {
      return next(new Error("Socket auth failed"));
    }
  });

  io.on("connection", socket => {
    const userId = socket.userId;
    socket.join(getUserRoom(userId));
    userSockets.set(socket.id, userId);
    onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);

    emitToUser(userId, "presence:update", {
      userId,
      online: true,
      connections: onlineUsers.get(userId)
    });

    socket.on("disconnect", () => {
      userSockets.delete(socket.id);
      const count = (onlineUsers.get(userId) || 1) - 1;
      if (count <= 0) {
        onlineUsers.delete(userId);
      } else {
        onlineUsers.set(userId, count);
      }
      emitToUser(userId, "presence:update", {
        userId,
        online: onlineUsers.has(userId),
        connections: onlineUsers.get(userId) || 0
      });
    });

    socket.on("call:join", async ({ roomId }) => {
      if (!roomId) return;
      const callRoom = `call:${roomId}`;
      socket.join(callRoom);
      await joinCallRoom({
        roomId,
        userId: userId,
        deviceId: socket.deviceId
      });

      io.to(callRoom).emit("call:participant.joined", {
        roomId,
        userId,
        participants: await listCallParticipants(roomId)
      });
    });

    socket.on("call:offer", ({ roomId, toUserId, sdp }) => {
      if (!roomId || !toUserId || !sdp) return;
      emitToUser(toUserId, "call:offer", {
        roomId,
        fromUserId: userId,
        sdp
      });
    });

    socket.on("call:answer", ({ roomId, toUserId, sdp }) => {
      if (!roomId || !toUserId || !sdp) return;
      emitToUser(toUserId, "call:answer", {
        roomId,
        fromUserId: userId,
        sdp
      });
    });

    socket.on("call:ice-candidate", ({ roomId, toUserId, candidate }) => {
      if (!roomId || !toUserId || !candidate) return;
      emitToUser(toUserId, "call:ice-candidate", {
        roomId,
        fromUserId: userId,
        candidate
      });
    });

    socket.on("call:leave", async ({ roomId }) => {
      if (!roomId) return;
      const callRoom = `call:${roomId}`;
      socket.leave(callRoom);
      await leaveCallRoom({ roomId, userId });
      io.to(callRoom).emit("call:participant.left", {
        roomId,
        userId,
        participants: await listCallParticipants(roomId)
      });
    });
  });

  return io;
}

export function emitToUser(userId, event, payload) {
  enqueueOfflineEvent(userId, event, payload).catch(() => {});
  if (!io) return;
  io.to(getUserRoom(userId)).emit(event, payload);
}

export function emitToRoom(room, event, payload) {
  if (!io) return;
  io.to(room).emit(event, payload);
}

export function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}

export function listOnlineUsers() {
  return [...onlineUsers.entries()].map(([userId, connections]) => ({
    userId,
    connections
  }));
}
