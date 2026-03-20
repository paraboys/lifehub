import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ratingStarsJsx(value, max = 5) {
  const filled = Math.max(0, Math.min(max, Math.round(Number(value || 0))));
  return (
    <span className="mp-stars" aria-label={`${filled} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < filled ? "mp-star filled" : "mp-star empty"}>★</span>
      ))}
    </span>
  );
}

function toCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "₹0.00";
  return `₹${amount.toFixed(2)}`;
}

function resolveMediaUrl(raw, baseUrl) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const looksLikePath = value.includes("/") || value.includes(".");
  if (!looksLikePath && !/^https?:\/\//i.test(value)) return "";
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const isAbsolute = /^https?:\/\//i.test(value);
  if (isAbsolute) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(value) && base) {
      return `${base}${value.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "")}`;
    }
    return value;
  }
  if (!base) return value;
  if (value.startsWith("/")) return `${base}${value}`;
  if (value.startsWith("cdn/") || value.startsWith("upload/")) return `${base}/${value}`;
  return `${base}/cdn/${value}`;
}

function initials(value) {
  const text = String(value || "").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || "").join("") || "?";
}

function discountPercent(price) {
  // Simulate a 5-20% original price markup for demo
  return Math.floor(8 + (Number(price || 0) % 13));
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

export function ProductCard({ product, mediaBaseUrl, onOpen, onAddToCart, onBuyNow, isInCart }) {
  const [hovered, setHovered] = useState(false);
  const imageSrc = resolveMediaUrl(product?.imageUrl, mediaBaseUrl);
  const price = Number(product?.price || 0);
  const discPct = discountPercent(price);
  const originalPrice = price / (1 - discPct / 100);
  const rating = Number(product?.rating || 0);
  const reviewCount = Number(product?.feedbackCount || 0);
  const isBestSeller = reviewCount > 20 || rating >= 4.5;
  const isTrending = price > 0 && price < 200;
  const name = product?.productName || product?.name || "Product";

  return (
    <article
      className={`mp-product-card ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Badges */}
      <div className="mp-card-badges">
        {isBestSeller && <span className="mp-badge bestseller">⭐ Best Seller</span>}
        {isTrending && !isBestSeller && <span className="mp-badge trending">🔥 Trending</span>}
        <span className="mp-badge discount">-{discPct}%</span>
      </div>

      {/* Image */}
      <button
        type="button"
        className="mp-card-image-btn"
        onClick={() => onOpen && onOpen(product)}
        tabIndex={0}
        aria-label={`View ${name}`}
      >
        <div className="mp-card-image-wrap">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={name}
              className="mp-card-image"
              loading="lazy"
            />
          ) : (
            <div className="mp-card-image-placeholder">
              <span>{initials(name)}</span>
            </div>
          )}
        </div>
      </button>

      {/* Info */}
      <div className="mp-card-body">
        <button type="button" className="mp-card-title-btn" onClick={() => onOpen && onOpen(product)}>
          <h4 className="mp-card-title">{name}</h4>
        </button>
        {product?.company && (
          <small className="mp-card-brand">{product.company}</small>
        )}

        <div className="mp-card-rating-row">
          {ratingStarsJsx(rating)}
          <span className="mp-card-review-count">({reviewCount || 0})</span>
        </div>

        <div className="mp-card-price-row">
          <strong className="mp-card-price">{toCurrency(price)}</strong>
          <span className="mp-card-original-price">{toCurrency(originalPrice)}</span>
        </div>

        {product?.availableQuantity <= 5 && product?.availableQuantity > 0 && (
          <small className="mp-card-low-stock">Only {product.availableQuantity} left!</small>
        )}
        {product?.availableQuantity === 0 && (
          <small className="mp-card-out-of-stock">Out of stock</small>
        )}
      </div>

      {/* Quick Actions (visible on hover) */}
      <div className={`mp-card-quick-actions ${hovered ? "visible" : ""}`}>
        <button
          type="button"
          className={`mp-quick-btn add-cart ${isInCart ? "in-cart" : ""}`}
          onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(product); }}
        >
          {isInCart ? "✓ Added" : "Add to Cart"}
        </button>
        <button
          type="button"
          className="mp-quick-btn buy-now"
          onClick={(e) => { e.stopPropagation(); onBuyNow && onBuyNow(product); }}
        >
          Buy Now
        </button>
      </div>
    </article>
  );
}

