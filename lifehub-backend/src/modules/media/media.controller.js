import * as mediaService from "./media.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

function requestPublicBaseUrl(req) {
  const explicit = String(process.env.MEDIA_PUBLIC_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const origin = String(req.headers.origin || "").split(",")[0].trim();
  if (origin) {
    return origin.replace(/\/+$/, "");
  }
  return "";
}

export async function initUpload(req, res) {
  try {
    const payload = await mediaService.initUpload({
      ownerId: req.user.id,
      fileName: req.body.fileName,
      fileType: req.body.fileType,
      fileSize: req.body.fileSize,
      isPrivate: req.body.isPrivate,
      publicBaseUrl: requestPublicBaseUrl(req)
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function completeUpload(req, res) {
  try {
    const payload = await mediaService.completeUpload({
      fileId: req.params.fileId,
      publicBaseUrl: requestPublicBaseUrl(req)
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getFile(req, res) {
  try {
    const payload = await mediaService.getFile(req.params.fileId, {
      publicBaseUrl: requestPublicBaseUrl(req)
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}
