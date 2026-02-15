import { getHomeData } from "./superapp.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function home(req, res) {
  try {
    const data = await getHomeData(req.user.id);
    res.json(jsonSafe(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
