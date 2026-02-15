import crypto from "node:crypto";
import {
  createCallRoom,
  endCallRoom,
  getCallRoom,
  joinCallRoom,
  leaveCallRoom
} from "../../common/realtime/callRooms.js";

export function getIceServers() {
  const stun = (process.env.WEBRTC_STUN_URLS || "stun:stun.l.google.com:19302")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const turn = (process.env.WEBRTC_TURN_URLS || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const servers = [
    { urls: stun }
  ];

  if (turn.length) {
    servers.push({
      urls: turn,
      username: process.env.WEBRTC_TURN_USERNAME || "",
      credential: process.env.WEBRTC_TURN_CREDENTIAL || ""
    });
  }

  return servers;
}

export async function startCall({ createdBy, type = "video", roomId }) {
  const id = roomId || `call_${crypto.randomUUID()}`;
  await createCallRoom({
    roomId: id,
    createdBy,
    type
  });

  await joinCallRoom({
    roomId: id,
    userId: createdBy,
    deviceId: "api-init"
  });

  return {
    roomId: id,
    type,
    iceServers: getIceServers()
  };
}

export async function joinCall({ roomId, userId, deviceId }) {
  await joinCallRoom({ roomId, userId, deviceId });
  return getCallRoom(roomId);
}

export async function leaveCall({ roomId, userId }) {
  await leaveCallRoom({ roomId, userId });
  return getCallRoom(roomId);
}

export async function endCall({ roomId }) {
  await endCallRoom(roomId);
  return getCallRoom(roomId);
}

export async function getCallState(roomId) {
  return getCallRoom(roomId);
}
