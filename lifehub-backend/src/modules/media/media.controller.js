import * as mediaService from "./media.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function initUpload(req, res) {
  try {
    const payload = await mediaService.initUpload({
      ownerId: req.user.id,
      fileName: req.body.fileName,
      fileType: req.body.fileType,
      fileSize: req.body.fileSize,
      isPrivate: req.body.isPrivate
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function completeUpload(req, res) {
  try {
    const payload = await mediaService.completeUpload({
      fileId: req.params.fileId
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getFile(req, res) {
  try {
    const payload = await mediaService.getFile(req.params.fileId);
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}
