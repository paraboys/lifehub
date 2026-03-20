import fs from 'fs';

const path = './src/components/SuperAppPage.jsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '  function renderMarketplaceTab() {';
const endMarker = '  function renderServicesTab() {';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find markers!");
  process.exit(1);
}

const checkoutPart = `
        {showingCheckoutPage && (
          <article className="panel-card marketplace-page market-checkout-page commerce-section">
            <div className="market-panel-head">
              <h3>Secure Checkout</h3>
              <div className="market-action-pair">
                <button type="button" className="ghost-btn" onClick={() => setMarketplaceView("catalog")}>
                  Continue Shopping
                </button>
                {!!selectedMarketplaceDetail && (
                  <button type="button" className="ghost-btn" onClick={() => setMarketplaceView("detail")}>
                    Back to Product
                  </button>
                )}
              </div>
            </div>
            <div className="market-checkout-layout">
              <section className="market-checkout-items">
                <div className="market-panel-head">
                  <h4>Order Items</h4>
                  <small>{selectedShop ? selectedShop.shopName : "No shop selected"}</small>
                </div>
                <div className="market-cart-list">
                  {cart.map(item => (
                    <div key={item.productId} className="market-cart-item">
                      <div className="market-cart-row">
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.company || "Marketplace item"} | Unit {toCurrency(item.price)}</small>
                        </div>
                        <div className="market-cart-actions">
                          <button type="button" className="qty-btn" onClick={() => decrementCartItem(item.productId)}>-</button>
                          <input
                            value={item.quantity}
                            onChange={event => updateCartQuantity(item.productId, event.target.value)}
                            placeholder="Qty"
                          />
                          <button type="button" className="qty-btn" onClick={() => incrementCartItem(item.productId)}>+</button>
                          <button
                            type="button"
                            className="market-cart-remove"
                            onClick={() => removeFromCart(item.productId)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!cart.length && <div className="empty-line">Your cart is empty.</div>}
                </div>
                <div className="market-cart-footer">
                  <div className="market-summary-breakdown">
                    <div className="market-total-row">
                      <span>Subtotal</span>
                      <strong>{toCurrency(marketplaceSubtotal)}</strong>
                    </div>
                    <div className="market-total-row muted">
                      <span>Your savings</span>
                      <strong>-{toCurrency(marketplaceSavings)}</strong>
                    </div>
                  </div>
                  <div className="market-total-row">
                    <span>Payable now</span>
                    <strong>{toCurrency(marketplacePayable)}</strong>
                  </div>
                  {!!cart.length && (
                    <button type="button" className="ghost-btn" onClick={clearCart}>
                      Clear cart
                    </button>
                  )}
                  <select value={checkoutMode} onChange={event => setCheckoutMode(event.target.value)}>
                    <option value="RAZORPAY">Razorpay Checkout</option>
                    <option value="WALLET">Wallet Balance</option>
                  </select>
                  <button type="button" onClick={proceedCheckout} disabled={!cart.length || !selectedShopId}>
                    Proceed Payment
                  </button>
                </div>
              </section>
              <section className="market-delivery-form checkout-form-block">
                <h4>Delivery Information</h4>
                <div className="market-delivery-grid two-col">
                  <input
                    value={deliveryDetails.recipientName}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, recipientName: event.target.value }))
                    }
                    placeholder="Full name"
                  />
                  <input
                    value={deliveryDetails.recipientPhone}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, recipientPhone: event.target.value }))
                    }
                    placeholder="Phone number"
                  />
                  <input
                    value={deliveryDetails.addressLine1}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, addressLine1: event.target.value }))
                    }
                    placeholder="House / flat / street address"
                  />
                  <input
                    value={deliveryDetails.nearbyLocation}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, nearbyLocation: event.target.value }))
                    }
                    placeholder="Nearby location / area"
                  />
                  <input
                    value={deliveryDetails.city}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, city: event.target.value }))
                    }
                    placeholder="City"
                  />
                  <input
                    value={deliveryDetails.postalCode}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, postalCode: event.target.value }))
                    }
                    placeholder="Postal / PIN code"
                  />
                  <input
                    value={deliveryDetails.landmark}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, landmark: event.target.value }))
                    }
                    placeholder="Landmark"
                  />
                  <input
                    value={deliveryDetails.deliveryNote}
                    onChange={event =>
                      setDeliveryDetails(prev => ({ ...prev, deliveryNote: event.target.value }))
                    }
                    placeholder="Delivery notes (optional)"
                  />
                </div>
                {!!checkoutValidationError && <div className="empty-line">{checkoutValidationError}</div>}
              </section>
            </div>
          </article>
        )}
`;

