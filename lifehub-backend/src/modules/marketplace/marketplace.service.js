import prisma from "../../config/db.js";

const MAX_LIMIT = 200;
const TABLE_AVAILABILITY_CACHE_TTL_MS = 60 * 1000;
let shopFeedbackTableAvailability = {
  checkedAt: 0,
  available: null
};
let productMetadataAvailability = {
  checkedAt: 0,
  hasCompany: false,
  hasDescription: false,
  hasImageUrl: false
};

const SHOP_FEEDBACK_MIGRATION_HINT = "Run migration `20260220101000_marketplace_inventory_feedback` to enable shop feedback features.";

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isShopFeedbackTableMissingError(error) {
  const code = String(error?.code || "");
  const table = String(error?.meta?.table || "").toLowerCase();
  const column = String(error?.meta?.column || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    ["P2021", "P2022"].includes(code)
    || (message.includes("shop_feedbacks") && message.includes("does not exist"))
    || table.includes("shop_feedbacks")
    || column.includes("shop_feedbacks")
    || message.includes("relation \"shop_feedbacks\" does not exist")
  );
}

async function hasShopFeedbackTable() {
  const now = Date.now();
  if (
    shopFeedbackTableAvailability.available !== null
    && (now - shopFeedbackTableAvailability.checkedAt) < TABLE_AVAILABILITY_CACHE_TTL_MS
  ) {
    return shopFeedbackTableAvailability.available;
  }

  try {
    const rows = await prisma.$queryRawUnsafe("SELECT to_regclass('public.shop_feedbacks')::text AS table_name");
    const available = Boolean(rows?.[0]?.table_name);
    shopFeedbackTableAvailability = {
      checkedAt: now,
      available
    };
    return available;
  } catch {
    shopFeedbackTableAvailability = {
      checkedAt: now,
      available: false
    };
    return false;
  }
}

async function getProductMetadataAvailability() {
  const now = Date.now();
  if ((now - productMetadataAvailability.checkedAt) < TABLE_AVAILABILITY_CACHE_TTL_MS) {
    return productMetadataAvailability;
  }

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name IN ('company', 'description', 'image_url')
    `);

    const columns = new Set((rows || []).map(row => String(row.column_name || "").toLowerCase()));
    productMetadataAvailability = {
      checkedAt: now,
      hasCompany: columns.has("company"),
      hasDescription: columns.has("description"),
      hasImageUrl: columns.has("image_url")
    };
  } catch {
    productMetadataAvailability = {
      checkedAt: now,
      hasCompany: false,
      hasDescription: false,
      hasImageUrl: false
    };
  }

  return productMetadataAvailability;
}

function buildProductSelect({
  metadata = {},
  includeInventory = false,
  includeShop = false
} = {}) {
  return {
    id: true,
    shop_id: true,
    name: true,
    price: true,
    category: true,
    ...(metadata.hasCompany ? { company: true } : {}),
    ...(metadata.hasDescription ? { description: true } : {}),
    ...(metadata.hasImageUrl ? { image_url: true } : {}),
    ...(includeInventory
      ? {
          inventory: {
            select: {
              product_id: true,
              quantity: true,
              last_updated: true
            }
          }
        }
      : {}),
    ...(includeShop
      ? {
          shop_profiles: {
            select: {
              id: true,
              user_id: true,
              shop_name: true,
              address: true,
              lat: true,
              lng: true,
              verified: true,
              rating: true
            }
          }
        }
      : {})
  };
}

function toDecimalNumber(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function toBigInt(value, label = "id") {
  try {
    if (!hasValue(value)) throw new Error();
    return BigInt(value);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}

function clampLimit(limit, fallback = 50) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.floor(numeric), 1), MAX_LIMIT);
}

function normalizeText(value, {
  field = "value",
  maxLength = 500,
  required = false
} = {}) {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (value === null) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (text.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or less`);
  }
  return text;
}

function normalizePrice(value, { required = false } = {}) {
  if (value === undefined) {
    if (required) throw new Error("Product price is required");
    return undefined;
  }
  const numericPrice = Number(value);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new Error("Product price must be a positive number");
  }
  return Number(numericPrice.toFixed(2));
}

function normalizeQuantity(value, { required = false } = {}) {
  if (value === undefined) {
    if (required) throw new Error("Quantity is required");
    return undefined;
  }
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a whole number greater than or equal to 0");
  }
  return quantity;
}

function normalizeCoordinate(value, { field, min, max }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return Number(numeric.toFixed(6));
}

function distanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => v === null || v === undefined)) {
    return null;
  }
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function computeOpenNow() {
  const hour = new Date().getHours();
  const openHour = Number(process.env.SHOP_DEFAULT_OPEN_HOUR || 8);
  const closeHour = Number(process.env.SHOP_DEFAULT_CLOSE_HOUR || 22);
  if (openHour === closeHour) return true;
  if (openHour < closeHour) return hour >= openHour && hour < closeHour;
  return hour >= openHour || hour < closeHour;
}

