import * as callsService from "./calls.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function startCall(req, res) {
  try {
    const payload = await callsService.startCall({
      createdBy: req.user.id,
      type: req.body.type || "video",
      roomId: req.body.roomId
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function joinCall(req, res) {
  try {
    const payload = await callsService.joinCall({
      roomId: req.params.roomId,
      userId: req.user.id,
      deviceId: req.deviceId
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function leaveCall(req, res) {
  try {
    const payload = await callsService.leaveCall({
      roomId: req.params.roomId,
      userId: req.user.id
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function endCall(req, res) {
  try {
    const payload = await callsService.endCall({
      roomId: req.params.roomId
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function callState(req, res) {
  try {
    const payload = await callsService.getCallState(req.params.roomId);
    if (!payload) return res.status(404).json({ error: "Call room not found" });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function rtcConfig(_, res) {
  res.json({
    iceServers: callsService.getIceServers()
  });
}
