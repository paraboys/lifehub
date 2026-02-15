import prisma from "../../config/db.js";

function toDecimalNumber(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
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
      ...(minRating ? { rating: { gte: minRating } } : {}),
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
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });

  const baseLat = lat !== undefined ? Number(lat) : null;
  const baseLng = lng !== undefined ? Number(lng) : null;
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
    where: { id: BigInt(providerId) },
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
  limit = 50
}) {
  const shops = await prisma.shop_profiles.findMany({
    where: {
      ...(availableOnly ? { verified: true } : {}),
      ...(minRating ? { rating: { gte: minRating } } : {})
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
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });

  const baseLat = lat !== undefined ? Number(lat) : null;
  const baseLng = lng !== undefined ? Number(lng) : null;
  const radius = Number(radiusKm || 20);

  return shops
    .map(shop => {
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
        rating: shop.rating,
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
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

export async function listShopProducts({
  shopId,
  category,
  limit = 100
}) {
  const products = await prisma.products.findMany({
    where: {
      shop_id: BigInt(shopId),
      ...(category
        ? {
            category: {
              contains: category,
              mode: "insensitive"
            }
          }
        : {})
    },
    include: {
      inventory: true
    },
    orderBy: { id: "desc" },
    take: Math.min(Math.max(Number(limit) || 100, 1), 200)
  });

  return products.map(product => ({
    ...product,
    availableQuantity: product.inventory?.quantity ?? 0
  }));
}

export async function searchProductsNearby({
  query,
  lat,
  lng,
  maxPrice,
  minShopRating,
  sortBy = "distance",
  radiusKm = 20,
  limit = 50
}) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const products = await prisma.products.findMany({
    where: {
      ...(maxPrice !== undefined ? { price: { lte: Number(maxPrice) } } : {}),
      OR: [
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
      ]
    },
    include: {
      inventory: true,
      shop_profiles: true
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 300)
  });

  const baseLat = lat !== undefined ? Number(lat) : null;
  const baseLng = lng !== undefined ? Number(lng) : null;
  const radius = Number(radiusKm || 20);

  return products
    .map(product => {
      const availableQuantity = Number(product.inventory?.quantity || 0);
      if (availableQuantity <= 0) return null;

      const shopLat = toDecimalNumber(product.shop_profiles?.lat);
      const shopLng = toDecimalNumber(product.shop_profiles?.lng);
      const km = distanceKm(baseLat, baseLng, shopLat, shopLng);

      return {
        productId: product.id,
        productName: product.name,
        category: product.category,
        price: Number(product.price || 0),
        availableQuantity,
        shop: {
          id: product.shop_profiles?.id || null,
          shopName: product.shop_profiles?.shop_name || "Unknown shop",
          address: product.shop_profiles?.address || null,
          rating: Number(product.shop_profiles?.rating || 0),
          verified: Boolean(product.shop_profiles?.verified)
        },
        distanceKm: km
      };
    })
    .filter(Boolean)
    .filter(item => {
      if (minShopRating === undefined || minShopRating === null) return true;
      return Number(item.shop.rating || 0) >= Number(minShopRating);
    })
    .filter(item => item.distanceKm === null || item.distanceKm <= radius)
    .sort((a, b) => {
      const da = a.distanceKm === null ? 9999 : a.distanceKm;
      const db = b.distanceKm === null ? 9999 : b.distanceKm;
      const ra = Number(a.shop.rating || 0);
      const rb = Number(b.shop.rating || 0);

      if (String(sortBy).toLowerCase() === "fair") {
        const scoreA = a.price * 0.55 + da * 0.3 - ra * 8;
        const scoreB = b.price * 0.55 + db * 0.3 - rb * 8;
        return scoreA - scoreB;
      }
      if (String(sortBy).toLowerCase() === "price") {
        return a.price - b.price;
      }
      if (da === db) return a.price - b.price;
      return da - db;
    })
    .slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
}

export async function updateShopLocation({
  actorUserId,
  actorRoles = [],
  shopId,
  lat,
  lng
}) {
  const normalizedRoles = actorRoles.map(role => String(role).toUpperCase());
  const isAdmin = normalizedRoles.includes("ADMIN") || normalizedRoles.includes("BUSINESS");
  const shop = await prisma.shop_profiles.findUnique({
    where: { id: BigInt(shopId) }
  });
  if (!shop) throw new Error("Shop not found");
  if (!isAdmin && String(shop.user_id) !== String(actorUserId)) {
    throw new Error("Only shop owner can update shop location");
  }

  return prisma.shop_profiles.update({
    where: { id: shop.id },
    data: {
      lat: Number(lat),
      lng: Number(lng)
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
  const normalizedRoles = actorRoles.map(role => String(role).toUpperCase());
  const isAdmin = normalizedRoles.includes("ADMIN") || normalizedRoles.includes("BUSINESS");
  const provider = await prisma.provider_profiles.findUnique({
    where: { id: BigInt(providerId) }
  });
  if (!provider) throw new Error("Provider not found");
  if (!isAdmin && String(provider.user_id) !== String(actorUserId)) {
    throw new Error("Only provider owner can update location");
  }

  return prisma.provider_locations.upsert({
    where: { provider_id: provider.id },
    update: {
      lat: Number(lat),
      lng: Number(lng),
      ...(available === undefined ? {} : { available: Boolean(available) })
    },
    create: {
      provider_id: provider.id,
      lat: Number(lat),
      lng: Number(lng),
      available: available === undefined ? true : Boolean(available)
    }
  });
}

export async function createShopProduct({
  actorUserId,
  actorRoles = [],
  shopId,
  name,
  price,
  category,
  quantity
}) {
  const normalizedRoles = actorRoles.map(role => String(role).toUpperCase());
  const isAdmin = normalizedRoles.includes("ADMIN") || normalizedRoles.includes("BUSINESS");

  const shop = await prisma.shop_profiles.findUnique({
    where: { id: BigInt(shopId) }
  });
  if (!shop) throw new Error("Shop not found");
  if (!isAdmin && String(shop.user_id) !== String(actorUserId)) {
    throw new Error("Only shop owner can manage this inventory");
  }
  if (!name) throw new Error("Product name is required");

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new Error("Product price must be a positive number");
  }

  const product = await prisma.products.create({
    data: {
      shop_id: BigInt(shopId),
      name: String(name).trim(),
      category: category ? String(category).trim() : null,
      price: numericPrice
    }
  });

  await prisma.inventory.upsert({
    where: { product_id: product.id },
    update: {
      quantity: Number(quantity || 0),
      last_updated: new Date()
    },
    create: {
      product_id: product.id,
      quantity: Number(quantity || 0)
    }
  });

  return prisma.products.findUnique({
    where: { id: product.id },
    include: { inventory: true }
  });
}

export async function updateShopProduct({
  actorUserId,
  actorRoles = [],
  productId,
  name,
  price,
  category,
  quantity
}) {
  const normalizedRoles = actorRoles.map(role => String(role).toUpperCase());
  const isAdmin = normalizedRoles.includes("ADMIN") || normalizedRoles.includes("BUSINESS");

  const existing = await prisma.products.findUnique({
    where: { id: BigInt(productId) },
    include: { shop_profiles: true }
  });
  if (!existing) throw new Error("Product not found");
  if (!isAdmin && String(existing.shop_profiles?.user_id) !== String(actorUserId)) {
    throw new Error("Only shop owner can update this inventory");
  }

  const payload = {};
  if (name !== undefined) payload.name = String(name).trim();
  if (category !== undefined) payload.category = category ? String(category).trim() : null;
  if (price !== undefined) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      throw new Error("Product price must be a positive number");
    }
    payload.price = numericPrice;
  }

  const updated = await prisma.products.update({
    where: { id: existing.id },
    data: payload
  });

  if (quantity !== undefined) {
    await prisma.inventory.upsert({
      where: { product_id: existing.id },
      update: {
        quantity: Number(quantity),
        last_updated: new Date()
      },
      create: {
        product_id: existing.id,
        quantity: Number(quantity)
      }
    });
  }

  return prisma.products.findUnique({
    where: { id: updated.id },
    include: { inventory: true }
  });
}