async function alignIdentitySequence(tableName, columnName = "id") {
  // Sequence drift can happen on seeded/manual inserts; align before inserts.
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('${tableName}', '${columnName}'),
      COALESCE((SELECT MAX(${columnName}) FROM ${tableName}), 0),
      true
    )
  `);
}

function normalizeRoles(actorRoles = []) {
  return actorRoles.map(role => String(role).toUpperCase());
}

function isAdminOrBusiness(actorRoles = []) {
  const normalizedRoles = normalizeRoles(actorRoles);
  return normalizedRoles.includes("ADMIN") || normalizedRoles.includes("BUSINESS");
}

function calculateReliabilityScore({
  rating = 0,
  feedbackCount = 0,
  verified = false
}) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating || 0)));
  const volumeBoost = Math.min(Math.log10(Number(feedbackCount || 0) + 1) / 2, 1);
  const score = normalizedRating * 16 + volumeBoost * 12 + (verified ? 8 : 0);
  return Number(Math.max(0, Math.min(100, score)).toFixed(1));
}

function mapProductForResponse(product) {
  return {
    id: product.id,
    shopId: product.shop_id,
    name: product.name,
    company: product.company || null,
    description: product.description || null,
    imageUrl: product.image_url || null,
    category: product.category || null,
    price: Number(product.price || 0),
    availableQuantity: Number(product.inventory?.quantity || 0)
  };
}

function mapShopFeedbackForResponse(feedback) {
  return {
    id: feedback.id,
    shopId: feedback.shop_id,
    userId: feedback.user_id,
    orderId: feedback.order_id,
    rating: Number(feedback.rating || 0),
    comment: feedback.comment || null,
    createdAt: feedback.created_at,
    customer: feedback.users
      ? {
          id: feedback.users.id,
          name: feedback.users.name
        }
      : null
  };
}

async function getShopFeedbackSummaryMap(shopIds = []) {
  const seen = new Set();
  const normalizedIds = [];

  for (const shopId of shopIds) {
    if (!hasValue(shopId)) continue;
    const key = String(shopId);
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedIds.push(BigInt(key));
  }

  if (!normalizedIds.length) return new Map();
  if (!(await hasShopFeedbackTable())) return new Map();

  let grouped = [];
  try {
    grouped = await prisma.shop_feedbacks.groupBy({
      by: ["shop_id"],
      where: {
        shop_id: { in: normalizedIds }
      },
      _avg: { rating: true },
      _count: { _all: true }
    });
  } catch (error) {
    if (isShopFeedbackTableMissingError(error)) {
      return new Map();
    }
    throw error;
  }

  const summaryMap = new Map();
  for (const row of grouped) {
    summaryMap.set(String(row.shop_id), {
      avgRating: row._avg.rating === null ? null : Number(row._avg.rating),
      feedbackCount: Number(row._count?._all || 0)
    });
  }
  return summaryMap;
}

async function ensureShopEditable({
  actorUserId,
  actorRoles = [],
  shopId
}) {
  const isAdmin = isAdminOrBusiness(actorRoles);
  const normalizedActorUserId = toBigInt(actorUserId, "actorUserId");
  const normalizedRoles = normalizeRoles(actorRoles);
  const isShopkeeper = normalizedRoles.includes("SHOPKEEPER");
  const requestedShopId = hasValue(shopId) ? toBigInt(shopId, "shopId") : null;

  if (isAdmin) {
    if (!requestedShopId) throw new Error("shopId is required");
    const shop = await prisma.shop_profiles.findUnique({
      where: { id: requestedShopId }
    });
    if (!shop) throw new Error("Shop not found");
    return shop;
  }

  if (requestedShopId) {
    const requestedShop = await prisma.shop_profiles.findUnique({
      where: { id: requestedShopId }
    });
    if (requestedShop && String(requestedShop.user_id) === String(normalizedActorUserId)) {
      return requestedShop;
    }
  }

  const ownedShop = await prisma.shop_profiles.findFirst({
    where: { user_id: normalizedActorUserId },
    orderBy: { id: "asc" }
  });
  if (ownedShop) return ownedShop;

  if (!isShopkeeper) {
    throw new Error("Only shop owner can manage this inventory");
  }

  const user = await prisma.users.findUnique({
    where: { id: normalizedActorUserId },
    select: { name: true }
  });
  const fallbackName = String(user?.name || "My").trim() || "My";

  await alignIdentitySequence("shop_profiles", "id");
  return prisma.shop_profiles.create({
    data: {
      user_id: normalizedActorUserId,
      shop_name: `${fallbackName} Grocery`,
      address: "Please update shop address",
      verified: false,
      rating: 0
    }
  });
}

async function upsertInventory(productId, quantity) {
  const normalizedQuantity = normalizeQuantity(quantity ?? 0, { required: true });
  await prisma.inventory.upsert({
    where: { product_id: productId },
    update: {
      quantity: normalizedQuantity,
      last_updated: new Date()
    },
    create: {
      product_id: productId,
      quantity: normalizedQuantity
    }
  });
}

export async function refreshShopRatingFromFeedback(shopId) {
  const normalizedShopId = toBigInt(shopId, "shopId");
  const tableExists = await hasShopFeedbackTable();
  if (!tableExists) {
    const shop = await prisma.shop_profiles.findUnique({
      where: { id: normalizedShopId },
      select: {
        id: true,
        verified: true,
        rating: true
      }
    });
    if (!shop) throw new Error("Shop not found");
    const score = calculateReliabilityScore({
      rating: Number(shop.rating || 0),
      feedbackCount: 0,
      verified: Boolean(shop.verified)
    });
    return {
      shopId: shop.id,
      avgRating: Number(shop.rating || 0),
      feedbackCount: 0,
      reliabilityScore: score
    };
  }

  let grouped = [];
  let isFeedbackTableMissing = false;
  try {
    grouped = await prisma.shop_feedbacks.groupBy({
      by: ["shop_id"],
      where: { shop_id: normalizedShopId },
      _avg: { rating: true },
      _count: { _all: true }
    });
  } catch (error) {
    if (isShopFeedbackTableMissingError(error)) {
      isFeedbackTableMissing = true;
    } else {
      throw error;
    }
  }

  const averageRating = grouped[0]?._avg?.rating;
  const feedbackCount = isFeedbackTableMissing ? 0 : Number(grouped[0]?._count?._all || 0);
  const nextRating = isFeedbackTableMissing
    ? undefined
    : averageRating === null || averageRating === undefined
      ? null
      : Number(Number(averageRating).toFixed(1));

  const shop = await prisma.shop_profiles.update({
    where: { id: normalizedShopId },
    data: {
      ...(nextRating === undefined ? {} : { rating: nextRating })
    },
    select: {
      id: true,
      verified: true,
      rating: true
    }
  });

  const score = calculateReliabilityScore({
    rating: Number(shop.rating || 0),
    feedbackCount,
    verified: Boolean(shop.verified)
  });

  return {
    shopId: shop.id,
    avgRating: Number(shop.rating || 0),
    feedbackCount,
    reliabilityScore: score
  };
}

export async function searchProviders({
  skill,
  availableOnly = true,
  minRating,
  lat,
  lng,
  radiusKm = 20,
  limit = 50
}) {
  const providers = await prisma.provider_profiles.findMany({
    where: {
      ...(hasValue(minRating) ? { rating: { gte: Number(minRating) } } : {}),
      provider_locations: availableOnly ? { is: { available: true } } : undefined,
      provider_skills: skill
        ? {
            some: {
              skill_name: {
                contains: skill,
                mode: "insensitive"
              }
            }
          }
        : undefined
    },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          phone: true
        }
      },
      provider_locations: true,
      provider_skills: true
    },
    take: clampLimit(limit, 50)
  });

  const baseLat = hasValue(lat) ? Number(lat) : null;
  const baseLng = hasValue(lng) ? Number(lng) : null;
  const radius = Number(radiusKm || 20);

  const mapped = providers.map(provider => {
    const location = provider.provider_locations;
    const providerLat = location ? toDecimalNumber(location.lat) : null;
    const providerLng = location ? toDecimalNumber(location.lng) : null;
    const km = distanceKm(baseLat, baseLng, providerLat, providerLng);
    return {
      id: provider.id,
      userId: provider.users?.id || null,
      name: provider.users?.name || "Unknown provider",
      phone: provider.users?.phone || null,
      rating: provider.rating,
      verified: provider.verified,
      available: location?.available ?? false,
      experienceYears: provider.experience_years,
      location: {
        lat: providerLat,
        lng: providerLng
      },
      distanceKm: km,
      skills: provider.provider_skills.map(s => s.skill_name)
    };
  });

  return mapped
    .filter(provider => provider.distanceKm === null || provider.distanceKm <= radius)
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

export async function getProviderById(providerId) {
  const provider = await prisma.provider_profiles.findUnique({
    where: { id: toBigInt(providerId, "providerId") },
    include: {
      users: {
        select: { id: true, name: true, phone: true, email: true }
      },
      provider_locations: true,
      provider_skills: true
    }
  });
  if (!provider) throw new Error("Provider not found");
  return provider;
}

export async function searchShops({
  availableOnly = true,
  minRating,
  lat,
  lng,
  radiusKm = 20,
  sortBy = "distance",
  limit = 50
}) {
  const shops = await prisma.shop_profiles.findMany({
    where: {
      ...(availableOnly ? { verified: true } : {}),
      ...(hasValue(minRating) ? { rating: { gte: Number(minRating) } } : {})
    },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          phone: true
        }
      }
    },
    take: clampLimit(limit, 50)
  });

  const summaryMap = await getShopFeedbackSummaryMap(shops.map(shop => shop.id));
  const baseLat = hasValue(lat) ? Number(lat) : null;
  const baseLng = hasValue(lng) ? Number(lng) : null;
  const radius = Number(radiusKm || 20);
  const normalizedSort = String(sortBy || "distance").toLowerCase();

  return shops
    .map(shop => {
      const feedbackSummary = summaryMap.get(String(shop.id));
      const avgRating = feedbackSummary?.avgRating ?? Number(shop.rating || 0);
      const feedbackCount = Number(feedbackSummary?.feedbackCount || 0);
      const reliabilityScore = calculateReliabilityScore({
        rating: avgRating,
        feedbackCount,
        verified: Boolean(shop.verified)
      });

      const shopLat = toDecimalNumber(shop.lat);
      const shopLng = toDecimalNumber(shop.lng);
      const km = distanceKm(baseLat, baseLng, shopLat, shopLng);
      return {
        id: shop.id,
        ownerUserId: shop.users?.id || null,
        ownerName: shop.users?.name || null,
        ownerPhone: shop.users?.phone || null,
        shopName: shop.shop_name,
        address: shop.address,
        verified: shop.verified,
        rating: Number(avgRating || 0),
        feedbackCount,
        reliabilityScore,
        openNow: computeOpenNow(),
        location: {
          lat: shopLat,
          lng: shopLng
        },
        distanceKm: km
      };
    })
    .filter(shop => shop.distanceKm === null || shop.distanceKm <= radius)
    .sort((a, b) => {
      const da = a.distanceKm === null ? 9999 : a.distanceKm;
      const db = b.distanceKm === null ? 9999 : b.distanceKm;

      if (normalizedSort === "reliable" || normalizedSort === "reliability") {
        if (b.reliabilityScore !== a.reliabilityScore) {
          return b.reliabilityScore - a.reliabilityScore;
        }
        return da - db;
      }

      if (normalizedSort === "fair" || normalizedSort === "best") {
        const scoreA = da * 0.65 - a.reliabilityScore * 0.35;
        const scoreB = db * 0.65 - b.reliabilityScore * 0.35;
        return scoreA - scoreB;
      }

      if (da !== db) return da - db;
      return b.reliabilityScore - a.reliabilityScore;
    });
}

export async function listShopProducts({
  shopId,
  category,
  query,
  limit = 100
}) {
  const textQuery = normalizeText(query, { field: "query", maxLength: 120 });
  const metadata = await getProductMetadataAvailability();
  const textOr = [
    {
      name: {
        contains: textQuery,
        mode: "insensitive"
      }
    }
  ];
  if (metadata.hasCompany) {
    textOr.push({
      company: {
        contains: textQuery,
        mode: "insensitive"
      }
    });
  }
  if (metadata.hasDescription) {
    textOr.push({
      description: {
        contains: textQuery,
        mode: "insensitive"
      }
    });
  }

  const products = await prisma.products.findMany({
    select: buildProductSelect({
      metadata,
      includeInventory: true
    }),
    where: {
      shop_id: toBigInt(shopId, "shopId"),
      ...(category
        ? {
            category: {
              contains: String(category).trim(),
              mode: "insensitive"
            }
          }
        : {}),
      ...(textQuery
        ? {
            OR: textOr
          }
        : {})
    },
    orderBy: { id: "desc" },
    take: clampLimit(limit, 100)
  });

  return products.map(mapProductForResponse);
}

function scoreProductForFairSort(item) {
  const distance = item.distanceKm === null ? 9999 : item.distanceKm;
  return item.price * 0.55 + distance * 0.25 - item.shop.reliabilityScore * 0.2;
}

function normalizeSeedProductIds(raw) {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(",");
  const normalized = [];
  const seen = new Set();

  for (const value of parts) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    try {
      normalized.push(BigInt(text));
      seen.add(text);
    } catch {
      // Ignore invalid product ids.
    }
  }

  return normalized;
}

function pairKey(a, b) {
  const left = String(a);
  const right = String(b);
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function buildAssociationStats(orderRows = []) {
  const itemFrequency = new Map();
  const pairFrequency = new Map();
  let basketCount = 0;

  for (const order of orderRows) {
    const uniqueProducts = [...new Set(
      (order.order_items || [])
        .map(item => String(item.product_id || ""))
        .filter(Boolean)
    )];
    if (!uniqueProducts.length) continue;

    basketCount += 1;
    for (const productId of uniqueProducts) {
      itemFrequency.set(productId, Number(itemFrequency.get(productId) || 0) + 1);
    }
    for (let i = 0; i < uniqueProducts.length; i += 1) {
      for (let j = i + 1; j < uniqueProducts.length; j += 1) {
        const key = pairKey(uniqueProducts[i], uniqueProducts[j]);
        pairFrequency.set(key, Number(pairFrequency.get(key) || 0) + 1);
      }
    }
  }

  return {
    basketCount,
    itemFrequency,
    pairFrequency
  };
}

function getAssociationScore({
  candidateProductId,
  seedProductIds = [],
  stats
}) {
  if (!seedProductIds.length || !stats?.basketCount) {
    return 0;
  }

  const candidateId = String(candidateProductId);
  const candidateCount = Number(stats.itemFrequency.get(candidateId) || 0);
  if (!candidateCount) return 0;

  let maxScore = 0;
  for (const seed of seedProductIds) {
    const seedId = String(seed);
    if (seedId === candidateId) continue;

    const seedCount = Number(stats.itemFrequency.get(seedId) || 0);
    const pairCount = Number(stats.pairFrequency.get(pairKey(seedId, candidateId)) || 0);
    if (!seedCount || !pairCount) continue;

    const support = pairCount / Math.max(stats.basketCount, 1);
    const confidence = pairCount / Math.max(seedCount, 1);
    const baseline = candidateCount / Math.max(stats.basketCount, 1);
    const lift = baseline > 0 ? confidence / baseline : 0;
    const normalizedLift = Math.max(0, Math.min((lift - 1) / 2, 1));
    const score = confidence * 0.7 + normalizedLift * 0.2 + support * 0.1;
    if (score > maxScore) {
      maxScore = score;
    }
  }

  return Number(maxScore.toFixed(4));
}

export async function searchProductsNearby({
  query,
  lat,
  lng,
  maxPrice,
  minShopRating,
  sortBy = "fair",
  radiusKm = 20,
  limit = 50
}) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];
  const metadata = await getProductMetadataAvailability();
  const orClauses = [
    {
      name: {
        contains: trimmed,
        mode: "insensitive"
      }
    },
    {
      category: {
        contains: trimmed,
        mode: "insensitive"
      }
    }
  ];
  if (metadata.hasCompany) {
    orClauses.push({
      company: {
        contains: trimmed,
        mode: "insensitive"
      }
    });
  }
  if (metadata.hasDescription) {
    orClauses.push({
      description: {
        contains: trimmed,
        mode: "insensitive"
      }
    });
  }

  const products = await prisma.products.findMany({
    select: buildProductSelect({
      metadata,
      includeInventory: true,
      includeShop: true
    }),
    where: {
      ...(hasValue(maxPrice) ? { price: { lte: Number(maxPrice) } } : {}),
      OR: orClauses
    },
    take: clampLimit(limit * 4, 300)
  });

  const summaryMap = await getShopFeedbackSummaryMap(
    products.map(product => product.shop_profiles?.id).filter(Boolean)
  );

  const baseLat = hasValue(lat) ? Number(lat) : null;
  const baseLng = hasValue(lng) ? Number(lng) : null;
  const radius = Number(radiusKm || 20);
  const normalizedSort = String(sortBy || "fair").toLowerCase();

  return products
    .map(product => {
      const availableQuantity = Number(product.inventory?.quantity || 0);
      if (availableQuantity <= 0) return null;

      const shopId = product.shop_profiles?.id;
      const feedbackSummary = summaryMap.get(String(shopId || ""));
      const shopRating = feedbackSummary?.avgRating ?? Number(product.shop_profiles?.rating || 0);
      const feedbackCount = Number(feedbackSummary?.feedbackCount || 0);
      const reliabilityScore = calculateReliabilityScore({
        rating: shopRating,
        feedbackCount,
        verified: Boolean(product.shop_profiles?.verified)
      });

      const shopLat = toDecimalNumber(product.shop_profiles?.lat);
      const shopLng = toDecimalNumber(product.shop_profiles?.lng);
      const km = distanceKm(baseLat, baseLng, shopLat, shopLng);

      return {
        productId: product.id,
        productName: product.name,
        company: product.company || null,
        description: product.description || null,
        imageUrl: product.image_url || null,
        category: product.category,
        price: Number(product.price || 0),
        availableQuantity,
        shop: {
          id: shopId || null,
          shopName: product.shop_profiles?.shop_name || "Unknown shop",
          address: product.shop_profiles?.address || null,
          rating: Number(shopRating || 0),
          feedbackCount,
          reliabilityScore,
          verified: Boolean(product.shop_profiles?.verified)
        },
        distanceKm: km
      };
    })
    .filter(Boolean)
    .filter(item => {
      if (!hasValue(minShopRating)) return true;
      return Number(item.shop.rating || 0) >= Number(minShopRating);
    })
    .filter(item => item.distanceKm === null || item.distanceKm <= radius)
    .sort((a, b) => {
      const da = a.distanceKm === null ? 9999 : a.distanceKm;
      const db = b.distanceKm === null ? 9999 : b.distanceKm;

      if (normalizedSort === "price") {
        if (a.price !== b.price) return a.price - b.price;
        return da - db;
      }

      if (normalizedSort === "distance") {
        if (da !== db) return da - db;
        return a.price - b.price;
      }

      if (normalizedSort === "reliable" || normalizedSort === "reliability") {
        if (b.shop.reliabilityScore !== a.shop.reliabilityScore) {
          return b.shop.reliabilityScore - a.shop.reliabilityScore;
        }
        return da - db;
      }

      if (normalizedSort === "fair" || normalizedSort === "best") {
        return scoreProductForFairSort(a) - scoreProductForFairSort(b);
      }

      if (da !== db) return da - db;
      if (a.price !== b.price) return a.price - b.price;
      return b.shop.reliabilityScore - a.shop.reliabilityScore;
    })
    .slice(0, clampLimit(limit, 50));
}

export async function recommendProductsNearby({
  lat,
  lng,
  radiusKm = 20,
  maxPrice,
  minShopRating,
  seedProductIds,
  query,
  limit = 18
}) {
  const nearbyShops = await searchShops({
    availableOnly: true,
    minRating: hasValue(minShopRating) ? Number(minShopRating) : undefined,
    lat,
    lng,
    radiusKm,
    sortBy: "fair",
    limit: 40
  });

  if (!nearbyShops.length) return [];

  const nearbyShopMap = new Map(nearbyShops.map(shop => [String(shop.id), shop]));
  const nearbyShopIds = nearbyShops.map(shop => BigInt(String(shop.id)));
  const metadata = await getProductMetadataAvailability();
  const trimmedQuery = String(query || "").trim();

  const textOr = [
    {
      name: {
        contains: trimmedQuery,
        mode: "insensitive"
      }
    },
    {
      category: {
        contains: trimmedQuery,
        mode: "insensitive"
      }
    }
  ];
  if (metadata.hasCompany) {
    textOr.push({
      company: {
        contains: trimmedQuery,
        mode: "insensitive"
      }
    });
  }
  if (metadata.hasDescription) {
    textOr.push({
      description: {
        contains: trimmedQuery,
        mode: "insensitive"
      }
    });
  }

  const products = await prisma.products.findMany({
    select: buildProductSelect({
      metadata,
      includeInventory: true,
      includeShop: true
    }),
    where: {
      shop_id: { in: nearbyShopIds },
      ...(hasValue(maxPrice) ? { price: { lte: Number(maxPrice) } } : {}),
      ...(trimmedQuery ? { OR: textOr } : {})
    },
    take: clampLimit(limit * 10, 300)
  });

  if (!products.length) return [];

  const productIds = products.map(product => product.id);
  const [salesRows, orderRows] = await Promise.all([
    prisma.order_items.groupBy({
      by: ["product_id"],
      where: {
        product_id: { in: productIds },
        orders: {
          shop_id: { in: nearbyShopIds },
          status: {
            in: ["DELIVERED", "COMPLETED"]
          }
        }
      },
      _sum: {
        quantity: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.orders.findMany({
      where: {
        shop_id: { in: nearbyShopIds },
        status: {
          in: ["DELIVERED", "COMPLETED"]
        }
      },
      orderBy: { created_at: "desc" },
      take: 600,
      select: {
        id: true,
        order_items: {
          select: {
            product_id: true
          }
        }
      }
    })
  ]);

  const salesMap = new Map(
    salesRows.map(row => [
      String(row.product_id),
      {
        unitsSold: Number(row._sum.quantity || 0),
        orderFrequency: Number(row._count?._all || 0)
      }
    ])
  );
  const associationStats = buildAssociationStats(orderRows);
  const seeds = normalizeSeedProductIds(seedProductIds);

  const values = products
    .map(product => {
      const availableQuantity = Number(product.inventory?.quantity || 0);
      if (availableQuantity <= 0) return null;

      const shop = nearbyShopMap.get(String(product.shop_id));
      const shopRating = Number(shop?.rating || product.shop_profiles?.rating || 0);
      const reliabilityScore = Number(shop?.reliabilityScore || 0);
      const distance = shop?.distanceKm === null || shop?.distanceKm === undefined
        ? null
        : Number(shop.distanceKm);
      const sales = salesMap.get(String(product.id)) || {
        unitsSold: 0,
        orderFrequency: 0
      };
      const associationScore = getAssociationScore({
        candidateProductId: product.id,
        seedProductIds: seeds,
        stats: associationStats
      });

      return {
        productId: product.id,
        productName: product.name,
        company: product.company || null,
        description: product.description || null,
        imageUrl: product.image_url || null,
        category: product.category || null,
        price: Number(product.price || 0),
        availableQuantity,
        unitsSold: sales.unitsSold,
        orderFrequency: sales.orderFrequency,
        associationScore,
        shop: {
          id: shop?.id || product.shop_profiles?.id || null,
          shopName: shop?.shopName || product.shop_profiles?.shop_name || "Unknown shop",
          address: shop?.address || product.shop_profiles?.address || null,
          rating: shopRating,
          feedbackCount: Number(shop?.feedbackCount || 0),
          reliabilityScore,
          verified: Boolean(shop?.verified || product.shop_profiles?.verified)
        },
        distanceKm: distance
      };
    })
    .filter(Boolean);

  if (!values.length) return [];

  const maxUnits = Math.max(...values.map(item => Number(item.unitsSold || 0)), 1);
  const maxOrders = Math.max(...values.map(item => Number(item.orderFrequency || 0)), 1);
  const maxAssoc = Math.max(...values.map(item => Number(item.associationScore || 0)), 0.0001);
  const minPrice = Math.min(...values.map(item => Number(item.price || 0)));
  const maxPriceObserved = Math.max(...values.map(item => Number(item.price || 0)));
  const priceRange = Math.max(maxPriceObserved - minPrice, 0.0001);

  const scored = values
    .map(item => {
      const popularity = (item.unitsSold / maxUnits) * 0.6 + (item.orderFrequency / maxOrders) * 0.4;
      const association = item.associationScore > 0 ? item.associationScore / maxAssoc : 0;
      const reliability = Number(item.shop.reliabilityScore || 0) / 100;
      const affordability = 1 - ((Number(item.price || 0) - minPrice) / priceRange);
      const distanceScore = item.distanceKm === null
        ? 0.3
        : 1 / (1 + Math.max(Number(item.distanceKm || 0), 0));
      const recommendationScore = (
        popularity * 0.35 +
        association * 0.25 +
        reliability * 0.2 +
        affordability * 0.12 +
        distanceScore * 0.08
      );

      return {
        ...item,
        recommendationScore: Number(recommendationScore.toFixed(4)),
        recommendationReason:
          association > 0.2
            ? "Frequently bought together near you"
            : popularity > 0.35
              ? "Trending in nearby stores"
              : "Best balance of rating and price"
      };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  return scored.slice(0, clampLimit(limit, 18));
}

export async function updateShopLocation({
  actorUserId,
  actorRoles = [],
  shopId,
  lat,
  lng
}) {
  const shop = await ensureShopEditable({
    actorUserId,
    actorRoles,
    shopId
  });

  return prisma.shop_profiles.update({
    where: { id: shop.id },
    data: {
      lat: normalizeCoordinate(lat, { field: "lat", min: -90, max: 90 }),
      lng: normalizeCoordinate(lng, { field: "lng", min: -180, max: 180 })
    }
  });
}

export async function updateProviderLocation({
  actorUserId,
  actorRoles = [],
  providerId,
  lat,
  lng,
  available
}) {
  const isAdmin = isAdminOrBusiness(actorRoles);
  const provider = await prisma.provider_profiles.findUnique({
    where: { id: toBigInt(providerId, "providerId") }
  });
  if (!provider) throw new Error("Provider not found");
  if (!isAdmin && String(provider.user_id) !== String(actorUserId)) {
    throw new Error("Only provider owner can update location");
  }

  return prisma.provider_locations.upsert({
    where: { provider_id: provider.id },
    update: {
      lat: normalizeCoordinate(lat, { field: "lat", min: -90, max: 90 }),
      lng: normalizeCoordinate(lng, { field: "lng", min: -180, max: 180 }),
      ...(available === undefined ? {} : { available: Boolean(available) })
    },
    create: {
      provider_id: provider.id,
      lat: normalizeCoordinate(lat, { field: "lat", min: -90, max: 90 }),
      lng: normalizeCoordinate(lng, { field: "lng", min: -180, max: 180 }),
      available: available === undefined ? true : Boolean(available)
    }
  });
}

export async function createShopProduct({
  actorUserId,
  actorRoles = [],
  shopId,
  name,
  company,
  description,
  imageUrl,
  price,
  category,
  quantity
}) {
  const shop = await ensureShopEditable({
    actorUserId,
    actorRoles,
    shopId
  });
  const metadata = await getProductMetadataAvailability();

  const product = await prisma.products.create({
    data: {
      shop_id: shop.id,
      name: normalizeText(name, { field: "name", maxLength: 120, required: true }),
      ...(metadata.hasCompany
        ? { company: normalizeText(company, { field: "company", maxLength: 120 }) }
        : {}),
      ...(metadata.hasDescription
        ? { description: normalizeText(description, { field: "description", maxLength: 2000 }) }
        : {}),
      ...(metadata.hasImageUrl
        ? { image_url: normalizeText(imageUrl, { field: "imageUrl", maxLength: 2000 }) }
        : {}),
      category: normalizeText(category, { field: "category", maxLength: 50 }),
      price: normalizePrice(price, { required: true })
    }
  });

  await upsertInventory(product.id, quantity ?? 0);

  const withInventory = await prisma.products.findUnique({
    where: { id: product.id },
    select: buildProductSelect({
      metadata,
      includeInventory: true
    })
  });
  return mapProductForResponse(withInventory);
}

export async function updateShopProduct({
  actorUserId,
  actorRoles = [],
  productId,
  shopId,
  name,
  company,
  description,
  imageUrl,
  price,
  category,
  quantity
}) {
  const isAdmin = isAdminOrBusiness(actorRoles);
  const metadata = await getProductMetadataAvailability();
  const existing = await prisma.products.findUnique({
    where: { id: toBigInt(productId, "productId") },
    select: buildProductSelect({
      metadata,
      includeInventory: true,
      includeShop: true
    })
  });

  if (!existing) throw new Error("Product not found");
  if (!isAdmin && String(existing.shop_profiles?.user_id) !== String(actorUserId)) {
    throw new Error("Only shop owner can update this inventory");
  }
  if (hasValue(shopId) && String(existing.shop_id) !== String(toBigInt(shopId, "shopId"))) {
    throw new Error("Product does not belong to this shop");
  }

  const payload = {};
  if (name !== undefined) payload.name = normalizeText(name, { field: "name", maxLength: 120, required: true });
  if (company !== undefined && metadata.hasCompany) {
    payload.company = normalizeText(company, { field: "company", maxLength: 120 });
  }
  if (description !== undefined && metadata.hasDescription) {
    payload.description = normalizeText(description, { field: "description", maxLength: 2000 });
  }
  if (imageUrl !== undefined && metadata.hasImageUrl) {
    payload.image_url = normalizeText(imageUrl, { field: "imageUrl", maxLength: 2000 });
  }
  if (category !== undefined) payload.category = normalizeText(category, { field: "category", maxLength: 50 });
  if (price !== undefined) payload.price = normalizePrice(price);

  if (!Object.keys(payload).length && quantity === undefined) {
    throw new Error("Provide at least one product field to update");
  }

  if (Object.keys(payload).length) {
    await prisma.products.update({
      where: { id: existing.id },
      data: payload
    });
  }

  if (quantity !== undefined) {
    await upsertInventory(existing.id, quantity);
  }

  const withInventory = await prisma.products.findUnique({
    where: { id: existing.id },
    select: buildProductSelect({
      metadata,
      includeInventory: true
    })
  });
  return mapProductForResponse(withInventory);
}

export async function upsertShopInventoryItems({
  actorUserId,
  actorRoles = [],
  shopId,
  items = []
}) {
  const shop = await ensureShopEditable({
    actorUserId,
    actorRoles,
    shopId
  });

  if (!Array.isArray(items) || !items.length) {
    throw new Error("At least one inventory item is required");
  }
  if (items.length > MAX_LIMIT) {
    throw new Error(`Max ${MAX_LIMIT} inventory items allowed per request`);
  }

  const results = [];
  for (const item of items) {
    if (hasValue(item?.productId)) {
      const updated = await updateShopProduct({
        actorUserId,
        actorRoles,
        productId: item.productId,
        shopId: shop.id,
        name: item.name,
        company: item.company,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        category: item.category,
        quantity: item.quantity
      });
      results.push(updated);
      continue;
    }

    const created = await createShopProduct({
      actorUserId,
      actorRoles,
      shopId: shop.id,
      name: item.name,
      company: item.company,
      description: item.description,
      imageUrl: item.imageUrl,
      price: item.price,
      category: item.category,
      quantity: item.quantity
    });
    results.push(created);
  }

  return results;
}

export async function createShopFeedback({
  actorUserId,
  shopId,
  rating,
  comment,
  orderId
}) {
  if (!(await hasShopFeedbackTable())) {
    throw new Error(`Shop feedback is temporarily unavailable. ${SHOP_FEEDBACK_MIGRATION_HINT}`);
  }

  const userId = toBigInt(actorUserId, "userId");
  const resolvedShopId = toBigInt(shopId, "shopId");
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const shop = await prisma.shop_profiles.findUnique({
    where: { id: resolvedShopId },
    select: { id: true }
  });
  if (!shop) throw new Error("Shop not found");

  const eligibleOrder = await prisma.orders.findFirst({
    where: {
      ...(hasValue(orderId) ? { id: toBigInt(orderId, "orderId") } : {}),
      user_id: userId,
      shop_id: resolvedShopId,
      status: {
        in: ["DELIVERED", "COMPLETED"]
      }
    },
    orderBy: { created_at: "desc" }
  });

  if (!eligibleOrder) {
    throw new Error("Only customers with delivered orders can submit feedback");
  }

  const normalizedComment = normalizeText(comment, {
    field: "comment",
    maxLength: 1000
  });

  try {
    const existing = await prisma.shop_feedbacks.findUnique({
      where: { order_id: eligibleOrder.id }
    });

    const feedback = existing
      ? await prisma.shop_feedbacks.update({
          where: { id: existing.id },
          data: {
            rating: Number(numericRating.toFixed(1)),
            comment: normalizedComment
          }
        })
      : await prisma.shop_feedbacks.create({
          data: {
            shop_id: resolvedShopId,
            user_id: userId,
            order_id: eligibleOrder.id,
            rating: Number(numericRating.toFixed(1)),
            comment: normalizedComment
          }
        });

    const summary = await refreshShopRatingFromFeedback(resolvedShopId);
    return {
      feedback: mapShopFeedbackForResponse(feedback),
      summary
    };
  } catch (error) {
    if (isShopFeedbackTableMissingError(error)) {
      throw new Error(`Shop feedback is temporarily unavailable. ${SHOP_FEEDBACK_MIGRATION_HINT}`);
    }
    throw error;
  }
}

export async function listShopFeedback({
  shopId,
  limit = 20
}) {
  const resolvedShopId = toBigInt(shopId, "shopId");
  const tableExists = await hasShopFeedbackTable();

  let rows = [];
  let feedbackCount = 0;
  if (tableExists) {
    try {
    [rows, feedbackCount] = await Promise.all([
      prisma.shop_feedbacks.findMany({
        where: { shop_id: resolvedShopId },
        include: {
          users: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { created_at: "desc" },
        take: clampLimit(limit, 20)
      }),
      prisma.shop_feedbacks.count({
        where: { shop_id: resolvedShopId }
      })
    ]);
    } catch (error) {
      if (!isShopFeedbackTableMissingError(error)) {
        throw error;
      }
    }
  }

  const shop = await prisma.shop_profiles.findUnique({
    where: { id: resolvedShopId },
    select: {
      id: true,
      verified: true,
      rating: true
    }
  });
  if (!shop) throw new Error("Shop not found");

  const avgRating = Number(shop.rating || 0);
  const reliabilityScore = calculateReliabilityScore({
    rating: avgRating,
    feedbackCount,
    verified: Boolean(shop.verified)
  });

  return {
    summary: {
      shopId: shop.id,
      avgRating,
      feedbackCount,
      reliabilityScore
    },
    feedback: rows.map(mapShopFeedbackForResponse)
  };
}
