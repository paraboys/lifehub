import * as serviceRequestService from "./serviceRequest.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function createServiceRequest(req, res) {
  try {
    const payload = await serviceRequestService.createServiceRequest({
      userId: req.user.id,
      serviceType: req.body.serviceType,
      description: req.body.description,
      preferredProviderId: req.body.preferredProviderId
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listServiceRequests(req, res) {
  try {
    const rows = await serviceRequestService.listServiceRequests({
      userId: req.user.id,
      status: req.query.status,
      limit: req.query.limit,
      roles: req.user.roles || []
    });
    res.json(jsonSafe({ requests: rows }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getServiceRequest(req, res) {
  try {
    const row = await serviceRequestService.getServiceRequestByActor({
      requestId: req.params.requestId,
      userId: req.user.id,
      roles: req.user.roles || []
    });
    res.json(jsonSafe(row));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

export async function assignProvider(req, res) {
  try {
    const row = await serviceRequestService.assignProvider({
      requestId: req.params.requestId,
      providerId: req.body.providerId
    });
    res.json(jsonSafe(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function cancelServiceRequest(req, res) {
  try {
    const row = await serviceRequestService.cancelServiceRequest({
      requestId: req.params.requestId,
      userId: req.user.id,
      roles: req.user.roles || [],
      reason: req.body.reason
    });
    res.json(jsonSafe(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function completeServiceRequest(req, res) {
  try {
    const row = await serviceRequestService.markServiceCompleted({
      requestId: req.params.requestId,
      userId: req.user.id,
      roles: req.user.roles || []
    });
    res.json(jsonSafe(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
