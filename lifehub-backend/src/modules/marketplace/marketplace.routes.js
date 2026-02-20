import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  searchProviders,
  getProvider,
  searchShops,
  searchProducts,
  getShopProducts,
  createShopProduct,
  updateShopProduct,
  upsertShopInventory,
  createShopFeedback,
  getShopFeedback,
  updateShopLocation,
  updateProviderLocation
} from "./marketplace.controller.js";

const router = Router();

router.get("/providers/search", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), searchProviders);
router.get("/providers/:providerId", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), getProvider);
router.get("/shops/search", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), searchShops);
router.get("/products/search", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), searchProducts);
router.get("/shops/:shopId/products", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), getShopProducts);
router.get("/shops/:shopId/feedback", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), getShopFeedback);
router.post("/shops/:shopId/products", authenticate, authorize("SHOPKEEPER", "BUSINESS", "ADMIN"), createShopProduct);
router.post("/shops/:shopId/inventory/bulk", authenticate, authorize("SHOPKEEPER", "BUSINESS", "ADMIN"), upsertShopInventory);
router.post("/shops/:shopId/feedback", authenticate, authorize("CUSTOMER", "BUSINESS", "ADMIN"), createShopFeedback);
router.put("/products/:productId", authenticate, authorize("SHOPKEEPER", "BUSINESS", "ADMIN"), updateShopProduct);
router.put("/shops/:shopId/location", authenticate, authorize("SHOPKEEPER", "BUSINESS", "ADMIN"), updateShopLocation);
router.put("/providers/:providerId/location", authenticate, authorize("PROVIDER", "BUSINESS", "ADMIN"), updateProviderLocation);

export default router;
