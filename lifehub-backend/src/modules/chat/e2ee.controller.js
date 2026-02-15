import {
  consumeOneTimePreKey,
  getKeyBundle,
  publishKeyBundle
} from "./e2ee.store.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function publishBundle(req, res) {
  try {
    const payload = await publishKeyBundle({
      userId: req.user.id,
      deviceId: req.body.deviceId || req.deviceId,
      identityKey: req.body.identityKey,
      signedPreKey: req.body.signedPreKey,
      oneTimePreKeys: req.body.oneTimePreKeys || []
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getBundle(req, res) {
  try {
    const bundle = await getKeyBundle(req.params.userId, req.params.deviceId);
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });

    const oneTimePreKey = await consumeOneTimePreKey(req.params.userId, req.params.deviceId);
    res.json(jsonSafe({
      ...bundle,
      oneTimePreKey
    }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