// ─── ProductRow ───────────────────────────────────────────────────────────────

export function ProductRow({ title, subtitle, products, mediaBaseUrl, onOpen, onAddToCart, onBuyNow, cartProductIds, icon }) {
  const scrollRef = useRef(null);

  function scrollLeft() {
    scrollRef.current?.scrollBy({ left: -320, behavior: "smooth" });
  }
  function scrollRight() {
    scrollRef.current?.scrollBy({ left: 320, behavior: "smooth" });
  }

  if (!products?.length) return null;

  return (
    <section className="mp-product-row">
      <div className="mp-row-header">
        <div className="mp-row-header-left">
          {icon && <span className="mp-row-icon">{icon}</span>}
          <div>
            <h3 className="mp-row-title">{title}</h3>
            {subtitle && <small className="mp-row-subtitle">{subtitle}</small>}
          </div>
        </div>
        <div className="mp-row-scroll-btns">
          <button type="button" className="mp-scroll-btn" onClick={scrollLeft} aria-label="Scroll left">‹</button>
          <button type="button" className="mp-scroll-btn" onClick={scrollRight} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div className="mp-product-scroll" ref={scrollRef}>
        {products.map((product, i) => {
          const pid = String(product?.productId || product?.id || i);
          return (
            <ProductCard
              key={pid}
              product={product}
              mediaBaseUrl={mediaBaseUrl}
              onOpen={onOpen}
              onAddToCart={onAddToCart}
              onBuyNow={onBuyNow}
              isInCart={cartProductIds?.has(pid)}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─── FilterDrawer ─────────────────────────────────────────────────────────────

export function FilterDrawer({ open, onClose, categories, filters, onFiltersChange, onApply }) {
  const [localFilters, setLocalFilters] = useState(filters || {});

  function handleChange(key, value) {
    const next = { ...localFilters, [key]: value };
    setLocalFilters(next);
    onFiltersChange && onFiltersChange(next);
  }

  function handleApply() {
    onApply && onApply(localFilters);
    onClose && onClose();
  }

  function handleReset() {
    const reset = { minPrice: "", maxPrice: "", minRating: "", category: "all", inStockOnly: false };
    setLocalFilters(reset);
    onFiltersChange && onFiltersChange(reset);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="mp-filter-overlay open"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            className="mp-filter-drawer open"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
          >
            <div className="mp-filter-header">
              <strong>Filters</strong>
              <button type="button" className="mp-filter-close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="mp-filter-body">
              {/* Category */}
              {categories?.length > 1 && (
                <div className="mp-filter-group">
                  <label className="mp-filter-label">Category</label>
                  <div className="mp-filter-chips">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className={`mp-filter-chip ${localFilters.category === cat ? "active" : ""}`}
                        onClick={() => handleChange("category", cat)}
                      >
                        {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Range */}
              <div className="mp-filter-group">
                <label className="mp-filter-label">Price Range</label>
                <div className="mp-filter-range-row">
                  <input
                    type="number"
                    className="mp-filter-input"
                    placeholder="Min ₹"
                    value={localFilters.minPrice || ""}
                    onChange={e => handleChange("minPrice", e.target.value)}
                    min="0"
                  />
                  <span className="mp-filter-range-sep">—</span>
                  <input
                    type="number"
                    className="mp-filter-input"
                    placeholder="Max ₹"
                    value={localFilters.maxPrice || ""}
                    onChange={e => handleChange("maxPrice", e.target.value)}
                    min="0"
                  />
                </div>
              </div>

              {/* Minimum Rating */}
              <div className="mp-filter-group">
                <label className="mp-filter-label">Minimum Rating</label>
                <div className="mp-filter-chips">
                  {[0, 3, 3.5, 4, 4.5].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={`mp-filter-chip ${Number(localFilters.minRating || 0) === r ? "active" : ""}`}
                      onClick={() => handleChange("minRating", r)}
                    >
                      {r === 0 ? "Any" : `${r}★ & up`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Availability */}
              <div className="mp-filter-group">
                <label className="mp-filter-label">Availability</label>
                <label className="mp-filter-toggle-row">
                  <input
                    type="checkbox"
                    checked={Boolean(localFilters.inStockOnly)}
                    onChange={e => handleChange("inStockOnly", e.target.checked)}
                  />
                  <span>In stock only</span>
                </label>
              </div>
            </div>

            <div className="mp-filter-footer">
              <button type="button" className="mp-filter-reset-btn" onClick={handleReset}>Reset</button>
              <button type="button" className="mp-filter-apply-btn" onClick={handleApply}>Apply Filters</button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── CartDrawer ───────────────────────────────────────────────────────────────

export function CartDrawer({ open, onClose, cart, onIncrement, onDecrement, onRemove, onClearCart, onCheckout, cartTotal, mediaBaseUrl }) {
  const safeCart = cart || [];
  const savings = safeCart.reduce((sum, item) => {
    const price = Number(item.price || 0);
    const discPct = Math.floor(8 + (Number(price || 0) % 13)); // same discount logic
    const originalPrice = price / (1 - discPct / 100);
    return sum + (originalPrice - price) * Number(item.quantity || 1);
  }, 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="mp-cart-overlay open"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            className="mp-cart-drawer open"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
          >
            <div className="mp-cart-header">
              <div className="mp-cart-header-left">
                <span className="mp-cart-header-icon">🛒</span>
                <strong>Your Cart</strong>
                <span className="mp-cart-item-count">{safeCart.reduce((s, i) => s + Number(i.quantity || 1), 0)} items</span>
              </div>
              <button type="button" className="mp-cart-close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="mp-cart-body">
              {safeCart.length === 0 && (
                <div className="mp-cart-empty">
                  <div className="mp-cart-empty-icon">🛒</div>
                  <p>Your cart is empty</p>
                  <small>Add products from the marketplace to get started.</small>
                </div>
              )}
              {safeCart.map(item => {
                const imageSrc = resolveMediaUrl(item.imageUrl, mediaBaseUrl);
                return (
                  <div key={item.productId} className="mp-cart-item">
                    <div className="mp-cart-item-img">
                      {imageSrc ? (
                        <img src={imageSrc} alt={item.name} />
                      ) : (
                        <div className="mp-cart-item-img-placeholder">{initials(item.name)}</div>
                      )}
                    </div>
                    <div className="mp-cart-item-info">
                      <strong className="mp-cart-item-name">{item.name}</strong>
                      {item.company && <small className="mp-cart-item-brand">{item.company}</small>}
                      <span className="mp-cart-item-price">{toCurrency(item.price)}</span>
                    </div>
                    <div className="mp-cart-item-controls">
                      <button type="button" className="mp-cart-qty-btn" onClick={() => onDecrement && onDecrement(item.productId)}>−</button>
                      <span className="mp-cart-qty">{item.quantity}</span>
                      <button type="button" className="mp-cart-qty-btn" onClick={() => onIncrement && onIncrement(item.productId)}>+</button>
                      <button type="button" className="mp-cart-remove-btn" onClick={() => onRemove && onRemove(item.productId)} title="Remove">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {safeCart.length > 0 && (
              <div className="mp-cart-footer">
                <div className="mp-cart-savings">
                  <span>You save</span>
                  <span className="mp-cart-savings-amount">{toCurrency(savings)}</span>
                </div>
                <div className="mp-cart-total-row">
                  <span>Total</span>
                  <strong className="mp-cart-total">{toCurrency(cartTotal || 0)}</strong>
                </div>
                <button type="button" className="mp-cart-checkout-btn" onClick={() => { onCheckout && onCheckout(); onClose && onClose(); }}>
                  Proceed to Checkout →
                </button>
                <button type="button" className="mp-cart-clear-btn" onClick={() => onClearCart && onClearCart()}>
                  Clear Cart
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── ReviewsSection ───────────────────────────────────────────────────────────

export function ReviewsSection({ reviews, onAddReview, currentUserId }) {
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  async function handleSubmit() {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await onAddReview?.({ rating, comment, imagePreview });
      setComment("");
      setRating(5);
      setImagePreview(null);
      setFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }

  const avgRating = reviews?.length
    ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length
    : 0;

  return (
    <div className="mp-reviews-section">
      <div className="mp-reviews-header">
        <div className="mp-reviews-summary">
          <span className="mp-reviews-avg-score">{avgRating.toFixed(1)}</span>
          <div>
            {ratingStarsJsx(avgRating)}
            <small>{reviews?.length || 0} reviews</small>
          </div>
        </div>
        <button type="button" className="mp-add-review-btn" onClick={() => setFormOpen(v => !v)}>
          {formOpen ? "Cancel" : "✍ Write a Review"}
        </button>
      </div>

      {/* Rating Breakdown */}
      {reviews?.length > 0 && (
        <div className="mp-rating-breakdown">
          {[5, 4, 3, 2, 1].map(star => {
            const count = reviews.filter(r => Math.round(Number(r.rating || 0)) === star).length;
            const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
            return (
              <div key={star} className="mp-rating-bar-row">
                <span className="mp-rating-bar-label">{star}★</span>
                <div className="mp-rating-bar-track">
                  <div className="mp-rating-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="mp-rating-bar-count">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Review Form */}
      {formOpen && (
        <div className="mp-review-form">
          <h4>Your Review</h4>
          <div className="mp-review-star-picker">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                className={`mp-review-star ${star <= (hoverRating || rating) ? "active" : ""}`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`${star} star`}
              >★</button>
            ))}
            <small className="mp-review-star-label">
              {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][hoverRating || rating]}
            </small>
          </div>
          <textarea
            className="mp-review-textarea"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Share your experience with this product..."
            rows={4}
          />
          <div className="mp-review-form-actions">
            {imagePreview ? (
              <div className="mp-review-image-preview-wrap">
                <img src={imagePreview} alt="Review preview" className="mp-review-image-preview" />
                <button type="button" className="mp-review-image-remove" onClick={() => setImagePreview(null)}>✕</button>
              </div>
            ) : (
              <button type="button" className="mp-review-upload-btn" onClick={() => fileRef.current?.click()}>
                📷 Add Photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden-file-input" onChange={handleImageChange} />
            <button
              type="button"
              className="mp-review-submit-btn"
              onClick={handleSubmit}
              disabled={submitting || !comment.trim()}
            >
              {submitting ? "Submitting..." : "Post Review"}
            </button>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="mp-reviews-list">
        {(reviews || []).map((review, i) => (
          <article key={review.id || i} className="mp-review-card">
            <div className="mp-review-card-header">
              <div className="mp-review-avatar">{initials(review.customer?.name || review.userName || "U")}</div>
              <div className="mp-review-meta">
                <strong>{review.customer?.name || review.userName || "Customer"}</strong>
                <div className="mp-review-card-stars">{ratingStarsJsx(review.rating)}</div>
              </div>
              <small className="mp-review-date">
                {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ""}
              </small>
            </div>
            <p className="mp-review-comment">{review.comment || "No written comment."}</p>
            {review.imageUrl && (
              <img src={review.imageUrl} alt="Review" className="mp-review-image" />
            )}
          </article>
        ))}
        {!reviews?.length && (
          <div className="mp-reviews-empty">
            <span>💬</span>
            <p>No reviews yet. Be the first to share your experience!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ProductDetailPage ────────────────────────────────────────────────────────

export function ProductDetailPage({
  product,
  reviews,
  relatedProducts,
  mediaBaseUrl,
  cartProductIds,
  onAddToCart,
  onBuyNow,
  onBack,
  onOpenRelated,
  onAddReview,
  currentUserId
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  if (!product) return null;

  const price = Number(product.price || 0);
  const discPct = discountPercent(price);
  const originalPrice = price / (1 - discPct / 100);
  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.feedbackCount || 0);
  const mainImageSrc = resolveMediaUrl(product.imageUrl, mediaBaseUrl);
  // For now treat as single image; extend to gallery array in production
  const galleryImages = mainImageSrc ? [mainImageSrc] : [];
  const isInCart = cartProductIds?.has(String(product.productId));
  const available = Number(product.availableQuantity || 0);

  return (
    <div className="mp-detail-page">
      {/* Back bar */}
      <div className="mp-detail-backbar">
        <button type="button" className="mp-detail-back-btn" onClick={onBack}>
          ← Back to Marketplace
        </button>
      </div>

      <div className="mp-detail-grid">
        {/* Image Gallery */}
        <div className="mp-detail-gallery">
          <div
            className={`mp-detail-main-image-wrap ${zoomed ? "zoomed" : ""}`}
            onMouseEnter={() => setZoomed(true)}
            onMouseLeave={() => setZoomed(false)}
          >
            {galleryImages[selectedImageIndex] ? (
              <img
                src={galleryImages[selectedImageIndex]}
                alt={product.name}
                className="mp-detail-main-image"
              />
            ) : (
              <div className="mp-detail-image-placeholder">
                <span>{initials(product.name)}</span>
              </div>
            )}
            <div className="mp-detail-zoom-hint">🔍 Hover to zoom</div>
          </div>
          {galleryImages.length > 1 && (
            <div className="mp-detail-thumbnails">
              {galleryImages.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  className={`mp-detail-thumb ${i === selectedImageIndex ? "active" : ""}`}
                  onClick={() => setSelectedImageIndex(i)}
                >
                  <img src={src} alt={`View ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="mp-detail-info">
          <div className="mp-detail-badges">
            <span className="mp-badge discount">-{discPct}% OFF</span>
            {rating >= 4.5 && <span className="mp-badge bestseller">⭐ Best Seller</span>}
            {available <= 5 && available > 0 && <span className="mp-badge low-stock">⚡ Only {available} left</span>}
          </div>

          <h2 className="mp-detail-title">{product.name}</h2>
          {product.company && <p className="mp-detail-brand">by <strong>{product.company}</strong></p>}

          <div className="mp-detail-rating-row">
            {ratingStarsJsx(rating)}
            <span className="mp-detail-rating-val">{rating.toFixed(1)}</span>
            <span className="mp-detail-review-count">({reviewCount} ratings)</span>
          </div>

          <div className="mp-detail-price-block">
            <strong className="mp-detail-price">{toCurrency(price)}</strong>
            <span className="mp-detail-original-price">{toCurrency(originalPrice)}</span>
            <span className="mp-detail-savings-tag">You save {toCurrency(originalPrice - price)}</span>
          </div>

          {product.description && (
            <p className="mp-detail-description">{product.description}</p>
          )}

          {/* Features list */}
          <ul className="mp-detail-features">
            <li>✓ Free delivery on orders above ₹499</li>
            <li>✓ Easy 7-day returns</li>
            <li>✓ Verified seller product</li>
            {product.shop?.shopName && <li>✓ Sold by {product.shop.shopName}</li>}
          </ul>

          <div className="mp-detail-stock-info">
            {available > 0 ? (
              <span className="mp-detail-in-stock">✔ In Stock ({available} available)</span>
            ) : (
              <span className="mp-detail-out-stock">✗ Out of Stock</span>
            )}
          </div>

          <div className="mp-detail-actions">
            <button
              type="button"
              className={`mp-detail-add-btn ${isInCart ? "in-cart" : ""}`}
              onClick={() => onAddToCart && onAddToCart({
                id: product.productId,
                name: product.name,
                company: product.company,
                description: product.description,
                imageUrl: product.imageUrl,
                price: product.price
              })}
              disabled={available === 0}
            >
              {isInCart ? "✓ Added to Cart" : "Add to Cart"}
            </button>
            <button
              type="button"
              className="mp-detail-buy-btn"
              onClick={() => onBuyNow && onBuyNow(product, product.shop)}
              disabled={available === 0}
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div className="mp-detail-reviews">
        <h3 className="mp-detail-section-title">Customer Reviews</h3>
        <ReviewsSection
          reviews={reviews}
          onAddReview={onAddReview}
          currentUserId={currentUserId}
        />
      </div>

      {/* Related Products */}
      {relatedProducts?.length > 0 && (
        <div className="mp-detail-related">
          <ProductRow
            title="Related Products"
            subtitle="More items you might like"
            products={relatedProducts}
            mediaBaseUrl={mediaBaseUrl}
            onOpen={onOpenRelated}
            onAddToCart={onAddToCart ? p => onAddToCart({ id: p.productId, name: p.name, company: p.company, description: p.description, imageUrl: p.imageUrl, price: p.price }) : null}
            onBuyNow={onBuyNow}
            cartProductIds={cartProductIds}
            icon="🔗"
          />
        </div>
      )}
    </div>
  );
}
