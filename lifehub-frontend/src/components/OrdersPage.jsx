import React, { useState, useEffect, useMemo } from 'react';
import { UiIcon } from './UiElements';
import './OrdersPage.css'; // We'll create this file next for premium styling

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export default function OrdersPage({ token, userRoles, onActionSuccess }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtering & Sorting State
  const [activeTab, setActiveTab] = useState("ALL"); // ALL, ACTIVE, COMPLETED, CANCELLED
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("NEWEST"); // NEWEST, OLDEST, HIGHEST_AMOUNT

  // Expanded Order State
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  // Download Invoice State
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchOrders();
    }
  }, [token]);

  // Derived filtered & sorted orders
  const processedOrders = useMemo(() => {
    let result = [...orders];

    // 1. Tab Filtering
    if (activeTab === "ACTIVE") {
      result = result.filter(o => !["COMPLETED", "CANCELLED", "FAILED"].includes(o.status.toUpperCase()));
    } else if (activeTab === "COMPLETED") {
      result = result.filter(o => o.status.toUpperCase() === "COMPLETED");
    } else if (activeTab === "CANCELLED") {
      result = result.filter(o => ["CANCELLED", "FAILED"].includes(o.status.toUpperCase()));
    }

    // 2. Search
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(o => {
        const matchId = String(o.id).includes(lowerQ);
        const matchShop = o.shop_profiles?.shop_name?.toLowerCase().includes(lowerQ);
        const matchProvider = o.provider_profiles?.title?.toLowerCase().includes(lowerQ);
        const matchItems = o.order_items?.some(item => item.product_name?.toLowerCase().includes(lowerQ));
        return matchId || matchShop || matchProvider || matchItems;
      });
    }

    // 3. Sorting
    result.sort((a, b) => {
      if (sortBy === "NEWEST") {
        return new Date(b.created_at) - new Date(a.created_at);
      } else if (sortBy === "OLDEST") {
        return new Date(a.created_at) - new Date(b.created_at);
      } else if (sortBy === "HIGHEST_AMOUNT") {
        return Number(b.total_amount) - Number(a.total_amount);
      }
      return 0;
    });

    return result;
  }, [orders, activeTab, searchQuery, sortBy]);

  const toggleExpand = (orderId) => {
    setExpandedOrderId(prev => prev === orderId ? null : orderId);
  };

  const getStatusColor = (status) => {
    const s = String(status).toUpperCase();
    if (["DELIVERED", "COMPLETED"].includes(s)) return "status-badge-green";
    if (["CANCELLED", "FAILED"].includes(s)) return "status-badge-red";
    if (["PENDING", "CREATED", "PLACED"].includes(s)) return "status-badge-yellow";
    return "status-badge-blue"; // IN_PROGRESS, ASSIGNED, OUT_FOR_DELIVERY
  };

  const toCurrency = (val) => {
    const num = Number(val || 0);
    return num.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getOrderSummary = (order) => {
    if (!order.order_items || order.order_items.length === 0) {
      return order.provider_profiles?.title || "Service Order";
    }
    const firstItem = order.order_items[0].product_name || "Item";
    if (order.order_items.length > 1) {
      return `${firstItem} + ${order.order_items.length - 1} more items`;
    }
    return firstItem;
  };

  const handleDownloadInvoice = async (orderId) => {
    setDownloadingInvoice(true);
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/invoice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Could not generate invoice");
      const data = await res.json();
      
      if (data.invoice?.file_url) {
        window.open(data.invoice.file_url, '_blank');
      } else {
        alert("Invoice generated! (PDF generation simulation complete)");
        fetchOrders(); // Refresh to get the invoice record
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const renderTimeline = (order) => {
    const steps = ["PLACED", "CONFIRMED", "IN_PROGRESS", "OUT_FOR_DELIVERY", "COMPLETED"];
    const serviceSteps = ["PLACED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];
    
    let currentSteps = order.shop_id ? steps : serviceSteps;
    
    // Map backend statuses to timeline statuses to keep visual timeline clean
    let mappedStatus = String(order.status).toUpperCase();
    if (["CREATED", "PENDING"].includes(mappedStatus)) mappedStatus = "PLACED";
    if (mappedStatus === "PAID" || mappedStatus === "ASSIGNED") mappedStatus = "CONFIRMED";
    
    const currentIndex = currentSteps.indexOf(mappedStatus);
    
    return (
      <div className="order-timeline-container">
        {currentSteps.map((step, index) => {
          let stepClass = "";
          if (mappedStatus === "CANCELLED" || mappedStatus === "FAILED") {
             stepClass = "cancelled";
          } else if (index < currentIndex) {
            stepClass = "done";
          } else if (index === currentIndex) {
            stepClass = "active";
          }
          
          return (
            <div key={step} className={`timeline-step ${stepClass}`}>
              <div className="timeline-dot">
                {stepClass === "done" ? "✓" : ""}
              </div>
              <div className="timeline-label">{step.replace(/_/g, " ")}</div>
              {index < currentSteps.length - 1 && <div className="timeline-line" />}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="orders-page-container">
      <div className="orders-header">
        <h1>My Orders</h1>
        <p>Track, manage, and review all your purchases and service bookings.</p>
      </div>

      <div className="orders-controls">
        <div className="orders-tabs">
          {["ALL", "ACTIVE", "COMPLETED", "CANCELLED"].map(tab => (
            <button
              key={tab}
              className={`order-tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="orders-filters">
          <div className="search-box">
            <UiIcon name="search" />
            <input
              type="text"
              placeholder="Search by Order ID, Product, or Shop"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="sort-dropdown"
            value={sortBy} 
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="NEWEST">Newest First</option>
            <option value="OLDEST">Oldest First</option>
            <option value="HIGHEST_AMOUNT">Highest Amount</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="orders-loading">Loading your orders...</div>
      ) : error ? (
        <div className="orders-error">{error}</div>
      ) : processedOrders.length === 0 ? (
        <div className="orders-empty">
          <UiIcon name="cart" size={48} />
          <h3>No Orders Found</h3>
          <p>We couldn't find any orders matching your criteria.</p>
        </div>
      ) : (
        <div className="orders-list">
          {processedOrders.map(order => {
             const isExpanded = expandedOrderId === order.id;
             return (
              <div key={order.id} className={`order-card ${isExpanded ? "expanded" : ""}`}>
                <div className="order-card-header" onClick={() => toggleExpand(order.id)}>
                  <div className="order-basic-info">
                    <div className="order-id-date">
                      <span className="order-id">Order #{order.id}</span>
                      <span className="order-date">{formatDate(order.created_at)}</span>
                    </div>
                    <h3 className="order-summary">{getOrderSummary(order)}</h3>
                    {order.shop_profiles && (
                      <span className="order-vendor">Sold by: {order.shop_profiles.shop_name}</span>
                    )}
                    {order.provider_profiles && (
                      <span className="order-vendor">Provider: {order.provider_profiles.title}</span>
                    )}
                  </div>
                  
                  <div className="order-price-status">
                    <span className="order-total">{toCurrency(order.total_amount)}</span>
                    <span className={`order-status-badge ${getStatusColor(order.status)}`}>
                      {String(order.status).replace(/_/g, " ")}
                    </span>
                    <button className="expand-btn">
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="order-expanded-details">
                    <div className="order-tracking-section">
                      <h4>Order Tracking</h4>
                      {renderTimeline(order)}
                    </div>

                    <div className="order-details-grid">
                      <div className="order-items-list">
                        <h4>Items</h4>
                        {order.order_items && order.order_items.length > 0 ? (
                          order.order_items.map(item => (
                            <div key={item.id} className="order-item-row">
                              <div className="item-name-qty">
                                <span className="item-qty">{item.quantity}x</span>
                                <span className="item-name">{item.product_name}</span>
                              </div>
                              <span className="item-price">{toCurrency(Number(item.price) * Number(item.quantity))}</span>
                            </div>
                          ))
                        ) : (
                          <div className="order-item-row">
                            <span>{order.provider_profiles?.title || "Service Booking"}</span>
                          </div>
                        )}
                      </div>

                      <div className="order-payment-summary">
                        <h4>Payment Summary</h4>
                        <div className="payment-row">
                          <span>Item Total</span>
                          <span>{toCurrency(order.item_price)}</span>
                        </div>
                        <div className="payment-row">
                          <span>Tax</span>
                          <span>{toCurrency(order.tax)}</span>
                        </div>
                        <div className="payment-row">
                          <span>Platform Fee</span>
                          <span>{toCurrency(order.platform_fee)}</span>
                        </div>
                        <div className="payment-row total-row">
                          <span>Total Amount</span>
                          <span>{toCurrency(order.total_amount)}</span>
                        </div>
                        <div className="payment-method-row">
                          <span>Paid via {order.payment_method}</span>
                          <span className={`payment-status ${order.payment_status.toLowerCase()}`}>
                            {order.payment_status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="order-actions-footer">
                      {['COMPLETED'].includes(order.status.toUpperCase()) && (
                        <button 
                          className="btn-download-invoice"
                          onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(order.id); }}
                          disabled={downloadingInvoice}
                        >
                          <UiIcon name="download" /> {downloadingInvoice ? "Generating..." : "Download Invoice"}
                        </button>
                      )}
                      
                      {/* Only show 'Need Help?' button, actions like payout/confirm are better suited for specific action modules or admins, but we can add them here if needed by users later */}
                      <button className="btn-support ghost-btn">Need Help?</button>
                    </div>
                  </div>
                )}
              </div>
             )
          })}
        </div>
      )}
    </div>
  );
}