const replaceWith = `  function renderMarketplaceTab() {
    const showingDetailPage = marketplaceView === "detail";
    const showingCheckoutPage = marketplaceView === "checkout";
    const showingCatalog = marketplaceView === "catalog";

    // Grab a slice of the top 8 recommended for a showcase row
    const dealProducts = visibleRecommendedProducts.slice(0, 8);

    return (
      <section className="marketplace-app-shell premium-marketplace">
        <div className="premium-mp-actions-top">
           <button className="ghost-btn mp-filter-toggle" onClick={() => setFilterPanelOpen(true)}>
             <span className="mp-icon">⚙️</span> Filters
           </button>
           <button className="ghost-btn mp-cart-toggle" onClick={() => setCartDrawerOpen(true)}>
             <span className="mp-icon">🛒</span> Cart ({cart.reduce((s,i) => s + (i.quantity||1), 0)})
           </button>
        </div>

        {showingCatalog && (
          <div className="mp-catalog-view">
            {/* Super App Premium Hero */}
            <div className="mp-hero-banner">
              <h1>LifeHub Marketplace</h1>
              <p>Your one-stop shop for everything you need locally.</p>
            </div>

            <ProductRow
              title="Recommended For You"
              subtitle="Association-rule ranking + nearby pricing + reliability score"
              icon="✨"
              products={dealProducts}
              onProductClick={(p) => openMarketplaceProduct(p, p.shop || selectedShop)}
              onAddToCart={addToCart}
              onBuyNow={buyNowMarketplaceProduct}
              mediaBaseUrl={mediaBaseUrl}
            />
            
            {!!productQuery.trim() && (
              <ProductRow
                title="Search Results"
                subtitle={visibleProductResults.length + " matching products"}
                icon="🔎"
                products={visibleProductResults}
                onProductClick={(p) => openMarketplaceProduct(p, p.shop || selectedShop)}
                onAddToCart={addToCart}
                onBuyNow={buyNowMarketplaceProduct}
                mediaBaseUrl={mediaBaseUrl}
              />
            )}

            {selectedShop && (
              <ProductRow
                title={selectedShop.shopName + " Storefront"}
                subtitle={selectedShop.address || "Local vendor inventory"}
                icon="🏪"
                products={visibleShopProducts}
                onProductClick={(p) => openMarketplaceProduct(p, selectedShop)}
                onAddToCart={addToCart}
                onBuyNow={buyNowMarketplaceProduct}
                mediaBaseUrl={mediaBaseUrl}
              />
            )}
            
            <FilterDrawer
              open={filterPanelOpen}
              onClose={() => setFilterPanelOpen(false)}
              categories={marketplaceCategories}
              filters={marketFilters}
              onFiltersChange={setMarketFilters}
              onApply={(f) => setMarketFilters(f)}
            />
            
            <CartDrawer
              open={cartDrawerOpen}
              onClose={() => setCartDrawerOpen(false)}
              cart={cart}
              onIncrement={incrementCartItem}
              onDecrement={decrementCartItem}
              onRemove={removeFromCart}
              onClearCart={clearCart}
              onCheckout={goToMarketplaceCheckout}
              cartTotal={marketplacePayable}
              mediaBaseUrl={mediaBaseUrl}
            />
          </div>
        )}

        {showingDetailPage && selectedMarketplaceDetail && (
          <ProductDetailPage
            product={selectedMarketplaceDetail}
            shop={selectedShop}
            onBack={() => setMarketplaceView("catalog")}
            onAddToCart={addToCart}
            onBuyNow={buyNowMarketplaceProduct}
            onOpenReviews={() => console.log('Open reviews')}
            mediaBaseUrl={mediaBaseUrl}
            reviews={productReviews}
            onAddReview={(rating, text, file) => console.log("Review", rating, text, file)}
            relatedProducts={relatedMarketplaceProducts}
            onRelatedProductClick={(p) => openMarketplaceProduct(p, p.shop || selectedShop)}
          />
        )}
        {showingCheckoutPage ? <div dangerouslySetInnerHTML={{ __html: '<!-- checkoutPart -->' }} /> : null}
" + checkoutPart + "
      </section>
    );
  }

`;

const newContent = content.substring(0, startIndex) + replaceWith + content.substring(endIndex);
fs.writeFileSync(path, newContent, 'utf8');
console.log("Successfully replaced renderMarketplaceTab!");
