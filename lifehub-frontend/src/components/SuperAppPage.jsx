import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import WorkflowGraph from "./WorkflowGraph.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL.replace(/\/api$/, "");
const DEVICE_ID_KEY = "lifehub_device_id";

function getOrCreateDeviceId() {
  if (typeof localStorage === "undefined") return "web-device";
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = `web_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

const DEFAULT_SETTINGS = {
  payments: { upiId: "", autoTopupThreshold: "", autoTopupAmount: "" },
  notifications: {
    inApp: true,
    push: true,
    sms: true,
    email: true,
    orderAlerts: true,
    marketing: false
  },
  location: {
    shareLiveLocation: true,
    locationPrecision: "precise"
  },
  ui: {
    compactMode: false,
    language: "en",
    messageDensity: "comfortable"
  },
  privacy: {
    lastSeenVisibility: "contacts",
    profilePhotoVisibility: "everyone",
    readReceipts: true
  },
  security: {
    sessionTimeoutMinutes: 120,
    loginAlerts: true
  },
  chat: {
    enterToSend: true,
    autoDownloadMedia: "wifi",
    defaultCallType: "video"
  }
};

function toCurrency(value) {
  const amount = Number(value || 0);
  return amount.toFixed(2);
}

function roleLabel(roles = []) {
  if (!roles.length) return "Customer";
  return roles[0]
    .toLowerCase()
    .replace("_", " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function tabIconName(tabId) {
  const key = String(tabId || "").toLowerCase();
  if (key === "home") return "home";
  if (key === "chat") return "chat";
  if (key === "marketplace") return "cart";
  if (key === "services") return "tool";
  if (key === "orders") return "check";
  if (key === "seller") return "store";
  if (key === "wallet") return "wallet";
  if (key === "profile") return "user";
  if (key === "ops") return "chart";
  return "settings";
}

function tabSubtitle(tabId) {
  const key = String(tabId || "").toLowerCase();
  if (key === "home") return "System health, activity, and workspace controls";
  if (key === "chat") return "Direct and group conversations with live delivery state";
  if (key === "marketplace") return "Nearby groceries with pricing and reliability scoring";
  if (key === "services") return "Book and track service providers around your location";
  if (key === "orders") return "Order lifecycle, delivery OTP, and feedback pipeline";
  if (key === "seller") return "Inventory management, product uploads, and quantity control";
  if (key === "wallet") return "Topups, settlements, and transaction visibility";
  if (key === "ops") return "Workflow and reconciliation operations";
  if (key === "profile") return "Account settings, security, and notification preferences";
  return "Module";
}

function categoryKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "uncategorized";
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatClock(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function deliveryMarker(status) {
  const normalized = String(status || "SENT").toUpperCase();
  if (normalized === "READ") return "Seen";
  if (normalized === "DELIVERED") return "Delivered";
  return "Sent";
}

function initials(value) {
  const text = String(value || "").trim();
  if (!text) return "U";
  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map(part => part[0]?.toUpperCase() || "").join("") || "U";
}

function messagePreview(value, max = 54) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "No messages yet";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function ratingStars(value) {
  const normalized = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  const full = "\u2605";
  const empty = "\u2606";
  return `${full.repeat(normalized)}${empty.repeat(5 - normalized)}`;
  return `${"★".repeat(normalized)}${"☆".repeat(5 - normalized)}`;
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function providerAvatarUrl(name) {
  const seed = encodeURIComponent(String(name || "Service Pro"));
  return `https://ui-avatars.com/api/?name=${seed}&background=0f4f84&color=ffffff&size=160&rounded=true&bold=true`;
}

function normalizeMarketplaceProduct(item, fallbackShop = null) {
  if (!item) return null;
  const productId = item.productId ?? item.id;
  if (!productId) return null;

  return {
    productId,
    name: item.productName ?? item.name ?? "Product",
    company: item.company || null,
    description: item.description || "",
    imageUrl: item.imageUrl || null,
    category: item.category || "general",
    price: Number(item.price || 0),
    availableQuantity: Number(item.availableQuantity || 0),
    shop: item.shop || fallbackShop || null
  };
}

function resolveMediaUrl(raw, baseUrl) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const looksLikePath = value.includes("/") || value.includes(".");
  if (!looksLikePath && !/^https?:\/\//i.test(value)) {
    return "";
  }
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const isAbsolute = /^https?:\/\//i.test(value);

  if (isAbsolute) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(value) && base) {
      return `${base}${value.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "")}`;
    }
    return value;
  }

  if (!base) return value;

  if (value.startsWith("/")) {
    return `${base}${value}`;
  }
  if (value.startsWith("cdn/") || value.startsWith("upload/")) {
    return `${base}/${value}`;
  }
  return `${base}/cdn/${value}`;
}

function UiIcon({ name, size = 18 }) {
  const style = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  let nodes = null;
  switch (name) {
    case "chat":
      nodes = (
        <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" {...style} />
      );
      break;
    case "home":
      nodes = (
        <>
          <path d="M3 10.5 12 3l9 7.5v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" {...style} />
        </>
      );
      break;
    case "bell":
      nodes = (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" {...style} />
          <path d="M10 21a2 2 0 0 0 4 0" {...style} />
        </>
      );
      break;
    case "cart":
      nodes = (
        <>
          <circle cx="9" cy="20" r="1.8" {...style} />
          <circle cx="18" cy="20" r="1.8" {...style} />
          <path d="M3 4h2l2.3 10.2A2 2 0 0 0 9.3 16H19a2 2 0 0 0 2-1.6L22 8H7" {...style} />
        </>
      );
      break;
    case "tool":
      nodes = <path d="M15 6a4 4 0 0 0-5 5L4 17a2 2 0 0 0 3 3l6-6a4 4 0 0 0 5-5l-3 3-2-2 3-3z" {...style} />;
      break;
    case "store":
      nodes = (
        <>
          <path d="M3 7h18l-2 4H5L3 7z" {...style} />
          <path d="M5 11v9h14v-9" {...style} />
          <path d="M9 20v-6h6v6" {...style} />
        </>
      );
      break;
    case "settings":
      nodes = (
        <>
          <circle cx="12" cy="12" r="3" {...style} />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.2a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.2a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.2a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" {...style} />
        </>
      );
      break;
    case "wallet":
      nodes = (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" ry="2" {...style} />
          <path d="M17 12h4" {...style} />
          <circle cx="16" cy="12" r="1" {...style} />
        </>
      );
      break;
    case "user":
      nodes = (
        <>
          <circle cx="12" cy="8" r="4" {...style} />
          <path d="M4 20a8 8 0 0 1 16 0" {...style} />
        </>
      );
      break;
    case "chart":
      nodes = (
        <>
          <path d="M4 19h16" {...style} />
          <path d="M6 16V9" {...style} />
          <path d="M12 16V5" {...style} />
          <path d="M18 16v-7" {...style} />
        </>
      );
      break;
    case "shield":
      nodes = (
        <>
          <path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z" {...style} />
        </>
      );
      break;
    case "refresh":
      nodes = (
        <>
          <polyline points="23 4 23 10 17 10" {...style} />
          <polyline points="1 20 1 14 7 14" {...style} />
          <path d="M3.5 9a9 9 0 0 1 15.5-3L23 10M1 14l4 4a9 9 0 0 0 15.5-3" {...style} />
        </>
      );
      break;
    case "plus":
      nodes = (
        <>
          <line x1="12" y1="5" x2="12" y2="19" {...style} />
          <line x1="5" y1="12" x2="19" y2="12" {...style} />
        </>
      );
      break;
    case "dots":
      nodes = (
        <>
          <circle cx="5" cy="12" r="1.4" {...style} />
          <circle cx="12" cy="12" r="1.4" {...style} />
          <circle cx="19" cy="12" r="1.4" {...style} />
        </>
      );
      break;
    case "search":
      nodes = (
        <>
          <circle cx="11" cy="11" r="7" {...style} />
          <line x1="20" y1="20" x2="16.7" y2="16.7" {...style} />
        </>
      );
      break;
    case "video":
      nodes = (
        <>
          <rect x="2" y="7" width="14" height="10" rx="2" ry="2" {...style} />
          <polygon points="16 10 22 7 22 17 16 14 16 10" {...style} />
        </>
      );
      break;
    case "phone":
      nodes = (
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.9 19.9 0 0 1-8.7-3.1A19.6 19.6 0 0 1 5 12.7 19.8 19.8 0 0 1 1.9 4 2 2 0 0 1 3.9 1.8h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8 9.7a16 16 0 0 0 6.3 6.3l1.2-1.2a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.5 1.8z" {...style} />
      );
      break;
    case "attach":
      nodes = <path d="M21.4 11.5l-8.7 8.7a6 6 0 1 1-8.5-8.5l8.7-8.7a4 4 0 0 1 5.7 5.7l-8.8 8.8a2 2 0 1 1-2.8-2.8l8-8" {...style} />;
      break;
    case "emoji":
      nodes = (
        <>
          <circle cx="12" cy="12" r="9" {...style} />
          <circle cx="9" cy="10" r="0.9" {...style} />
          <circle cx="15" cy="10" r="0.9" {...style} />
          <path d="M8 14c1 1.4 2.4 2 4 2s3-.6 4-2" {...style} />
        </>
      );
      break;
    case "send":
      nodes = (
        <>
          <path d="M22 2L11 13" {...style} />
          <path d="M22 2L15 22l-4-9-9-4 20-7z" {...style} />
        </>
      );
      break;
    case "check":
      nodes = <polyline points="20 7 9 18 4 13" {...style} />;
      break;
    default:
      nodes = <circle cx="12" cy="12" r="8" {...style} />;
  }

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {nodes}
    </svg>
  );
}

let razorpayScriptPromise;
function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise(resolve => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

export default function SuperAppPage({ session, onLogout, onRefreshSession }) {
  const token = session?.accessToken || "";
  const user = session?.user || {};
  const userRoles = user?.roles || [];
  const hasRole = role => userRoles.includes(role);
  const canAccess = useMemo(
    () => ({
      home: true,
      chat: true,
      marketplace: true,
      services: hasRole("CUSTOMER") || hasRole("PROVIDER") || hasRole("ADMIN") || hasRole("BUSINESS"),
      orders: hasRole("CUSTOMER") || hasRole("SHOPKEEPER") || hasRole("DELIVERY") || hasRole("ADMIN") || hasRole("BUSINESS"),
      wallet: true,
      profile: true,
      seller: hasRole("SHOPKEEPER") || hasRole("ADMIN") || hasRole("BUSINESS"),
      ops: hasRole("ADMIN") || hasRole("BUSINESS")
    }),
    [userRoles]
  );
  const canCreateServiceRequest = hasRole("CUSTOMER") || hasRole("ADMIN");
  const canCancelServiceRequest = hasRole("CUSTOMER") || hasRole("PROVIDER") || hasRole("ADMIN");
  const canCompleteServiceRequest = hasRole("CUSTOMER") || hasRole("PROVIDER") || hasRole("ADMIN");

  const tabs = useMemo(() => {
    const available = [];
    if (canAccess.home) available.push({ id: "home", label: "Home" });
    if (canAccess.chat) available.push({ id: "chat", label: "Chat" });
    if (canAccess.marketplace) available.push({ id: "marketplace", label: "Marketplace" });
    if (canAccess.services) available.push({ id: "services", label: "Book Service" });
    if (canAccess.orders) available.push({ id: "orders", label: "Orders" });
    if (canAccess.seller) available.push({ id: "seller", label: "Seller Hub" });
    if (canAccess.wallet) available.push({ id: "wallet", label: "Wallet" });
    if (canAccess.ops) available.push({ id: "ops", label: "Ops Console" });
    if (canAccess.profile) available.push({ id: "profile", label: "Settings" });
    return available;
  }, [canAccess]);
  const tabMap = useMemo(() => Object.fromEntries(tabs.map(tab => [tab.id, tab])), [tabs]);

  const [activeTab, setActiveTab] = useState("home");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [home, setHome] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const deferredCommandQuery = useDeferredValue(commandQuery);
  const deferredModuleSearch = useDeferredValue(moduleSearch);

  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [typingUsers, setTypingUsers] = useState({});
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [peerPhone, setPeerPhone] = useState("");
  const [groupPhones, setGroupPhones] = useState("");
  const [contactPhones, setContactPhones] = useState("");
  const [resolvedContacts, setResolvedContacts] = useState([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatListMode, setChatListMode] = useState("all");
  const [callSession, setCallSession] = useState({
    open: false,
    roomId: "",
    type: "video",
    status: "idle",
    incomingFrom: "",
    offerSdp: null
  });
  const [remoteCallUserId, setRemoteCallUserId] = useState("");
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);
  const [activeCallRoomId, setActiveCallRoomId] = useState("");
  const [onlineUsers, setOnlineUsers] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [chatNotifications, setChatNotifications] = useState([]);
  const [notificationPrefs, setNotificationPrefs] = useState({
    quietHours: { enabled: false, startHour: 22, endHour: 7, timezone: "UTC" },
    perEventRules: {},
    channelPriority: ["PUSH", "IN_APP", "EMAIL", "SMS"]
  });
  const [browserPushPermission, setBrowserPushPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [toast, setToast] = useState("");
  const [seenMessageIds, setSeenMessageIds] = useState(() => new Set());
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [productSearchFilters, setProductSearchFilters] = useState({
    maxPrice: "",
    minShopRating: "",
    sortBy: "fair"
  });
  const [marketCategory, setMarketCategory] = useState("all");
  const locationThrottleRef = useRef(0);
  const messageEndRef = useRef(null);

  const [shopFilters, setShopFilters] = useState({
    lat: "28.6139",
    lng: "77.2090",
    radiusKm: "8"
  });
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [shopProducts, setShopProducts] = useState([]);
  const [selectedMarketplaceProduct, setSelectedMarketplaceProduct] = useState(null);
  const [marketplaceView, setMarketplaceView] = useState("catalog");
  const [shopFeedbackSummary, setShopFeedbackSummary] = useState(null);
  const [shopFeedbackRows, setShopFeedbackRows] = useState([]);
  const [loadingShopFeedback, setLoadingShopFeedback] = useState(false);
  const [shopFeedbackError, setShopFeedbackError] = useState("");
  const [cart, setCart] = useState([]);
  const [deliveryDetails, setDeliveryDetails] = useState({
    recipientName: user.name || "",
    recipientPhone: user.phone || "",
    addressLine1: "",
    nearbyLocation: "",
    city: "",
    postalCode: "",
    landmark: "",
    deliveryNote: ""
  });
  const [checkoutValidationError, setCheckoutValidationError] = useState("");

  const [providerSkill, setProviderSkill] = useState("plumber");
  const [serviceFilters, setServiceFilters] = useState({
    lat: "28.6139",
    lng: "77.2090",
    radiusKm: "8"
  });
  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedProviderProfile, setSelectedProviderProfile] = useState(null);
  const [loadingProviderProfile, setLoadingProviderProfile] = useState(false);
  const [providerProfileError, setProviderProfileError] = useState("");
  const [myProviderProfileId, setMyProviderProfileId] = useState("");
  const [providerLocationForm, setProviderLocationForm] = useState({
    lat: "28.6139",
    lng: "77.2090",
    available: true
  });
  const [serviceForm, setServiceForm] = useState({
    serviceType: "plumber",
    description: "",
    preferredProviderId: ""
  });
  const [serviceRequests, setServiceRequests] = useState([]);

  const [orders, setOrders] = useState([]);
  const [walletSummary, setWalletSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [topupAmount, setTopupAmount] = useState("500");
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [walletAction, setWalletAction] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferForm, setTransferForm] = useState({
    recipientType: "phone",
    toPhone: "",
    toUpiId: "",
    amount: "",
    note: ""
  });
  const [receiveProfile, setReceiveProfile] = useState(null);
  const [checkoutMode, setCheckoutMode] = useState("RAZORPAY");
  const [pendingOrderAfterPayment, setPendingOrderAfterPayment] = useState(false);
  const [deliveryOtpInput, setDeliveryOtpInput] = useState("");
  const [deliveryRating, setDeliveryRating] = useState("5");
  const [deliveryFeedback, setDeliveryFeedback] = useState("");

  const [sellerForm, setSellerForm] = useState({
    shopId: "",
    name: "",
    company: "",
    description: "",
    imageUrl: "",
    category: "",
    price: "",
    quantity: "1"
  });
  const [sellerFormOpen, setSellerFormOpen] = useState(false);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [sellerImageUploading, setSellerImageUploading] = useState(false);
  const [shopLocationForm, setShopLocationForm] = useState({
    lat: "28.6139",
    lng: "77.2090"
  });
  const [workflowId, setWorkflowId] = useState("1");
  const [userSettings, setUserSettings] = useState(DEFAULT_SETTINGS);
  const profilePhotoStorageKey = useMemo(
    () => `lifehub_profile_photo_${user.id || "anonymous"}`,
    [user.id]
  );
  const [profilePhoto, setProfilePhoto] = useState("");
  const socketRef = useRef(null);
  const callSessionRef = useRef(callSession);
  const selectedConversationRef = useRef("");
  const peerConnectionRef = useRef(null);
  const localMediaStreamRef = useRef(null);
  const typingTimerRef = useRef(null);
  const filePickerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const threadSearchInputRef = useRef(null);
  const commandInputRef = useRef(null);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const canUseDeviceContacts = typeof navigator !== "undefined" && !!navigator.contacts?.select;
  const seenStoreKey = useMemo(
    () => `lifehub_seen_messages_${user.id || "anonymous"}`,
    [user.id]
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [cart]
  );
  const selectedShop = useMemo(
    () => shops.find(shop => String(shop.id) === String(selectedShopId)) || null,
    [shops, selectedShopId]
  );
  const selectedMarketplaceDetail = useMemo(
    () => normalizeMarketplaceProduct(selectedMarketplaceProduct, selectedShop),
    [selectedMarketplaceProduct, selectedShop]
  );
  const marketplaceCategories = useMemo(() => {
    const set = new Set();
    for (const product of shopProducts) {
      set.add(categoryKey(product?.category));
    }
    for (const result of productResults) {
      set.add(categoryKey(result?.category));
    }
    for (const item of recommendedProducts) {
      set.add(categoryKey(item?.category));
    }
    return ["all", ...Array.from(set).filter(value => value !== "uncategorized"), "uncategorized"];
  }, [shopProducts, productResults, recommendedProducts]);
  const visibleShopProducts = useMemo(() => {
    if (marketCategory === "all") return shopProducts;
    return shopProducts.filter(product => categoryKey(product?.category) === marketCategory);
  }, [shopProducts, marketCategory]);
  const visibleProductResults = useMemo(() => {
    if (marketCategory === "all") return productResults;
    return productResults.filter(result => categoryKey(result?.category) === marketCategory);
  }, [productResults, marketCategory]);
  const visibleRecommendedProducts = useMemo(() => {
    if (marketCategory === "all") return recommendedProducts;
    return recommendedProducts.filter(item => categoryKey(item?.category) === marketCategory);
  }, [recommendedProducts, marketCategory]);
  const relatedMarketplaceProducts = useMemo(() => {
    if (!selectedMarketplaceDetail?.productId) return [];
    const seen = new Set([String(selectedMarketplaceDetail.productId)]);
    const related = [];
    const pushIfRelated = candidate => {
      const normalized = normalizeMarketplaceProduct(candidate, selectedShop);
      if (!normalized) return;
      const key = String(normalized.productId);
      if (seen.has(key)) return;
      if (categoryKey(normalized.category) !== categoryKey(selectedMarketplaceDetail.category)) return;
      seen.add(key);
      related.push(normalized);
    };

    for (const product of shopProducts) pushIfRelated(product);
    for (const product of recommendedProducts) pushIfRelated(product);
    for (const product of productResults) pushIfRelated(product);

    return related.slice(0, 10);
  }, [
    selectedMarketplaceDetail,
    selectedShop,
    shopProducts,
    recommendedProducts,
    productResults
  ]);
  const serviceSkillOptions = useMemo(() => {
    const seed = [
      "plumber",
      "electrician",
      "ac technician",
      "cleaner",
      "carpenter",
      "appliance repair"
    ];
    const set = new Set(seed);
    for (const provider of providers) {
      for (const skill of provider?.skills || []) {
        const normalized = String(skill || "").trim().toLowerCase();
        if (normalized) set.add(normalized);
      }
    }
    return Array.from(set).slice(0, 10);
  }, [providers]);
  const topServiceProviders = useMemo(() => {
    return [...providers]
      .sort((a, b) => {
        const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        const da = a.distanceKm === null || a.distanceKm === undefined ? 9999 : Number(a.distanceKm);
        const db = b.distanceKm === null || b.distanceKm === undefined ? 9999 : Number(b.distanceKm);
        return da - db;
      })
      .slice(0, 30);
  }, [providers]);
  const selectedProviderCard = useMemo(
    () => topServiceProviders.find(provider => String(provider.id) === String(selectedProviderId)) || null,
    [topServiceProviders, selectedProviderId]
  );

  const selectedThread = useMemo(
    () => conversations.find(conv => String(conv.id) === String(selectedConversationId)) || null,
    [conversations, selectedConversationId]
  );
  const deferredChatSearch = useDeferredValue(chatSearch);
  const deferredThreadSearch = useDeferredValue(threadSearch);
  const deferredProductQuery = useDeferredValue(productQuery);
  const moduleGroups = useMemo(() => {
    const needle = deferredModuleSearch.trim().toLowerCase();
    if (needle) {
      const matches = tabs.filter(tab =>
        [tab.label, tab.id].some(value => String(value || "").toLowerCase().includes(needle))
      );
      return [{ id: "results", label: "Search Results", items: matches }];
    }

    const groupDefs = [
      { id: "core", label: "Core", items: ["home"] },
      { id: "commerce", label: "Commerce", items: ["marketplace", "orders", "wallet"] },
      { id: "services", label: "Services", items: ["services", "chat"] },
      { id: "ops", label: "Ops", items: ["seller", "ops"] },
      { id: "account", label: "Account", items: ["profile"] }
    ];

    return groupDefs
      .map(group => ({
        id: group.id,
        label: group.label,
        items: group.items.map(id => tabMap[id]).filter(Boolean)
      }))
      .filter(group => group.items.length);
  }, [deferredModuleSearch, tabMap, tabs]);

  const filteredConversations = useMemo(() => {
    if (!deferredChatSearch.trim()) return conversations;
    return conversations.filter(conv =>
      [
        conv.id,
        conv?.peers?.[0]?.name,
        conv?.peers?.[0]?.phone
      ]
        .filter(Boolean)
        .some(value =>
          String(value).toLowerCase().includes(deferredChatSearch.trim().toLowerCase())
        )
    );
  }, [conversations, deferredChatSearch]);
  const totalUnreadChats = useMemo(
    () => conversations.reduce((sum, conv) => sum + Number(conv.unreadCount || 0), 0),
    [conversations]
  );
  const moduleCards = useMemo(
    () =>
      tabs
        .filter(tab => tab.id !== "home")
        .map(tab => ({
          ...tab,
          subtitle: tabSubtitle(tab.id),
          badge:
            tab.id === "chat"
              ? totalUnreadChats
              : tab.id === "home"
                ? notifications.length
                : 0
        })),
    [tabs, totalUnreadChats, notifications.length]
  );
  const activeOrdersCount = useMemo(
    () =>
      orders.filter(order =>
        !["DELIVERED", "COMPLETED", "CANCELLED"].includes(String(order.status || "").toUpperCase())
      ).length,
    [orders]
  );
  const pendingServiceCount = useMemo(
    () =>
      serviceRequests.filter(request =>
        !["COMPLETED", "CANCELLED"].includes(String(request.status || "").toUpperCase())
      ).length,
    [serviceRequests]
  );
  const revenueToday = useMemo(() => {
    const today = new Date();
    return transactions.reduce((sum, row) => {
      const amount = Number(row?.amount ?? row?.value ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return sum;
      const rawDate = row?.created_at || row?.createdAt || row?.timestamp;
      if (!rawDate) return sum;
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) return sum;
      if (!isSameDay(parsed, today)) return sum;
      return sum + amount;
    }, 0);
  }, [transactions]);
  const slaBreaches = useMemo(
    () =>
      notifications.filter(item =>
        /sla/i.test(String(item?.event_type || item?.message || ""))
      ).length,
    [notifications]
  );
  const homeActions = useMemo(() => {
    const actions = [
      {
        id: "home-marketplace",
        label: "Order groceries",
        description: "Browse nearby shops and add items to cart.",
        icon: "cart",
        tone: "primary",
        run: () => {
          setMarketplaceView("catalog");
          setActiveTab("marketplace");
        }
      },
      {
        id: "home-services",
        label: "Book a service",
        description: "Find skilled providers with realtime availability.",
        icon: "tool",
        tone: "accent",
        run: () => setActiveTab("services")
      },
      {
        id: "home-chat",
        label: "Open messenger",
        description: "Start a chat or check unread messages.",
        icon: "chat",
        tone: "dark",
        run: () => setActiveTab("chat")
      },
      {
        id: "home-orders",
        label: "Track orders",
        description: "Follow delivery status, OTP, and feedback.",
        icon: "check",
        tone: "neutral",
        run: () => setActiveTab("orders")
      },
      {
        id: "home-wallet",
        label: "Top up wallet",
        description: "Manage balance, transfers, and settlements.",
        icon: "dots",
        tone: "neutral",
        run: () => setActiveTab("wallet")
      }
    ];

    if (canAccess.seller) {
      actions.push({
        id: "home-seller",
        label: "Manage inventory",
        description: "Upload products and track stock health.",
        icon: "plus",
        tone: "primary",
        run: () => setActiveTab("seller")
      });
    }
    if (canAccess.ops) {
      actions.push({
        id: "home-ops",
        label: "Open ops console",
        description: "Workflow graphs and reconciliation controls.",
        icon: "settings",
        tone: "dark",
        run: () => setActiveTab("ops")
      });
    }

    actions.push({
      id: "home-profile",
      label: "Update profile",
      description: "Privacy, notifications, and security.",
      icon: "user",
      tone: "neutral",
      run: () => setActiveTab("profile")
    });

    return actions;
  }, [canAccess.ops, canAccess.seller, setActiveTab, setMarketplaceView]);
  const commandActions = useMemo(() => {
    const base = [
      {
        id: "cmd-marketplace",
        label: "Open Marketplace",
        hint: "Groceries, shops, and product search",
        run: () => {
          setMarketplaceView("catalog");
          setActiveTab("marketplace");
        }
      },
      {
        id: "cmd-services",
        label: "Open Services",
        hint: "Book nearby providers",
        run: () => setActiveTab("services")
      },
      {
        id: "cmd-chat",
        label: "Open Messenger",
        hint: "Chat, calls, and presence",
        run: () => setActiveTab("chat")
      },
      {
        id: "cmd-orders",
        label: "Open Orders",
        hint: "Track delivery and feedback",
        run: () => setActiveTab("orders")
      },
      {
        id: "cmd-wallet",
        label: "Open Wallet",
        hint: "Topups and transfers",
        run: () => setActiveTab("wallet")
      },
      {
        id: "cmd-profile",
        label: "Open Profile",
        hint: "Preferences and security",
        run: () => setActiveTab("profile")
      }
    ];

    if (canAccess.seller) {
      base.push({
        id: "cmd-seller",
        label: "Open Seller Hub",
        hint: "Inventory and catalog",
        run: () => setActiveTab("seller")
      });
    }
    if (canAccess.ops) {
      base.push({
        id: "cmd-ops",
        label: "Open Ops Console",
        hint: "Workflow operations",
        run: () => setActiveTab("ops")
      });
    }

    homeActions.forEach(action => {
      base.push({
        id: `cmd-${action.id}`,
        label: action.label,
        hint: action.description,
        run: action.run
      });
    });

    return base;
  }, [canAccess.ops, canAccess.seller, homeActions, setActiveTab, setMarketplaceView]);
  const commandResults = useMemo(() => {
    const needle = deferredCommandQuery.trim().toLowerCase();
    if (!needle) return commandActions;
    return commandActions.filter(action =>
      [action.label, action.hint].filter(Boolean).some(value =>
        String(value).toLowerCase().includes(needle)
      )
    );
  }, [commandActions, deferredCommandQuery]);
  const activeTabMeta = useMemo(() => {
    const firstName = String(user.name || "there").split(" ")[0];
    if (activeTab === "chat") {
      return {
        title: "Messages",
        eyebrow: "Communication",
        description: "Stay connected with shops, providers, and support in one place."
      };
    }
    if (activeTab === "marketplace") {
      return {
        title: "Marketplace",
        eyebrow: "Commerce",
        description: "Discover shops and products near you with trusted ratings."
      };
    }
    if (activeTab === "services") {
      return {
        title: "Services",
        eyebrow: "On-demand",
        description: "Book trusted service providers near your location."
      };
    }
    if (activeTab === "orders") {
      return {
        title: "Orders",
        eyebrow: "Fulfilment",
        description: "Track and manage all your orders in one timeline."
      };
    }
    if (activeTab === "seller") {
      return {
        title: "Seller Hub",
        eyebrow: "Merchant",
        description: "Manage inventory, prices, and incoming orders."
      };
    }
    if (activeTab === "wallet") {
      return {
        title: "Wallet",
        eyebrow: "Finance",
        description: "Monitor balance, transfers, and daily settlements."
      };
    }
    if (activeTab === "profile") {
      return {
        title: "Settings",
        eyebrow: "Account",
        description: "Manage your account preferences and notifications."
      };
    }
    if (activeTab === "ops") {
      return {
        title: "Ops Console",
        eyebrow: "Admin",
        description: "System health, SLA monitoring, and event pipeline status."
      };
    }
    return {
      title: `Good morning, ${firstName}.`,
      eyebrow: "Dashboard",
      description: `You have ${activeOrdersCount} active deliveries and ${pendingServiceCount} services scheduled.`
    };
  }, [activeTab, user.name, activeOrdersCount, pendingServiceCount]);
  const visibleConversations = useMemo(() => {
    if (chatListMode === "unread") {
      return filteredConversations.filter(conv => Number(conv.unreadCount || 0) > 0);
    }
    if (chatListMode === "groups") {
      return filteredConversations.filter(conv => String(conv.type || "").toUpperCase() === "GROUP");
    }
    return filteredConversations;
  }, [filteredConversations, chatListMode]);
  const filteredMessages = useMemo(() => {
    if (!deferredThreadSearch.trim()) return messages;
    const needle = deferredThreadSearch.trim().toLowerCase();
    return messages.filter(message =>
      String(message.content || "").toLowerCase().includes(needle)
    );
  }, [messages, deferredThreadSearch]);
  const activeTypingLabel = useMemo(() => {
    if (!selectedConversationId) return "";
    const row = Object.values(typingUsers).find(entry => {
      if (!entry) return false;
      if (String(entry.conversationId) !== String(selectedConversationId)) return false;
      return Date.now() - Number(entry.ts || 0) < 6000;
    });
    return row?.label || "";
  }, [typingUsers, selectedConversationId]);
  const currentCallTargetId = useMemo(() => {
    if (callSession.incomingFrom) return String(callSession.incomingFrom);
    const peerId = selectedThread?.peers?.[0]?.userId;
    return peerId ? String(peerId) : "";
  }, [callSession.incomingFrom, selectedThread]);

  async function api(path, options = {}) {
    const retry = Boolean(options._retry);
    const accessToken = options._token || token;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    };
    const { _retry, _token, ...forward } = options;
    const res = await fetch(`${API_URL}${path}`, { ...forward, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !retry && onRefreshSession) {
      const freshAccessToken = await onRefreshSession();
      if (freshAccessToken) {
        return api(path, { ...forward, _retry: true, _token: freshAccessToken });
      }
    }
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function mergeSettings(input = {}) {
    return {
      ...DEFAULT_SETTINGS,
      ...(input || {}),
      payments: { ...DEFAULT_SETTINGS.payments, ...(input?.payments || {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(input?.notifications || {}) },
      location: { ...DEFAULT_SETTINGS.location, ...(input?.location || {}) },
      ui: { ...DEFAULT_SETTINGS.ui, ...(input?.ui || {}) },
      privacy: { ...DEFAULT_SETTINGS.privacy, ...(input?.privacy || {}) },
      security: { ...DEFAULT_SETTINGS.security, ...(input?.security || {}) },
      chat: { ...DEFAULT_SETTINGS.chat, ...(input?.chat || {}) }
    };
  }

  async function settleRazorpayIntent(intent, paymentResponse) {
    await api(`/payments/intents/${intent.intentId}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        providerIntentId: paymentResponse.razorpay_order_id,
        providerPaymentId: paymentResponse.razorpay_payment_id,
        signature: paymentResponse.razorpay_signature
      })
    });
    setPaymentIntent(prev => ({
      ...(prev || {}),
      ...intent,
      status: "SUCCEEDED"
    }));
    await loadWallet();
  }

  async function openRazorpayCheckout(intent, options = {}) {
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      throw new Error("Unable to load Razorpay checkout script");
    }
    if (!intent?.checkout?.orderId || !intent?.checkout?.keyId) {
      throw new Error("Razorpay checkout payload missing");
    }

    await new Promise((resolve, reject) => {
      const instance = new window.Razorpay({
        key: intent.checkout.keyId,
        amount: Math.round(Number(intent.amount || 0) * 100),
        currency: intent.currency || "INR",
        name: "LifeHub",
        description: "Wallet topup payment",
        order_id: intent.checkout.orderId,
        handler: async response => {
          try {
            await settleRazorpayIntent(intent, response);
            if (typeof options.onSettled === "function") {
              await options.onSettled();
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Payment cancelled"))
        },
        prefill: {
          name: user.name || "",
          contact: user.phone || "",
          email: user.email || ""
        },
        notes: {
          intentId: intent.intentId
        },
        theme: {
          color: "#106ec2"
        }
      });
      instance.open();
    });
  }

  async function loadHome() {
    const data = await api("/superapp/home");
    setHome(data);
    setOrders(data.recentOrders || []);
  }

  async function loadOrders() {
    if (!canAccess.orders) return;
    const data = await api("/orders?limit=50");
    setOrders(data.orders || []);
  }

  async function loadConversations() {
    const data = await api("/chat/conversations");
    const rows = data.conversations || [];
    setConversations(rows);
  }

  async function loadPresence() {
    const data = await api("/chat/presence");
    const map = {};
    for (const row of data.users || []) {
      map[String(row.userId)] = true;
    }
    setOnlineUsers(map);
  }

  async function loadMessages(conversationId, options = {}) {
    const { markRead = false } = options;
    if (!conversationId) return;
    const data = await api(`/chat/conversations/${conversationId}/messages?limit=100`);
    const ordered = [...(data.messages || [])].reverse();
    setMessages(ordered);
    const latest = ordered[ordered.length - 1];
    if (markRead && latest?.id) {
      await api(`/chat/conversations/${conversationId}/delivered`, {
        method: "POST",
        body: JSON.stringify({ lastMessageId: latest.id })
      });
      await api(`/chat/conversations/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify({ lastMessageId: latest.id })
      });
    }
  }

  async function openConversation(conversationId) {
    try {
      const nextId = String(conversationId || "");
      if (!nextId) return;
      setSelectedConversationId(nextId);
      setThreadSearch("");
      await loadMessages(nextId, { markRead: true });
      await loadConversations();
    } catch (err) {
      setError(err.message || "Unable to open conversation");
    }
  }

  async function sendMessage() {
    try {
      const text = chatText.trim();
      if (!selectedConversationId || (!text && !pendingAttachments.length)) return;
      await api(`/chat/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: text || "Attachment",
          messageType: "TEXT",
          attachments: pendingAttachments.map(item => ({
            fileId: item.fileId,
            fileUrl: item.fileUrl,
            fileType: item.fileType,
            fileSize: item.fileSize
          }))
        })
      });
      setChatText("");
      setPendingAttachments([]);
      await publishTypingState(false);
      await loadMessages(selectedConversationId, { markRead: false });
      await loadConversations();
    } catch (err) {
      setError(err.message || "Unable to send message");
    }
  }

  async function publishTypingState(isTyping) {
    if (!selectedConversationId) return;
    await api(`/chat/conversations/${selectedConversationId}/typing`, {
      method: "POST",
      body: JSON.stringify({ isTyping })
    }).catch(() => {});
  }

  function handleChatInputChange(value) {
    setChatText(value);
    if (!selectedConversationId) return;

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    if (value.trim()) {
      publishTypingState(true).catch(() => {});
      typingTimerRef.current = setTimeout(() => {
        publishTypingState(false).catch(() => {});
      }, 1600);
      return;
    }

    publishTypingState(false).catch(() => {});
  }

  function triggerAttachmentPicker() {
    filePickerRef.current?.click();
  }

  function removePendingAttachment(fileId) {
    setPendingAttachments(prev => prev.filter(item => String(item.fileId) !== String(fileId)));
  }

  function resolveApiBaseUrl() {
    const raw = String(API_URL || "").trim();
    if (!raw) {
      return typeof window !== "undefined" ? window.location.origin : "";
    }
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/\/api\/?$/i, "").replace(/\/+$/, "");
    }
    if (raw.startsWith("/") && typeof window !== "undefined") {
      return `${window.location.origin}${raw}`.replace(/\/api\/?$/i, "").replace(/\/+$/, "");
    }
    return typeof window !== "undefined" ? window.location.origin : "";
  }

  const mediaBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  async function uploadChatAttachment(file, options = {}) {
    const isPrivate = options.isPrivate !== undefined ? Boolean(options.isPrivate) : true;
    const init = await api("/media/upload/init", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        isPrivate
      })
    });

    const uploadTargets = [];
    const primaryUploadUrl = String(init.uploadUrl || "").trim();
    if (primaryUploadUrl) {
      uploadTargets.push(primaryUploadUrl);
      if (
        typeof window !== "undefined"
        && window.location.protocol === "https:"
        && primaryUploadUrl.startsWith("http://")
      ) {
        uploadTargets.push(primaryUploadUrl.replace(/^http:\/\//i, "https://"));
      }
    }

    if (String(init.provider || "").toLowerCase() === "local" && init.storagePath) {
      const fallbackRoot = resolveApiBaseUrl();
      if (fallbackRoot) {
        uploadTargets.push(`${fallbackRoot}/upload/${String(init.storagePath).replace(/^\/+/, "")}`);
      }
    }

    const targets = [...new Set(uploadTargets)];
    if (!targets.length) {
      throw new Error("Attachment upload failed: missing upload endpoint");
    }

    let uploadSucceeded = false;
    let lastError = null;
    for (const targetUrl of targets) {
      try {
        const uploadRes = await fetch(targetUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream"
          },
          body: file
        });

        if (!uploadRes.ok) {
          lastError = new Error(`Attachment upload failed: ${uploadRes.status}`);
          continue;
        }
        uploadSucceeded = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!uploadSucceeded) {
      const message = String(lastError?.message || "");
      if (message.toLowerCase().includes("failed to fetch")) {
        throw new Error("Attachment upload failed: network/CORS issue. Check backend MEDIA_PUBLIC_BASE_URL and CORS_ORIGINS.");
      }
      throw new Error(lastError?.message || "Attachment upload failed");
    }

    await api(`/media/upload/${init.fileId}/complete`, {
      method: "POST"
    });

    return {
      fileId: init.fileId,
      fileUrl: init.cdnUrl,
      fileType: file.type || "file",
      fileSize: file.size,
      fileName: file.name
    };
  }

  async function handleChatFileSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setUploadingAttachment(true);
    try {
      const uploaded = [];
      for (const file of files.slice(0, 5)) {
        uploaded.push(await uploadChatAttachment(file));
      }
      setPendingAttachments(prev => [...prev, ...uploaded].slice(-5));
      setToast(`${uploaded.length} attachment(s) ready to send.`);
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      setError(err.message || "Attachment upload failed");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function createConversationByPhone() {
    try {
      if (!peerPhone.trim()) return;
      const conversation = await api("/chat/conversations/by-phone", {
        method: "POST",
        body: JSON.stringify({
          phone: peerPhone.trim()
        })
      });
      setPeerPhone("");
      await loadConversations();
      if (conversation?.id) {
        setSelectedConversationId(String(conversation.id));
      }
    } catch (err) {
      setError(err.message || "Unable to create chat");
    }
  }

  async function createGroupConversation() {
    try {
      const phones = groupPhones
        .split(/[,\n]/)
        .map(value => value.trim())
        .filter(Boolean);
      if (phones.length < 2) {
        setError("Add at least 2 phone numbers for group chat.");
        return;
      }

      const conversation = await api("/chat/conversations/group-by-phones", {
        method: "POST",
        body: JSON.stringify({ phones })
      });
      setGroupPhones("");
      await loadConversations();
      if (conversation?.id) {
        setSelectedConversationId(String(conversation.id));
      }
    } catch (err) {
      setError(err.message || "Unable to create group");
    }
  }

  async function resolveContacts() {
    try {
      const phones = contactPhones
        .split(/[,\n]/)
        .map(value => value.trim())
        .filter(Boolean);
      if (!phones.length) {
        setResolvedContacts([]);
        return;
      }

      const data = await api("/chat/contacts/resolve", {
        method: "POST",
        body: JSON.stringify({ phones })
      });
      setResolvedContacts(data.contacts || []);
    } catch (err) {
      setError(err.message || "Unable to sync contacts");
    }
  }

  async function pickContactsFromDevice() {
    if (!navigator.contacts?.select) {
      setError("Device contact API is not supported in this browser. Use manual phone numbers.");
      return;
    }
    try {
      const picked = await navigator.contacts.select(["name", "tel"], {
        multiple: true
      });
      const phones = picked
        .flatMap(item => item.tel || [])
        .map(value => String(value || "").trim())
        .filter(Boolean);
      setContactPhones(phones.join(", "));
      if (phones.length) {
        const data = await api("/chat/contacts/resolve", {
          method: "POST",
          body: JSON.stringify({ phones })
        });
        setResolvedContacts(data.contacts || []);
      }
    } catch (err) {
      setError(err.message || "Unable to access contacts");
    }
  }

  function cleanupPeerConnection() {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.close();
      } catch {
        // ignore close errors
      }
      peerConnectionRef.current = null;
    }
  }

  function cleanupMediaStreams() {
    const stream = localMediaStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    localMediaStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteStreamActive(false);
  }

  async function ensureLocalMedia(callType = "video") {
    if (localMediaStreamRef.current) return localMediaStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Your browser does not support media devices API");
    }

    const constraints = callType === "audio"
      ? { audio: true, video: false }
      : { audio: true, video: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localMediaStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }

  async function createPeerConnection(targetUserId) {
    if (typeof RTCPeerConnection === "undefined") {
      throw new Error("WebRTC is not supported in this browser");
    }
    const rtcConfig = await api("/calls/rtc-config");
    const pc = new RTCPeerConnection({
      iceServers: rtcConfig?.iceServers || [{ urls: ["stun:stun.l.google.com:19302"] }]
    });
    peerConnectionRef.current = pc;

    pc.onicecandidate = event => {
      if (!event.candidate || !socketRef.current || !targetUserId) return;
      socketRef.current.emit("call:ice-candidate", {
        roomId: callSessionRef.current.roomId,
        toUserId: String(targetUserId),
        candidate: event.candidate
      });
    };

    pc.ontrack = event => {
      const stream = event.streams?.[0];
      if (!stream) return;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      setRemoteStreamActive(true);
      setCallSession(prev => ({ ...prev, status: "connected" }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallSession(prev => ({ ...prev, status: "connected" }));
      }
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setCallSession(prev => ({ ...prev, status: "disconnected" }));
      }
    };

    return pc;
  }

  async function joinCallRoom(roomId) {
    if (!roomId) return;
    socketRef.current?.emit("call:join", { roomId });
    await api(`/calls/rooms/${roomId}/join`, {
      method: "POST"
    }).catch(() => {});
  }

  async function startInstantCall(kind = "video") {
    try {
      const peerId = selectedThread?.peers?.[0]?.userId;
      const isGroup = String(selectedThread?.type || "DIRECT").toUpperCase() === "GROUP";
      if (!selectedConversationId || !peerId || isGroup) {
        setError("Open a direct one-to-one conversation first to start call.");
        return;
      }
      if (!socketRef.current?.connected) {
        setError("Realtime socket is offline. Re-open app and retry.");
        return;
      }

      cleanupPeerConnection();
      cleanupMediaStreams();
      const room = await api("/calls/rooms", {
        method: "POST",
        body: JSON.stringify({ type: kind })
      });
      const roomId = String(room.roomId || "");
      setActiveCallRoomId(roomId);
      setRemoteCallUserId(String(peerId));
      setCallSession({
        open: true,
        roomId,
        type: kind,
        status: "dialing",
        incomingFrom: "",
        offerSdp: null
      });

      await joinCallRoom(roomId);
      const stream = await ensureLocalMedia(kind);
      const pc = await createPeerConnection(String(peerId));
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("call:offer", {
        roomId,
        toUserId: String(peerId),
        sdp: offer
      });
      setCallSession(prev => ({ ...prev, status: "ringing" }));
    } catch (err) {
      cleanupPeerConnection();
      cleanupMediaStreams();
      setCallSession({
        open: false,
        roomId: "",
        type: "video",
        status: "idle",
        incomingFrom: "",
        offerSdp: null
      });
      setActiveCallRoomId("");
      setError(err.message || "Unable to start call");
    }
  }

  async function acceptIncomingCall() {
    try {
      if (!callSession.roomId || !callSession.offerSdp || !callSession.incomingFrom) return;
      cleanupPeerConnection();
      cleanupMediaStreams();
      await joinCallRoom(callSession.roomId);
      const stream = await ensureLocalMedia(callSession.type || "video");
      const pc = await createPeerConnection(callSession.incomingFrom);
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(callSession.offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit("call:answer", {
        roomId: callSession.roomId,
        toUserId: callSession.incomingFrom,
        sdp: answer
      });
      setCallSession(prev => ({
        ...prev,
        status: "connecting",
        offerSdp: null
      }));
    } catch (err) {
      setError(err.message || "Unable to accept call");
    }
  }

  async function declineIncomingCall() {
    await endCurrentCall({ endRoom: false });
  }

  async function endCurrentCall(options = {}) {
    const roomId = callSessionRef.current.roomId || activeCallRoomId;
    const endRoom = options.endRoom !== false;
    try {
      if (roomId && socketRef.current) {
        socketRef.current.emit("call:leave", { roomId });
      }
      if (roomId) {
        await api(`/calls/rooms/${roomId}/leave`, {
          method: "POST"
        }).catch(() => {});
        if (endRoom) {
          await api(`/calls/rooms/${roomId}/end`, {
            method: "POST"
          }).catch(() => {});
        }
      }
    } finally {
      cleanupPeerConnection();
      cleanupMediaStreams();
      setActiveCallRoomId("");
      setRemoteCallUserId("");
      setCallSession({
        open: false,
        roomId: "",
        type: "video",
        status: "idle",
        incomingFrom: "",
        offerSdp: null
      });
    }
  }

  async function searchShops(override = null) {
    const source = override || shopFilters;
    const query = new URLSearchParams({
      lat: source.lat,
      lng: source.lng,
      radiusKm: source.radiusKm,
      availableOnly: "false",
      sortBy: "fair",
      limit: "30"
    });
    const data = await api(`/marketplace/shops/search?${query}`);
    const shopRows = data.shops || [];
    setShops(shopRows);
    if (!shopRows.length) {
      setSelectedShopId("");
      setShopProducts([]);
    } else {
      const selectedStillVisible = shopRows.some(
        shop => String(shop.id) === String(selectedShopId)
      );
      if (!selectedStillVisible) {
        await loadShopProducts(shopRows[0].id);
      }
    }
    if (canAccess.seller) {
      const ownedShop = shopRows.find(shop => String(shop.ownerUserId || "") === String(user.id || ""));
      if (ownedShop && String(sellerForm.shopId || "") !== String(ownedShop.id)) {
        setSellerForm(prev => ({ ...prev, shopId: String(ownedShop.id) }));
      }
      const lat = ownedShop?.location?.lat;
      const lng = ownedShop?.location?.lng;
      if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
        setShopLocationForm({
          lat: String(lat),
          lng: String(lng)
        });
      }
    }
    await loadRecommendedProducts({
      lat: source.lat,
      lng: source.lng,
      radiusKm: source.radiusKm,
      query: productQuery.trim()
    });
  }

  async function loadShopProducts(shopId, options = {}) {
    if (!shopId) return;
    const { keepSelectedProduct = false } = options;
    const data = await api(`/marketplace/shops/${shopId}/products?limit=100`);
    setSelectedShopId(String(shopId));
    setShopProducts(data.products || []);
    if (!keepSelectedProduct) {
      setSelectedMarketplaceProduct(null);
    }
  }

  async function loadShopFeedback(shopId) {
    if (!shopId) {
      setShopFeedbackSummary(null);
      setShopFeedbackRows([]);
      setShopFeedbackError("");
      return;
    }

    setLoadingShopFeedback(true);
    setShopFeedbackError("");
    try {
      const data = await api(`/marketplace/shops/${shopId}/feedback?limit=12`);
      setShopFeedbackSummary(data.summary || null);
      setShopFeedbackRows(data.feedback || []);
      if (!(data.feedback || []).length) {
        setShopFeedbackError("No customer feedback yet for this shop.");
      }
    } catch (err) {
      setShopFeedbackSummary(null);
      setShopFeedbackRows([]);
      setShopFeedbackError(err.message || "Unable to load shop feedback.");
    } finally {
      setLoadingShopFeedback(false);
    }
  }

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => String(item.productId) === String(product.id));
      if (existing) {
        return prev.map(item =>
          String(item.productId) === String(product.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.price || 0),
          quantity: 1
        }
      ];
    });
  }

  function updateCartQuantity(productId, quantity) {
    const nextQuantity = Number(quantity);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setCart(prev => prev.filter(item => String(item.productId) !== String(productId)));
      return;
    }
    setCart(prev =>
      prev.map(item =>
        String(item.productId) === String(productId)
          ? { ...item, quantity: nextQuantity }
          : item
      )
    );
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(item => String(item.productId) !== String(productId)));
  }

  function clearCart() {
    setCart([]);
  }

  async function openMarketplaceProduct(item, fallbackShop = null) {
    const normalized = normalizeMarketplaceProduct(item, fallbackShop || selectedShop);
    if (!normalized) return;
    try {
      setSelectedMarketplaceProduct(normalized);
      setMarketplaceView("detail");

      const shopId = normalized?.shop?.id || selectedShopId;
      if (shopId && String(shopId) !== String(selectedShopId)) {
        await loadShopProducts(shopId, { keepSelectedProduct: true });
      }
      await loadShopFeedback(shopId);

    } catch (err) {
      setError(err.message || "Unable to open product details right now.");
    }
  }

  function goToMarketplaceCheckout() {
    if (!cart.length) {
      setError("Add at least one product to cart before checkout.");
      return;
    }
    if (!selectedShopId) {
      setError("Select a shop before checkout.");
      return;
    }
    setMarketplaceView("checkout");
    setCheckoutValidationError("");
  }

  async function buyNowMarketplaceProduct(item, fallbackShop = null) {
    const normalized = normalizeMarketplaceProduct(item, fallbackShop || selectedShop);
    if (!normalized) return;
    try {
      const shopId = normalized?.shop?.id || selectedShopId;
      if (shopId && String(shopId) !== String(selectedShopId)) {
        await loadShopProducts(shopId, { keepSelectedProduct: true });
      }

      setCart([
        {
          productId: normalized.productId,
          name: normalized.name,
          price: Number(normalized.price || 0),
          quantity: 1
        }
      ]);
      setSelectedMarketplaceProduct(normalized);
      await loadShopFeedback(shopId);
      setMarketplaceView("checkout");
      setCheckoutValidationError("");

    } catch (err) {
      setError(err.message || "Unable to start buy now flow.");
    }
  }

  function validateDeliveryDetails() {
    if (!String(deliveryDetails.recipientName || "").trim()) {
      return "Recipient name is required.";
    }
    if (!String(deliveryDetails.recipientPhone || "").trim()) {
      return "Recipient phone is required.";
    }
    if (!String(deliveryDetails.addressLine1 || "").trim()) {
      return "Delivery address is required.";
    }
    if (!String(deliveryDetails.nearbyLocation || "").trim()) {
      return "Nearby location or area is required.";
    }
    return "";
  }

  async function placeOrder() {
    if (!selectedShopId || !cart.length) return;
    const deliveryError = validateDeliveryDetails();
    if (deliveryError) {
      setCheckoutValidationError(deliveryError);
      setError(deliveryError);
      return;
    }
    try {
      setCheckoutValidationError("");
      await api("/orders", {
        method: "POST",
        headers: { "x-idempotency-key": `order_${Date.now()}` },
        body: JSON.stringify({
          shopId: selectedShopId,
          total: Number(cartTotal.toFixed(2)),
          items: cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          })),
          deliveryDetails
        })
      });
      setCart([]);
      setSelectedMarketplaceProduct(null);
      setMarketplaceView("catalog");
      await Promise.all([loadHome(), loadOrders()]);
    } catch (err) {
      setError(`${err.message || "Order failed"}. You can top up wallet and retry.`);
      setActiveTab("wallet");
    }
  }

  async function proceedCheckout() {
    try {
      const deliveryError = validateDeliveryDetails();
      if (deliveryError) {
        setCheckoutValidationError(deliveryError);
        setError(deliveryError);
        return;
      }
      setCheckoutValidationError("");
      const method = String(checkoutMode || "RAZORPAY").toUpperCase();
      if (method === "WALLET") {
        await placeOrder();
        return;
      }

      const intent = await api("/payments/intents", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(cartTotal.toFixed(2)),
          purpose: "TOPUP",
          provider: "RAZORPAY",
          paymentMethod: "UPI",
          currency: "INR",
          metadata: {
            checkoutFor: "ORDER",
            shopId: selectedShopId
          }
        })
      });
      setPaymentIntent(intent);
      setPendingOrderAfterPayment(true);
      await openRazorpayCheckout(intent, {
        onSettled: async () => {
          setPendingOrderAfterPayment(false);
          await placeOrder();
        }
      });
    } catch (err) {
      setPendingOrderAfterPayment(false);
      setError(err.message || "Checkout failed");
    }
  }

  async function loadProviders(override = null) {
    const source = override || serviceFilters;
    const query = new URLSearchParams({
      skill: providerSkill,
      availableOnly: "true",
      limit: "20",
      lat: source.lat,
      lng: source.lng,
      radiusKm: source.radiusKm
    });
    const data = await api(`/marketplace/providers/search?${query}`);
    const rows = data.providers || [];
    setProviders(rows);
    if (!rows.length) {
      setSelectedProviderId("");
      setSelectedProviderProfile(null);
      return;
    }
    const stillVisible = rows.some(item => String(item.id) === String(selectedProviderId));
    if (!stillVisible) {
      const defaultId = String(rows[0].id);
      setSelectedProviderId(defaultId);
      openProviderProfile(defaultId).catch(() => {});
    }
    const mine = rows.find(item => String(item.userId) === String(user.id));
    if (mine?.id) {
      setMyProviderProfileId(String(mine.id));
    }
  }

  async function openProviderProfile(providerId) {
    const resolvedId = String(providerId || "").trim();
    if (!resolvedId) return;

    setSelectedProviderId(resolvedId);
    setLoadingProviderProfile(true);
    setProviderProfileError("");
    try {
      const profile = await api(`/marketplace/providers/${resolvedId}`);
      setSelectedProviderProfile(profile || null);
      const firstSkill = profile?.provider_skills?.[0]?.skill_name;
      setServiceForm(prev => ({
        ...prev,
        preferredProviderId: resolvedId,
        ...(firstSkill ? { serviceType: firstSkill } : {})
      }));
    } catch (err) {
      setSelectedProviderProfile(null);
      setProviderProfileError(err.message || "Unable to load provider profile.");
    } finally {
      setLoadingProviderProfile(false);
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    const now = Date.now();
    if (now - locationThrottleRef.current < 3000) {
      return;
    }
    locationThrottleRef.current = now;

    navigator.geolocation.getCurrentPosition(
      async position => {
        const lat = String(position.coords.latitude);
        const lng = String(position.coords.longitude);
        const nextShop = { ...shopFilters, lat, lng };
        const nextService = { ...serviceFilters, lat, lng };
        setShopFilters(nextShop);
        setServiceFilters(nextService);
        setShopLocationForm(prev => ({ ...prev, lat, lng }));
        setProviderLocationForm(prev => ({ ...prev, lat, lng }));
        try {
          if ((hasRole("SHOPKEEPER") || hasRole("ADMIN")) && sellerForm.shopId) {
            await api(`/marketplace/shops/${sellerForm.shopId}/location`, {
              method: "PUT",
              body: JSON.stringify({
                lat: Number(lat),
                lng: Number(lng)
              })
            });
          }
          if ((hasRole("PROVIDER") || hasRole("ADMIN")) && myProviderProfileId) {
            await api(`/marketplace/providers/${myProviderProfileId}/location`, {
              method: "PUT",
              body: JSON.stringify({
                lat: Number(lat),
                lng: Number(lng),
                available: true
              })
            });
          }
          await Promise.all([searchShops(nextShop), loadProviders(nextService)]);
        } catch {
          // ignore refresh error in callback
        }
      },
      geoError => {
        setError(geoError.message || "Location access denied");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function createServiceRequest() {
    await api("/service-requests", {
      method: "POST",
      body: JSON.stringify({
        serviceType: serviceForm.serviceType,
        description: serviceForm.description,
        preferredProviderId: serviceForm.preferredProviderId || undefined
      })
    });
    setServiceForm(prev => ({ ...prev, description: "", preferredProviderId: "" }));
    await loadServiceRequests();
  }

  async function loadServiceRequests() {
    const data = await api("/service-requests?limit=50");
    setServiceRequests(data.requests || []);
  }

  async function cancelServiceRequest(requestId) {
    await api(`/service-requests/${requestId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "USER_CANCELLED" })
    });
    await loadServiceRequests();
  }

  async function completeServiceRequest(requestId) {
    await api(`/service-requests/${requestId}/complete`, { method: "POST" });
    await loadServiceRequests();
  }

  async function cancelOrder(orderId) {
    try {
      await api(`/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "USER_CANCELLED" })
      });
      await Promise.all([loadHome(), loadOrders()]);
    } catch (err) {
      setError(err.message || "Unable to cancel order");
    }
  }

  async function startDelivery(orderId) {
    await api(`/orders/${orderId}/delivery/start`, { method: "POST" });
    await loadOrders();
  }

  async function sendDeliveryOtp(orderId) {
    await api(`/orders/${orderId}/delivery/otp`, { method: "POST" });
    setToast("Delivery OTP sent to customer notification channels.");
  }

  async function confirmDelivery(orderId) {
    await api(`/orders/${orderId}/delivery/confirm`, {
      method: "POST",
      body: JSON.stringify({
        otp: deliveryOtpInput,
        rating: Number(deliveryRating || 5),
        feedback: deliveryFeedback
      })
    });
    setDeliveryOtpInput("");
    setDeliveryFeedback("");
    await loadOrders();
  }

  async function requestRefund(orderId) {
    await api(`/transactions/orders/${orderId}/refund`, {
      method: "POST",
      body: JSON.stringify({
        reason: "CUSTOMER_REQUESTED"
      })
    });
    await Promise.all([loadOrders(), loadWallet()]);
    setToast("Refund processed.");
  }

  async function payoutShopkeeper(orderId) {
    await api(`/transactions/orders/${orderId}/payout`, {
      method: "POST"
    });
    await Promise.all([loadOrders(), loadWallet()]);
    setToast("Payout executed to shopkeeper.");
  }

  async function runReconciliationNow() {
    const result = await api("/transactions/ops/reconcile", {
      method: "POST"
    });
    setToast(`Reconciliation done. Checked ${result.checkedOrders}, mismatches ${result.mismatchCount}.`);
  }

  async function loadWallet() {
    const [summary, txRows, receive] = await Promise.all([
      api("/transactions/wallet"),
      api("/transactions?limit=50"),
      api("/transactions/wallet/receive").catch(() => null)
    ]);
    setWalletSummary(summary);
    setTransactions(txRows.transactions || []);
    setReceiveProfile(receive);
  }

  async function transferWalletBalance() {
    const amount = Number(transferForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid transfer amount.");
      return;
    }
    if (transferForm.recipientType === "phone" && !transferForm.toPhone.trim()) {
      setError("Recipient phone is required.");
      return;
    }
    if (transferForm.recipientType === "upi" && !transferForm.toUpiId.trim()) {
      setError("Recipient UPI ID is required.");
      return;
    }

    setTransferBusy(true);
    setError("");
    try {
      const payload = await api("/transactions/transfer", {
        method: "POST",
        body: JSON.stringify({
          toPhone: transferForm.recipientType === "phone" ? transferForm.toPhone : undefined,
          toUpiId: transferForm.recipientType === "upi" ? transferForm.toUpiId : undefined,
          amount,
          note: transferForm.note
        })
      });

      setTransferForm(prev => ({
        ...prev,
        amount: "",
        note: "",
        toPhone: prev.recipientType === "phone" ? prev.toPhone : "",
        toUpiId: prev.recipientType === "upi" ? prev.toUpiId : ""
      }));
      setToast(`Transferred ${toCurrency(amount)} to ${payload?.recipient?.name || "recipient"}.`);
      setTimeout(() => setToast(""), 3000);
      await loadWallet();
    } catch (err) {
      setError(err.message || "Transfer failed");
    } finally {
      setTransferBusy(false);
    }
  }

  async function loadUserSettings() {
    const settings = await api("/users/settings/me");
    setUserSettings(mergeSettings(settings));
  }

  async function saveUserSettings() {
    const saved = await api("/users/settings/me", {
      method: "PUT",
      body: JSON.stringify(userSettings)
    });
    setUserSettings(mergeSettings(saved));
    setToast("Profile settings updated.");
  }

  async function loadNotificationPreferences() {
    const prefs = await api("/notifications/preferences/me");
    setNotificationPrefs({
      quietHours: {
        enabled: Boolean(prefs?.quietHours?.enabled),
        startHour: Number(prefs?.quietHours?.startHour ?? 22),
        endHour: Number(prefs?.quietHours?.endHour ?? 7),
        timezone: prefs?.quietHours?.timezone || "UTC"
      },
      perEventRules: prefs?.perEventRules || {},
      channelPriority: prefs?.channelPriority || ["PUSH", "IN_APP", "EMAIL", "SMS"]
    });
  }

  async function saveNotificationPreferences() {
    const saved = await api("/notifications/preferences/me", {
      method: "PUT",
      body: JSON.stringify(notificationPrefs)
    });
    setNotificationPrefs({
      quietHours: {
        enabled: Boolean(saved?.quietHours?.enabled),
        startHour: Number(saved?.quietHours?.startHour ?? 22),
        endHour: Number(saved?.quietHours?.endHour ?? 7),
        timezone: saved?.quietHours?.timezone || "UTC"
      },
      perEventRules: saved?.perEventRules || {},
      channelPriority: saved?.channelPriority || ["PUSH", "IN_APP", "EMAIL", "SMS"]
    });
    setToast("Notification preferences saved.");
  }

  async function sendNotificationTest() {
    await api("/notifications/me/test", {
      method: "POST",
      body: JSON.stringify({
        channels: ["IN_APP", "PUSH", "SMS"]
      })
    });
    setToast("Test notification queued.");
  }

  async function requestBrowserPushPermission() {
    if (typeof Notification === "undefined") {
      setError("Browser notifications are not supported on this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserPushPermission(permission);
    if (permission !== "granted") {
      setError("Browser notification permission denied.");
      return;
    }
    setToast("Browser push permission enabled.");
  }

  async function loadNotifications() {
    const [systemData, chatData] = await Promise.all([
      api("/notifications/me?limit=30&scope=system"),
      api("/notifications/me?limit=30&scope=chat")
    ]);
    const systemRows = systemData.notifications || [];
    const chatRows = chatData.notifications || [];

    setNotifications(systemRows);
    setChatNotifications(chatRows);

    const incoming = systemRows
      .map(item => String(item.id))
      .filter(id => !seenMessageIds.has(id));
    if (incoming.length) {
      const next = new Set([...seenMessageIds, ...incoming]);
      setSeenMessageIds(next);
      localStorage.setItem(seenStoreKey, JSON.stringify([...next]));
      const latest = systemRows[0];
      setToast(`New notification: ${latest?.event_type || "Update received"}`);
      if (
        browserPushPermission === "granted" &&
        userSettings.notifications?.push &&
        latest?.event_type
      ) {
        try {
          new Notification(String(latest.event_type), {
            body: String(latest.content || "").slice(0, 180)
          });
        } catch {
          // ignore browser notification errors
        }
      }
      setTimeout(() => setToast(""), 3500);
    }
  }

  async function searchProductsNearby(query) {
    const text = String(query || "").trim();
    if (!text) {
      setProductResults([]);
      setProductSearchError("");
      return;
    }
    setSearchingProducts(true);
    setProductSearchError("");
    try {
      const params = new URLSearchParams({
        query: text,
        lat: shopFilters.lat,
        lng: shopFilters.lng,
        radiusKm: shopFilters.radiusKm,
        sortBy: productSearchFilters.sortBy,
        limit: "30"
      });
      if (productSearchFilters.maxPrice) {
        params.set("maxPrice", productSearchFilters.maxPrice);
      }
      if (productSearchFilters.minShopRating) {
        params.set("minShopRating", productSearchFilters.minShopRating);
      }
      const data = await api(`/marketplace/products/search?${params}`);
      const rows = data.products || [];
      setProductResults(rows);
      if (!rows.length) {
        setProductSearchError("No matching items nearby. Try a bigger radius or different keyword.");
      }
    } catch (err) {
      setProductResults([]);
      setProductSearchError(err.message || "Unable to search products right now.");
    } finally {
      setSearchingProducts(false);
    }
  }

  async function loadRecommendedProducts(options = {}) {
    const {
      seedProductIds = cart.map(item => item.productId).slice(0, 6),
      query = "",
      lat = shopFilters.lat,
      lng = shopFilters.lng,
      radiusKm = shopFilters.radiusKm
    } = options;

    setLoadingRecommendations(true);
    setRecommendationError("");
    try {
      const params = new URLSearchParams({
        lat,
        lng,
        radiusKm,
        limit: "18"
      });
      if (productSearchFilters.maxPrice) {
        params.set("maxPrice", productSearchFilters.maxPrice);
      }
      if (productSearchFilters.minShopRating) {
        params.set("minShopRating", productSearchFilters.minShopRating);
      }
      if (Array.isArray(seedProductIds) && seedProductIds.length) {
        params.set("seedProductIds", seedProductIds.map(String).join(","));
      }
      if (query) {
        params.set("query", String(query));
      }

      const data = await api(`/marketplace/products/recommendations?${params}`);
      setRecommendedProducts(data.products || []);
      if (!(data.products || []).length) {
        setRecommendationError("No dynamic recommendations available for this location yet.");
      }
    } catch (err) {
      setRecommendedProducts([]);
      setRecommendationError(err.message || "Unable to load top products right now.");
    } finally {
      setLoadingRecommendations(false);
    }
  }

  async function topupWallet() {
    try {
      const intent = await api("/payments/intents", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(topupAmount || 0),
          purpose: "TOPUP",
          provider: "RAZORPAY",
          paymentMethod: "UPI",
          currency: "INR"
        })
      });
      setPaymentIntent(intent);
      await openRazorpayCheckout(intent);
      setToast("Payment successful. Wallet credited.");
      await loadWallet();
    } catch (err) {
      setError(`${err.message || "Topup failed"}. Configure gateway keys and retry.`);
    }
  }

  async function loadSellerProducts(shopId = sellerForm.shopId) {
    if (!shopId) return;
    const data = await api(`/marketplace/shops/${shopId}/products?limit=100`);
    setSellerProducts(data.products || []);
  }

  async function createSellerProduct() {
    if (!sellerForm.name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!Number.isFinite(Number(sellerForm.price)) || Number(sellerForm.price) <= 0) {
      setError("Enter a valid product price.");
      return;
    }
    if (!Number.isInteger(Number(sellerForm.quantity)) || Number(sellerForm.quantity) <= 0) {
      setError("Quantity must be at least 1 so customers can see and buy this item.");
      return;
    }

    const created = await api(`/marketplace/shops/${sellerForm.shopId || "0"}/products`, {
      method: "POST",
      body: JSON.stringify({
        name: sellerForm.name,
        company: sellerForm.company,
        description: sellerForm.description,
        imageUrl: sellerForm.imageUrl,
        category: sellerForm.category,
        price: Number(sellerForm.price || 0),
        quantity: Number(sellerForm.quantity)
      })
    });
    const resolvedShopId = created?.shopId ? String(created.shopId) : String(sellerForm.shopId || "");
    setSellerForm(prev => ({
      ...prev,
      shopId: resolvedShopId || prev.shopId,
      name: "",
      company: "",
      description: "",
      imageUrl: "",
      category: "",
      price: "",
      quantity: "1"
    }));
    await loadSellerProducts(resolvedShopId || sellerForm.shopId);
    setToast("Product added to your inventory.");
    setTimeout(() => setToast(""), 2200);
  }

  async function handleSellerImageSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    setSellerImageUploading(true);
    try {
      const uploaded = await uploadChatAttachment(file, { isPrivate: false });
      setSellerForm(prev => ({
        ...prev,
        imageUrl: uploaded.fileUrl
      }));
      setToast("Product image uploaded successfully.");
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      setError(err.message || "Image upload failed");
    } finally {
      setSellerImageUploading(false);
    }
  }

  async function updateShopLocation() {
    if (!sellerForm.shopId) return;
    await api(`/marketplace/shops/${sellerForm.shopId}/location`, {
      method: "PUT",
      body: JSON.stringify({
        lat: Number(shopLocationForm.lat),
        lng: Number(shopLocationForm.lng)
      })
    });
    await searchShops();
  }

  async function updateMyProviderLocation() {
    if (!myProviderProfileId) {
      setError("Provider profile not found. Refresh providers list first.");
      return;
    }
    await api(`/marketplace/providers/${myProviderProfileId}/location`, {
      method: "PUT",
      body: JSON.stringify({
        lat: Number(providerLocationForm.lat),
        lng: Number(providerLocationForm.lng),
        available: Boolean(providerLocationForm.available)
      })
    });
    await loadProviders();
  }

  async function updateSellerQuantity(productId, quantity) {
    await api(`/marketplace/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify({ quantity: Number(quantity || 0) })
    });
    await loadSellerProducts();
  }

  function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      setProfilePhoto(value);
      localStorage.setItem(profilePhotoStorageKey, value);
    };
    reader.readAsDataURL(file);
  }

  async function bootstrap() {
    setLoading(true);
    setError("");
    try {
      const tasks = [
        loadHome(),
        loadConversations(),
        searchShops(),
        loadProviders(),
        loadWallet(),
        loadUserSettings(),
        loadNotificationPreferences()
      ];
      if (canAccess.services) tasks.push(loadServiceRequests());
      if (canAccess.seller) tasks.push(loadSellerProducts());
      if (canAccess.orders) tasks.push(loadOrders());

      const results = await Promise.allSettled(tasks);
      const failed = results.find(
        result => result.status === "rejected" && result.reason?.status !== 403
      );
      if (failed) {
        setError(failed.reason?.message || "Some dashboard modules failed to load");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, [canAccess.services, canAccess.seller]);

  useEffect(() => {
    const raw = localStorage.getItem(seenStoreKey);
    if (!raw) return;
    try {
      const rows = JSON.parse(raw);
      setSeenMessageIds(new Set(rows.map(String)));
    } catch {
      setSeenMessageIds(new Set());
    }
  }, [seenStoreKey]);

  useEffect(() => {
    selectedConversationRef.current = String(selectedConversationId || "");
  }, [selectedConversationId]);

  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setBrowserPushPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
      auth: {
        token,
        deviceId
      }
    });
    socketRef.current = socket;

    socket.on("presence:update", payload => {
      const userId = String(payload?.userId || "");
      if (!userId) return;
      setOnlineUsers(prev => {
        const next = { ...prev };
        if (payload?.online) {
          next[userId] = true;
        } else {
          delete next[userId];
        }
        return next;
      });
    });

    socket.on("chat:message.created", payload => {
      const conversationId = String(payload?.conversation_id || payload?.conversationId || "");
      if (!conversationId) return;
      loadConversations().catch(() => {});
      if (conversationId === selectedConversationRef.current) {
        loadMessages(conversationId, { markRead: true }).catch(() => {});
      }
    });

    socket.on("chat:read", payload => {
      if (String(payload?.conversationId || "") !== selectedConversationRef.current) return;
      loadMessages(payload.conversationId, { markRead: false }).catch(() => {});
    });

    socket.on("chat:delivered", payload => {
      if (String(payload?.conversationId || "") !== selectedConversationRef.current) return;
      loadMessages(payload.conversationId, { markRead: false }).catch(() => {});
    });

    socket.on("chat:typing", payload => {
      const key = `${payload?.conversationId || ""}:${payload?.userId || ""}`;
      if (!payload?.conversationId || !payload?.userId) return;
      if (payload?.isTyping) {
        setTypingUsers(prev => ({
          ...prev,
          [key]: {
            conversationId: String(payload.conversationId),
            userId: String(payload.userId),
            label: `User ${payload.userId}`,
            ts: Date.now()
          }
        }));
        return;
      }
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });

    socket.on("call:offer", payload => {
      if (!payload?.roomId || !payload?.fromUserId || !payload?.sdp) return;
      setRemoteCallUserId(String(payload.fromUserId));
      setActiveCallRoomId(String(payload.roomId));
      setCallSession({
        open: true,
        roomId: String(payload.roomId),
        type: "video",
        status: "incoming",
        incomingFrom: String(payload.fromUserId),
        offerSdp: payload.sdp
      });
      setActiveTab("chat");
    });

    socket.on("call:answer", async payload => {
      if (!payload?.roomId || !payload?.sdp) return;
      if (String(payload.roomId) !== String(callSessionRef.current.roomId)) return;
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp)
        );
        setCallSession(prev => ({ ...prev, status: "connecting" }));
      } catch {
        // ignore signaling mismatch
      }
    });

    socket.on("call:ice-candidate", async payload => {
      if (!payload?.roomId || !payload?.candidate) return;
      if (String(payload.roomId) !== String(callSessionRef.current.roomId)) return;
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(payload.candidate)
        );
      } catch {
        // ignore bad ice candidates
      }
    });

    socket.on("call:participant.left", payload => {
      if (String(payload?.roomId || "") !== String(callSessionRef.current.roomId || "")) return;
      setCallSession(prev => ({ ...prev, status: "peer-left" }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [token, deviceId]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      cleanupPeerConnection();
      cleanupMediaStreams();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers(prev => {
        const next = {};
        for (const [key, value] of Object.entries(prev)) {
          if (Date.now() - Number(value?.ts || 0) < 6000) {
            next[key] = value;
          }
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tabs.some(tab => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || "chat");
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    const handleKeydown = event => {
      const key = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (key === "escape") {
        setCommandOpen(false);
        setCommandQuery("");
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const frame = window.requestAnimationFrame(() => {
      commandInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commandOpen]);

  useEffect(() => {
    if (!marketplaceCategories.includes(marketCategory)) {
      setMarketCategory("all");
    }
  }, [marketplaceCategories, marketCategory]);

  useEffect(() => {
    if (activeTab === "chat" && selectedConversationId) {
      loadMessages(selectedConversationId, { markRead: true }).catch(() => {});
    }
  }, [activeTab, selectedConversationId]);

  useEffect(() => {
    if (activeTab !== "chat") return;
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages, activeTab]);

  useEffect(() => {
    loadPresence().catch(() => {});
    loadNotifications().catch(() => {});

    const interval = setInterval(() => {
      loadPresence().catch(() => {});
      loadNotifications().catch(() => {});
      if (activeTab === "chat") {
        loadConversations().catch(() => {});
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    const needle = deferredProductQuery.trim();
    if (!needle) return;
    const handle = setTimeout(() => {
      searchProductsNearby(needle).catch(() => {});
    }, 350);
    return () => clearTimeout(handle);
  }, [
    deferredProductQuery,
    shopFilters.lat,
    shopFilters.lng,
    shopFilters.radiusKm,
    productSearchFilters.maxPrice,
    productSearchFilters.minShopRating,
    productSearchFilters.sortBy
  ]);

  useEffect(() => {
    if (!canAccess.marketplace) return;
    const handle = setTimeout(() => {
      loadRecommendedProducts({
        query: deferredProductQuery.trim()
      }).catch(() => {});
    }, 450);
    return () => clearTimeout(handle);
  }, [
    canAccess.marketplace,
    shopFilters.lat,
    shopFilters.lng,
    shopFilters.radiusKm,
    productSearchFilters.maxPrice,
    productSearchFilters.minShopRating,
    cart,
    deferredProductQuery
  ]);

  useEffect(() => {
    if (!checkoutValidationError) return;
    const nextError = validateDeliveryDetails();
    if (!nextError) {
      setCheckoutValidationError("");
    }
  }, [deliveryDetails, checkoutValidationError]);

  useEffect(() => {
    if (!paymentIntent?.intentId) return;
    const interval = setInterval(async () => {
      try {
        const status = await api(`/payments/intents/${paymentIntent.intentId}`);
        setPaymentIntent(status);
        if (status?.status === "SUCCEEDED") {
          clearInterval(interval);
          setToast("Payment settled. Wallet credited.");
          await loadWallet();
          if (pendingOrderAfterPayment) {
            setPendingOrderAfterPayment(false);
            await placeOrder();
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [paymentIntent?.intentId, pendingOrderAfterPayment]);

  function renderHomeTab() {
    return (
      <section className="home-shell">
        <div className="home-stat-grid">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div>
              <strong>{activeOrdersCount}</strong>
              <small>Active Orders</small>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div>
              <strong>${toCurrency(revenueToday)}</strong>
              <small>Revenue Today</small>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💬</div>
            <div>
              <strong>{conversations.length}</strong>
              <small>Active Chats</small>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon warning">⚠️</div>
            <div>
              <strong>{slaBreaches}</strong>
              <small>SLA Breaches</small>
            </div>
          </div>
        </div>

        <div className="home-main-grid">
          <article className="panel-card home-quick">
            <div className="panel-title-row">
              <h3>Quick Actions</h3>
            </div>
            <div className="quick-action-grid">
              {homeActions.slice(0, 4).map(action => (
                <button
                  key={action.id}
                  type="button"
                  className="quick-action-card"
                  onClick={action.run}
                >
                  <span className="quick-action-icon">
                    <UiIcon name={action.icon} />
                  </span>
                  <div>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </div>
                </button>
              ))}
            </div>
          </article>

          <article className="panel-card home-activity">
            <div className="panel-title-row">
              <h3>Activity Feed</h3>
            </div>
            <div className="activity-feed">
              {(notifications || []).slice(0, 6).map(item => (
                <div key={item.id} className="activity-item">
                  <span className="activity-dot" />
                  <div>
                    <strong>{item.event_type || "New update"}</strong>
                    <small>{formatClock(item.created_at)} ago</small>
                  </div>
                  <span className="activity-arrow">↗</span>
                </div>
              ))}
              {!notifications.length && <div className="empty-line">No recent activity.</div>}
            </div>
          </article>
        </div>
      </section>
    );
  }

  useEffect(() => {
    const scoped = localStorage.getItem(profilePhotoStorageKey);
    if (scoped) {
      setProfilePhoto(scoped);
      return;
    }

    const legacy = localStorage.getItem("lifehub_profile_photo");
    if (legacy) {
      localStorage.setItem(profilePhotoStorageKey, legacy);
      localStorage.removeItem("lifehub_profile_photo");
      setProfilePhoto(legacy);
      return;
    }

    setProfilePhoto("");
  }, [profilePhotoStorageKey]);

  useEffect(() => {
    setDeliveryDetails(prev => ({
      ...prev,
      recipientName: prev.recipientName || user.name || "",
      recipientPhone: prev.recipientPhone || user.phone || ""
    }));
  }, [user.name, user.phone]);

  function renderChatTab() {
    const activePeer = selectedThread?.peers?.[0] || null;
    const activePeerName = activePeer?.name || `Conversation ${selectedConversationId || "-"}`;
    const activePeerOnline = Boolean(activePeer?.userId && onlineUsers[String(activePeer.userId)]);
    const canCall = Boolean(
      selectedConversationId &&
      activePeer?.userId &&
      String(selectedThread?.type || "DIRECT").toUpperCase() !== "GROUP"
    );

    return (
      <section className="chat-shell messenger-shell">
        <div className="chat-layout full-width-chat messenger-layout">
          <aside className="chat-sidebar messenger-sidebar">
            <div className="chat-sidebar-head">
              <h2>Messages</h2>
              <div className="thread-actions">
                <button className="icon-btn" onClick={loadConversations} title="Refresh chats" type="button">
                  <UiIcon name="refresh" />
                </button>
                <button className="icon-btn" onClick={() => setChatListMode("groups")} title="Show groups" type="button">
                  <UiIcon name="plus" />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  title="Show unread first"
                  onClick={() => setChatListMode("unread")}
                >
                  <UiIcon name="dots" />
                </button>
              </div>
            </div>

            <div className="chat-sidebar-stats">
              <span>{visibleConversations.length} conversations</span>
              <span>{totalUnreadChats} unread</span>
            </div>

            <label className="chat-search-wrap">
              <UiIcon name="search" />
              <input
                value={chatSearch}
                onChange={event => setChatSearch(event.target.value)}
                placeholder="Search chats or start a new conversation"
              />
            </label>

            <div className="chat-filter-row">
              <button
                className={`chat-filter-chip ${chatListMode === "all" ? "active" : ""}`}
                type="button"
                onClick={() => setChatListMode("all")}
              >
                All ({filteredConversations.length})
              </button>
              <button
                className={`chat-filter-chip ${chatListMode === "unread" ? "active" : ""}`}
                type="button"
                onClick={() => setChatListMode("unread")}
              >
                Unread
              </button>
              <button
                className={`chat-filter-chip ${chatListMode === "groups" ? "active" : ""}`}
                type="button"
                onClick={() => setChatListMode("groups")}
              >
                Groups
              </button>
            </div>

            <details className="chat-tools">
              <summary>New chat and contacts</summary>
              <div className="chat-tools-body">
                <div className="chat-action-row">
                  <input
                    value={peerPhone}
                    onChange={event => setPeerPhone(event.target.value)}
                    placeholder="Phone number"
                    onKeyDown={event => {
                      if (event.key === "Enter") createConversationByPhone();
                    }}
                  />
                  <button type="button" onClick={createConversationByPhone}>New chat</button>
                </div>
                <div className="chat-action-row">
                  <input
                    value={contactPhones}
                    onChange={event => setContactPhones(event.target.value)}
                    placeholder="Contact numbers"
                  />
                  <button type="button" onClick={resolveContacts}>Sync</button>
                </div>
                <div className="chat-action-row">
                  <input
                    value={groupPhones}
                    onChange={event => setGroupPhones(event.target.value)}
                    placeholder="Group numbers"
                  />
                  <button type="button" onClick={createGroupConversation}>New group</button>
                </div>
                <div className="chat-permission-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={pickContactsFromDevice}
                    disabled={!canUseDeviceContacts}
                  >
                    {canUseDeviceContacts ? "Import Contacts" : "Contacts Unavailable"}
                  </button>
                  <small className="inline-help">
                    {canUseDeviceContacts
                      ? "Grant access once to import contacts."
                      : "Manual number entry is enabled."}
                  </small>
                </div>
              </div>
            </details>

            {!!resolvedContacts.length && (
              <div className="chat-resolved-list">
                {resolvedContacts.map(contact => (
                  <button
                    key={contact.id}
                    className="item-card button-like"
                    type="button"
                    onClick={async () => {
                      try {
                        const conversation = await api("/chat/conversations/by-phone", {
                          method: "POST",
                          body: JSON.stringify({ phone: contact.phone })
                        });
                        await loadConversations();
                        if (conversation?.id) {
                          setSelectedConversationId(String(conversation.id));
                        }
                      } catch (err) {
                        setError(err.message || "Unable to start contact chat");
                      }
                    }}
                  >
                    <strong>{contact.name}</strong>
                    <small>{contact.phone}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="chat-list">
              {visibleConversations.map(conv => (
                <button
                  key={conv.id}
                  className={`chat-list-item ${String(conv.id) === String(selectedConversationId) ? "active" : ""}`}
                  onClick={() => openConversation(conv.id)}
                  type="button"
                >
                  <div className="chat-row">
                    <div className="chat-avatar">
                      {(() => {
                        const label = conv?.peers?.[0]?.name || conv?.peers?.[0]?.phone || "Contact";
                        const avatarUrl = conv?.peers?.[0]?.avatarUrl || providerAvatarUrl(label);
                        return avatarUrl ? (
                          <img src={avatarUrl} alt={label} className="chat-avatar-img" />
                        ) : (
                          initials(label)
                        );
                      })()}
                      {onlineUsers[String(conv?.peers?.[0]?.userId)] && <span className="online-dot" />}
                    </div>
                    <div className="chat-list-body">
                      <div className="chat-list-top">
                        <strong>{conv?.peers?.[0]?.name || `Conversation #${conv.id}`}</strong>
                        <div className="chat-meta">
                          <small>{formatClock(conv?.lastMessage?.created_at)}</small>
                        </div>
                      </div>
                      <small className="chat-list-meta">
                        {onlineUsers[String(conv?.peers?.[0]?.userId)] ? "Online" : "Offline"} |{" "}
                        {conv?.peers?.[0]?.phone || titleCase(conv.type || "direct")}
                      </small>
                      <div className="chat-preview-row">
                        <small>{messagePreview(conv?.lastMessage?.content, 62)}</small>
                        {Number(conv?.unreadCount || 0) > 0 && (
                          <span className="unread-badge">{conv.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {!visibleConversations.length && (
                <div className="empty-line">No conversations for this filter.</div>
              )}
            </div>
          </aside>

          <article className="chat-thread messenger-thread">
            <div className="chat-thread-head">
              <div className="thread-peer">
                <div className="chat-avatar large">
                  {(() => {
                    const label = activePeer?.name || activePeer?.phone || "Contact";
                    const avatarUrl = activePeer?.avatarUrl || providerAvatarUrl(label);
                    return avatarUrl ? (
                      <img src={avatarUrl} alt={label} className="chat-avatar-img" />
                    ) : (
                      initials(label)
                    );
                  })()}
                  {activePeerOnline && <span className="online-dot" />}
                </div>
                <div className="thread-peer-meta">
                  <h2>{activePeerName}</h2>
                  <small>
                    {activePeerOnline ? "Online now" : "Offline"} | {activePeer?.phone || "Secure chat"}
                  </small>
                </div>
              </div>
              <div className="thread-actions">
                <button
                  className="icon-btn"
                  onClick={() => startInstantCall(userSettings.chat?.defaultCallType || "video")}
                  title="Video call"
                  type="button"
                  disabled={!canCall}
                >
                  <UiIcon name="video" />
                </button>
                <button
                  className="icon-btn"
                  title="Voice call"
                  type="button"
                  onClick={() => startInstantCall("audio")}
                  disabled={!canCall}
                >
                  <UiIcon name="phone" />
                </button>
                <button
                  className="icon-btn"
                  title="Search in chat"
                  type="button"
                  onClick={() => threadSearchInputRef.current?.focus()}
                >
                  <UiIcon name="search" />
                </button>
                {activeCallRoomId && <span className="chip">Room {activeCallRoomId}</span>}
              </div>
            </div>
            <div className="chat-thread-tools">
              <input
                ref={threadSearchInputRef}
                value={threadSearch}
                onChange={event => setThreadSearch(event.target.value)}
                placeholder="Search in this conversation"
              />
              {activeTypingLabel && <span className="typing-pill">{activeTypingLabel} typing...</span>}
            </div>

            {!selectedConversationId ? (
              <div className="chat-placeholder">
                <h3>Select a conversation</h3>
                <p>Pick a chat from the left to start messaging.</p>
              </div>
            ) : (
              <>
                <div className="messages-panel whatsapp-feed">
                  {filteredMessages.map(message => (
                    <div
                      key={message.id}
                      className={`message-row ${String(message.sender_id) === String(user.id) ? "mine" : "theirs"}`}
                    >
                      {String(message.sender_id) !== String(user.id) && (
                        <div className="chat-avatar tiny">
                          {initials(activePeer?.name || activePeer?.phone || "U")}
                        </div>
                      )}
                      <div
                        className={`message-bubble ${
                          String(message.sender_id) === String(user.id) ? "mine" : "theirs"
                        }`}
                      >
                        {String(message.sender_id) !== String(user.id) && (
                          <strong className="bubble-author">{activePeer?.name || "User"}</strong>
                        )}
                        <p>{message.content}</p>
                        {!!message?.message_attachments?.length && (
                          <div className="bubble-attachments">
                            {message.message_attachments.map(attachment => (
                              <a
                                key={`${message.id}_${attachment.id || attachment.file_url}`}
                                href={attachment.file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {attachment.file_type || "file"}
                              </a>
                            ))}
                          </div>
                        )}
                        <small className="bubble-meta">
                          {formatClock(message.created_at)}{" "}
                          {String(message.sender_id) === String(user.id) && (
                            <span
                              className={`delivery-pill ${deliveryMarker(message.deliveryStatus).toLowerCase()}`}
                            >
                              <UiIcon name="check" size={12} />
                              {deliveryMarker(message.deliveryStatus)}
                            </span>
                          )}
                        </small>
                      </div>
                    </div>
                  ))}
                  <div ref={messageEndRef} />
                  {!filteredMessages.length && <div className="empty-line">No messages for this filter.</div>}
                </div>

                {!!pendingAttachments.length && (
                  <div className="attachment-draft-row">
                    {pendingAttachments.map(item => (
                      <button
                        key={item.fileId}
                        type="button"
                        className="attachment-chip"
                        onClick={() => removePendingAttachment(item.fileId)}
                      >
                        {item.fileName || item.fileType} x
                      </button>
                    ))}
                  </div>
                )}

                <div className="composer whatsapp-composer">
                  <button
                    className="icon-btn"
                    type="button"
                    title="Attach file"
                    onClick={triggerAttachmentPicker}
                    disabled={uploadingAttachment}
                  >
                    <UiIcon name="attach" />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    title="Emoji"
                    onClick={() => handleChatInputChange(`${chatText} :)`)}
                  >
                    <UiIcon name="emoji" />
                  </button>
                  <input
                    value={chatText}
                    onChange={event => handleChatInputChange(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && userSettings.chat?.enterToSend !== false) {
                        sendMessage();
                      }
                    }}
                    placeholder="Type a message"
                  />
                  <button className="send-btn" onClick={sendMessage} type="button">
                    <UiIcon name="send" />
                    Send
                  </button>
                  <input
                    ref={filePickerRef}
                    type="file"
                    multiple
                    className="hidden-file-input"
                    onChange={handleChatFileSelection}
                  />
                </div>

                {callSession.open && (
                  <div className="call-overlay">
                    <div className="call-panel">
                      <div className="call-head">
                        <strong>
                          {callSession.type === "audio" ? "Audio Call" : "Video Call"} |{" "}
                          {activePeerName}
                        </strong>
                        <span className="status-pill">{callSession.status}</span>
                      </div>
                      <div className="call-media-grid">
                        <div className="call-media-box">
                          <small>You</small>
                          <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className={`call-video ${callSession.type === "audio" ? "audio-only" : ""}`}
                          />
                        </div>
                        <div className="call-media-box">
                          <small>Peer {remoteCallUserId || currentCallTargetId}</small>
                          <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className={`call-video ${
                              callSession.type === "audio" || !remoteStreamActive ? "audio-only" : ""
                            }`}
                          />
                        </div>
                      </div>
                      <div className="call-actions">
                        {callSession.status === "incoming" ? (
                          <>
                            <button type="button" onClick={acceptIncomingCall}>Accept</button>
                            <button type="button" className="danger" onClick={declineIncomingCall}>
                              Decline
                            </button>
                          </>
                        ) : (
                          <button type="button" className="danger" onClick={() => endCurrentCall()}>
                            End Call
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {!selectedConversationId && callSession.open && (
              <div className="call-overlay">
                <div className="call-panel">
                  <div className="call-head">
                    <strong>
                      {callSession.type === "audio" ? "Audio Call" : "Video Call"} | Incoming
                    </strong>
                    <span className="status-pill">{callSession.status}</span>
                  </div>
                  <div className="call-actions">
                    {callSession.status === "incoming" ? (
                      <>
                        <button type="button" onClick={acceptIncomingCall}>Accept</button>
                        <button type="button" className="danger" onClick={declineIncomingCall}>
                          Decline
                        </button>
                      </>
                    ) : (
                      <button type="button" className="danger" onClick={() => endCurrentCall()}>
                        End Call
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    );
  }

  function renderMarketplaceTab() {
    const dealProducts = visibleRecommendedProducts.slice(0, 10);
    const showingDetailPage = marketplaceView === "detail" && !!selectedMarketplaceDetail;
    const showingCheckoutPage = marketplaceView === "checkout";
    const showingCatalog = !showingDetailPage && !showingCheckoutPage;
    const locationLat = Number(shopFilters.lat);
    const locationLng = Number(shopFilters.lng);
    const hasLocation = Number.isFinite(locationLat) && Number.isFinite(locationLng);
    const locationLabel = hasLocation
      ? `${locationLat.toFixed(3)}, ${locationLng.toFixed(3)}`
      : "Set your delivery point";
    const heroPool = (
      dealProducts.length
        ? dealProducts
        : visibleShopProducts.map(product => ({
            ...product,
            productName: product.name,
            shop: selectedShop || null
          }))
    ).filter(Boolean);
    const heroShelfCards = [
      { key: "trending", title: "Trending in your area", items: heroPool.slice(0, 4) },
      { key: "price", title: "Best value picks", items: heroPool.slice(4, 8) },
      { key: "fast", title: "Fast moving essentials", items: heroPool.slice(8, 12) },
      { key: "restock", title: "Weekly restock list", items: heroPool.slice(12, 16) }
    ];

    return (
      <section className="market-shell ecommerce-market-shell">
        {(showingDetailPage || showingCheckoutPage) && (
          <div className="section-backbar">
            <button type="button" className="ghost-btn" onClick={() => setMarketplaceView("catalog")}>
              ← Back to Marketplace
            </button>
            <div className="section-backbar-meta">
              <strong>{showingCheckoutPage ? "Checkout" : "Product Details"}</strong>
              <small>Focused view — global navigation hidden.</small>
            </div>
          </div>
        )}
        <header className="panel-card market-hero ecommerce-market-hero market-command-hub">
          <div className="marketplace-masthead">
            <button type="button" className="market-brand-block" onClick={() => setMarketplaceView("catalog")}>
              <span className="market-brand-row">
                <img className="market-brand-logo" src="/lh-logo.svg" alt="LifeHub logo" />
                <span className="market-brand-title">LifeHub</span>
              </span>
              <span className="market-brand-subtitle">Grocery Marketplace</span>
            </button>
            <button type="button" className="market-location-card" onClick={useCurrentLocation}>
              <small>Delivering to</small>
              <strong>{locationLabel}</strong>
            </button>
            <div className="market-search-bar-hero">
              <select value={marketCategory} onChange={event => setMarketCategory(event.target.value)}>
                {marketplaceCategories.map(category => (
                  <option key={category} value={category}>
                    {category === "all" ? "All" : titleCase(category)}
                  </option>
                ))}
              </select>
              <div className="market-search-input-wrap">
                <UiIcon name="search" />
                <input
                  value={productQuery}
                  onChange={event => setProductQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key !== "Enter") return;
                    setMarketplaceView("catalog");
                    searchProductsNearby(productQuery);
                  }}
                  placeholder="Search grocery products, brands, and categories"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMarketplaceView("catalog");
                  searchProductsNearby(productQuery);
                }}
              >
                Search
              </button>
            </div>
            <div className="market-head-actions">
              <button type="button" className={showingCatalog ? "active" : ""} onClick={() => setMarketplaceView("catalog")}>
                Browse
              </button>
              <button
                type="button"
                className={showingDetailPage ? "active" : ""}
                onClick={() => {
                  if (selectedMarketplaceDetail) {
                    setMarketplaceView("detail");
                    return;
                  }
                  setError("Open a product first to view full details.");
                }}
              >
                Product Page
              </button>
              <button type="button" className={showingCheckoutPage ? "active" : ""} onClick={goToMarketplaceCheckout}>
                Cart {cart.length}
              </button>
            </div>
          </div>

          <div className="marketplace-department-row">
            <button
              type="button"
              className={`market-department-chip ${marketCategory === "all" ? "active" : ""}`}
              onClick={() => {
                setMarketCategory("all");
                setMarketplaceView("catalog");
              }}
            >
              All Departments
            </button>
            {marketplaceCategories
              .filter(category => category !== "all")
              .slice(0, 10)
              .map(category => (
                <button
                  key={category}
                  type="button"
                  className={`market-department-chip ${marketCategory === category ? "active" : ""}`}
                  onClick={() => {
                    setMarketplaceView("catalog");
                    setMarketCategory(category);
                  }}
                >
                  {titleCase(category)}
                </button>
              ))}
          </div>

          <div className="market-front-banner-grid">
            <article className="market-front-banner">
              <span className="market-eyebrow">Grocery and Essentials</span>
              <h2>Shop like a modern ecommerce product</h2>
              <p>
                Search nearby inventory, compare real shop ratings and pricing, and order from verified stores around your
                location.
              </p>
              <div className="market-chip-row">
                <span className="status-pill">Nearby Shops {shops.length}</span>
                <span className="status-pill">Top Picks {visibleRecommendedProducts.length}</span>
                <span className="status-pill">Cart Items {cart.length}</span>
              </div>
              <div className="market-banner-actions">
                <button
                  type="button"
                  onClick={() => {
                    setMarketplaceView("catalog");
                    searchProductsNearby(productQuery);
                  }}
                >
                  Explore Deals
                </button>
                <button type="button" className="ghost-btn" onClick={searchShops}>
                  Refresh Nearby Shops
                </button>
              </div>
            </article>
            <div className="market-fast-deals">
              {dealProducts.slice(0, 3).map(item => (
                <button
                  key={`deal_feature_${item.productId}_${item?.shop?.id || "shop"}`}
                  type="button"
                  className="market-fast-deal-card"
                  onClick={async () => {
                    await openMarketplaceProduct(item, item?.shop || null);
                  }}
                >
                  {(() => {
                    const imageSrc = resolveMediaUrl(item.imageUrl, mediaBaseUrl);
                    return imageSrc ? (
                      <img src={imageSrc} alt={item.productName} className="market-result-thumb" />
                    ) : (
                      <div className="market-result-thumb market-thumb-placeholder">
                        <span>{initials(item.productName)}</span>
                      </div>
                    );
                  })()}
                  <div>
                    <strong>{item.productName}</strong>
                    <small>{item?.shop?.shopName || "Nearby shop"}</small>
                    <small className="market-deal-price">{toCurrency(item.price)}</small>
                  </div>
                </button>
              ))}
              {!dealProducts.length && (
                <div className="empty-line">Top deal cards will appear when recommendation data is available.</div>
              )}
            </div>
          </div>

          <div className="market-hero-shelf-grid">
            {heroShelfCards.map(section => (
              <article key={section.key} className="market-shelf-card">
                <div className="market-panel-head">
                  <h3>{section.title}</h3>
                </div>
                <div className="market-shelf-items">
                  {section.items.map(item => (
                    <button
                      key={`hero_shelf_${section.key}_${item?.productId || item?.id || item?.productName}`}
                      type="button"
                      className="market-shelf-item"
                      onClick={async () => {
                        await openMarketplaceProduct(item, item?.shop || selectedShop || null);
                      }}
                    >
                      {(() => {
                        const imageSrc = resolveMediaUrl(item?.imageUrl, mediaBaseUrl);
                        return imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={item?.productName || item?.name || "Product"}
                            className="market-shelf-thumb"
                          />
                        ) : (
                          <div className="market-shelf-thumb market-thumb-placeholder">
                            <span>{initials(item?.productName || item?.name)}</span>
                          </div>
                        );
                      })()}
                      <small>{item?.productName || item?.name || "Product"}</small>
                    </button>
                  ))}
                  {!section.items.length && (
                    <div className="empty-line">Products appear here as soon as nearby inventory loads.</div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </header>

        {showingDetailPage && (
          <article className="panel-card marketplace-page market-product-detail-page commerce-section">
            <div className="market-panel-head">
              <h3>Product Details</h3>
              <div className="market-action-pair">
                <button type="button" className="ghost-btn" onClick={() => setMarketplaceView("catalog")}>
                  Back to Products
                </button>
                <button
                  type="button"
                  onClick={() =>
                    addToCart({
                      id: selectedMarketplaceDetail.productId,
                      name: selectedMarketplaceDetail.name,
                      price: selectedMarketplaceDetail.price
                    })
                  }
                >
                  Add to cart
                </button>
                <button
                  type="button"
                  onClick={() => buyNowMarketplaceProduct(selectedMarketplaceDetail, selectedMarketplaceDetail.shop || selectedShop)}
                >
                  Buy now
                </button>
              </div>
            </div>
            <div className="product-detail-layout">
              <div className="product-detail-image-wrap">
                {(() => {
                  const imageSrc = resolveMediaUrl(selectedMarketplaceDetail.imageUrl, mediaBaseUrl);
                  return imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={selectedMarketplaceDetail.name}
                      className="product-detail-image"
                    />
                  ) : (
                    <div className="product-detail-image market-thumb-placeholder">
                      <span>{initials(selectedMarketplaceDetail.name)}</span>
                    </div>
                  );
                })()}
              </div>
              <div className="product-detail-content">
                <h3>{selectedMarketplaceDetail.name}</h3>
                <small>
                  {selectedMarketplaceDetail.company
                    ? `Brand ${selectedMarketplaceDetail.company}`
                    : "Local product"}
                </small>
                <p>{selectedMarketplaceDetail.description || "No detailed description available for this product yet."}</p>
                <div className="product-detail-meta">
                  <span className="status-pill">{titleCase(selectedMarketplaceDetail.category || "general")}</span>
                  <span className="status-pill">Qty {selectedMarketplaceDetail.availableQuantity}</span>
                  {!!selectedMarketplaceDetail.shop?.shopName && (
                    <span className="status-pill">{selectedMarketplaceDetail.shop.shopName}</span>
                  )}
                </div>
                <div className="product-detail-price-row">
                  <strong className="market-price">{toCurrency(selectedMarketplaceDetail.price)}</strong>
                  <small>
                    Shop rating {Number(selectedMarketplaceDetail.shop?.rating || 0).toFixed(1)} | Reliability{" "}
                    {Number(selectedMarketplaceDetail.shop?.reliabilityScore || 0).toFixed(1)}
                  </small>
                </div>
              </div>
            </div>
            <div className="divider" />
            <div className="market-panel-head">
              <h3>Customer Feedback</h3>
              {!!shopFeedbackSummary && (
                <small>
                  Average {Number(shopFeedbackSummary.avgRating || 0).toFixed(1)} from{" "}
                  {Number(shopFeedbackSummary.feedbackCount || 0)} ratings
                </small>
              )}
            </div>
            {loadingShopFeedback && <div className="empty-line">Loading feedback...</div>}
            {!loadingShopFeedback && !!shopFeedbackError && <div className="empty-line">{shopFeedbackError}</div>}
            {!loadingShopFeedback && !shopFeedbackError && (
              <div className="feedback-list">
                {shopFeedbackRows.slice(0, 6).map(row => (
                  <article key={row.id} className="feedback-card">
                    <div className="feedback-head">
                      <strong>{row?.customer?.name || "Customer"}</strong>
                      <span className="status-pill">
                        {ratingStars(row.rating)} {Number(row.rating || 0).toFixed(1)}
                      </span>
                    </div>
                    <small>{row.comment || "No written comment provided."}</small>
                  </article>
                ))}
                {!shopFeedbackRows.length && <div className="empty-line">No customer feedback yet for this shop.</div>}
              </div>
            )}
            <div className="divider" />
            <div className="market-panel-head">
              <h3>Related Products</h3>
              <small>Similar category items from nearby stores</small>
            </div>
            <div className="market-product-grid commerce-products">
              {relatedMarketplaceProducts.map(product => (
                <article
                  key={`related_${product.productId}`}
                  className="market-product-card commerce-product-card clickable"
                  onClick={() => openMarketplaceProduct(product, product.shop || selectedShop)}
                >
                  {(() => {
                    const imageSrc = resolveMediaUrl(product.imageUrl, mediaBaseUrl);
                    return imageSrc ? (
                      <img src={imageSrc} alt={product.name} className="market-product-thumb" />
                    ) : (
                      <div className="market-product-thumb market-thumb-placeholder">
                        <span>{initials(product.name)}</span>
                      </div>
                    );
                  })()}
                  <div className="market-product-body">
                    <strong>{product.name}</strong>
                    <small>{product.company ? `Brand ${product.company}` : "Local inventory"}</small>
                  </div>
                  <div className="market-product-actions">
                    <strong className="market-price">{toCurrency(product.price)}</strong>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        addToCart({ id: product.productId, name: product.name, price: product.price });
                      }}
                    >
                      Add to cart
                    </button>
                  </div>
                </article>
              ))}
              {!relatedMarketplaceProducts.length && (
                <div className="empty-line">No related products available right now.</div>
              )}
            </div>
          </article>
        )}

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
                          <small>Unit {toCurrency(item.price)}</small>
                        </div>
                        <div className="market-cart-actions">
                          <input
                            value={item.quantity}
                            onChange={event => updateCartQuantity(item.productId, event.target.value)}
                            placeholder="Qty"
                          />
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
                  <div className="market-total-row">
                    <span>Total</span>
                    <strong>{toCurrency(cartTotal)}</strong>
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

        {showingCatalog && (
        <div className="market-grid market-grid-commerce">
          <aside className="panel-card market-shop-panel market-filter-rail">
            <div className="market-panel-head">
              <h3>Nearby Grocery Filters</h3>
              <button type="button" className="ghost-btn" onClick={searchShops}>
                Refresh
              </button>
            </div>
            <div className="market-location-grid">
              <button type="button" onClick={useCurrentLocation}>
                Use Current Location
              </button>
              <input
                value={shopFilters.lat}
                onChange={event => setShopFilters(prev => ({ ...prev, lat: event.target.value }))}
                placeholder="Latitude"
              />
              <input
                value={shopFilters.lng}
                onChange={event => setShopFilters(prev => ({ ...prev, lng: event.target.value }))}
                placeholder="Longitude"
              />
              <input
                value={shopFilters.radiusKm}
                onChange={event =>
                  setShopFilters(prev => ({ ...prev, radiusKm: event.target.value }))
                }
                placeholder="Radius (km)"
              />
            </div>
            <div className="market-filter-grid">
              <input
                value={productSearchFilters.maxPrice}
                onChange={event =>
                  setProductSearchFilters(prev => ({ ...prev, maxPrice: event.target.value }))
                }
                placeholder="Max price"
              />
              <input
                value={productSearchFilters.minShopRating}
                onChange={event =>
                  setProductSearchFilters(prev => ({ ...prev, minShopRating: event.target.value }))
                }
                placeholder="Min shop rating"
              />
              <select
                value={productSearchFilters.sortBy}
                onChange={event =>
                  setProductSearchFilters(prev => ({ ...prev, sortBy: event.target.value }))
                }
              >
                <option value="fair">Best Fair Deal</option>
                <option value="distance">Nearest</option>
                <option value="price">Lowest Price</option>
                <option value="reliable">Most Reliable Shop</option>
              </select>
            </div>
            <div className="market-shop-list">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  className={`market-shop-card ${String(shop.id) === String(selectedShopId) ? "active" : ""}`}
                  onClick={() => {
                    setMarketplaceView("catalog");
                    loadShopProducts(shop.id);
                  }}
                  type="button"
                >
                  <strong>{shop.shopName}</strong>
                  <small>{shop.address || "Address unavailable"}</small>
                  <small>
                    {shop.distanceKm !== null && shop.distanceKm !== undefined
                      ? `${shop.distanceKm.toFixed(1)} km`
                      : "distance n/a"} | Rating {Number(shop.rating || 0).toFixed(1)}
                  </small>
                  <small>Reliability {Number(shop.reliabilityScore || 0).toFixed(1)}</small>
                  <span className="status-pill">{shop.openNow ? "Open now" : "Closed now"}</span>
                </button>
              ))}
              {!shops.length && <div className="empty-line">No shops loaded yet.</div>}
            </div>
          </aside>

          <div className="market-main market-main-commerce">
            <article className="panel-card market-recommend-panel commerce-section">
              <div className="market-panel-head">
                <h3>Recommended For You</h3>
                <small>Association-rule ranking + nearby pricing + reliability score</small>
              </div>
              {loadingRecommendations && <div className="empty-line">Building recommendations...</div>}
              {!loadingRecommendations && !!recommendationError && (
                <div className="empty-line">{recommendationError}</div>
              )}
              {!loadingRecommendations && !recommendationError && !visibleRecommendedProducts.length && (
                <div className="empty-line">No top picks available yet for this area.</div>
              )}
              <div className="market-top-grid">
                {!loadingRecommendations &&
                  visibleRecommendedProducts.map(item => (
                    <article key={`rec_${item.productId}_${item?.shop?.id || "shop"}`} className="market-top-card">
                      {(() => {
                        const imageSrc = resolveMediaUrl(item.imageUrl, mediaBaseUrl);
                        return imageSrc ? (
                          <img src={imageSrc} alt={item.productName} className="market-product-thumb" />
                        ) : (
                          <div className="market-product-thumb market-thumb-placeholder">
                            <span>{initials(item.productName)}</span>
                          </div>
                        );
                      })()}
                      <div className="market-product-body">
                        <strong>{item.productName}</strong>
                        <small>{item?.shop?.shopName || "Nearby shop"}</small>
                        <small>{item.recommendationReason}</small>
                      </div>
                      <div className="market-product-foot">
                        <span className="status-pill">Score {Number(item.recommendationScore || 0).toFixed(2)}</span>
                        <span className="status-pill">
                          {ratingStars(item?.shop?.rating)} {Number(item?.shop?.rating || 0).toFixed(1)}
                        </span>
                      </div>
                      <div className="market-product-actions">
                        <strong className="market-price">{toCurrency(item.price)}</strong>
                        <div className="market-action-pair">
                          <button type="button" className="ghost-btn" onClick={() => openMarketplaceProduct(item, item?.shop || null)}>
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!item?.shop?.id) return;
                              setMarketplaceView("catalog");
                              setSelectedShopId(String(item.shop.id));
                              await loadShopProducts(item.shop.id);
                            }}
                          >
                            Open Shop
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </article>

            {!!productQuery.trim() && (
              <article className="panel-card market-search-results commerce-section">
                <div className="market-panel-head">
                  <h3>Search Results</h3>
                  <small>
                    {!searchingProducts ? `${visibleProductResults.length} matching products` : "Searching..."}
                  </small>
                </div>
                {searchingProducts && <div className="empty-line">Searching nearby inventory...</div>}
                {!searchingProducts && !!productSearchError && (
                  <div className="empty-line">{productSearchError}</div>
                )}
                {!searchingProducts && !productSearchError && !visibleProductResults.length && (
                  <div className="empty-line">No nearby shops found for this item.</div>
                )}
                <div className="market-search-grid">
                  {!searchingProducts &&
                    visibleProductResults.map(item => (
                      <button
                        key={`${item?.shop?.id || "shop"}-${item.productId}`}
                        className="market-result-card commerce-result-card"
                        onClick={async () => {
                          await openMarketplaceProduct(item, item?.shop || null);
                        }}
                        type="button"
                        disabled={!item?.shop?.id}
                      >
                        {(() => {
                          const imageSrc = resolveMediaUrl(item.imageUrl, mediaBaseUrl);
                          return imageSrc ? (
                            <img src={imageSrc} alt={item.productName} className="market-result-thumb" />
                          ) : (
                            <div className="market-result-thumb market-thumb-placeholder">
                              <span>{initials(item.productName)}</span>
                            </div>
                          );
                        })()}
                        <div>
                          <strong>{item.productName}</strong>
                          <small>
                            {(item.company ? `${item.company} | ` : "")}
                            {item?.shop?.shopName || "Unknown shop"} | {toCurrency(item.price)} | Qty{" "}
                            {item.availableQuantity}
                          </small>
                          <small>
                            {item.distanceKm !== null && item.distanceKm !== undefined
                              ? `${item.distanceKm.toFixed(1)} km`
                              : "distance n/a"} | Shop rating {Number(item?.shop?.rating || 0).toFixed(1)}
                          </small>
                        </div>
                      </button>
                    ))}
                </div>
              </article>
            )}

            <article className="panel-card market-catalog-panel commerce-section">
              <div className="market-panel-head">
                <h3>{selectedShop ? `${selectedShop.shopName} Storefront` : "Storefront Catalog"}</h3>
                <small>
                  {selectedShop
                    ? "Browse and add products from this selected grocery."
                    : "Select a nearby shop to load products."}
                </small>
              </div>
              {selectedShop && (
                <div className="market-selected-shop-banner">
                  <strong>{selectedShop.shopName}</strong>
                  <small>
                    {selectedShop.address || "Address unavailable"} |{" "}
                    {ratingStars(selectedShop.rating)} {Number(selectedShop.rating || 0).toFixed(1)} | Reliability{" "}
                    {Number(selectedShop.reliabilityScore || 0).toFixed(1)}
                  </small>
                </div>
              )}
              <div className="market-product-grid commerce-products">
                {visibleShopProducts.map(product => (
                  <article
                    key={product.id}
                    className="market-product-card commerce-product-card clickable"
                    onClick={() => openMarketplaceProduct(product, selectedShop)}
                  >
                    {(() => {
                      const imageSrc = resolveMediaUrl(product.imageUrl, mediaBaseUrl);
                      return imageSrc ? (
                        <img src={imageSrc} alt={product.name} className="market-product-thumb" />
                      ) : (
                        <div className="market-product-thumb market-thumb-placeholder">
                          <span>{initials(product.name)}</span>
                        </div>
                      );
                    })()}
                    <div className="market-product-body">
                      <strong>{product.name}</strong>
                      <small>{product.company ? `Brand ${product.company}` : "Local inventory"}</small>
                      <small>{product.description || "Fresh stock available from nearby store."}</small>
                      <small className="market-rating-line">
                        {ratingStars(selectedShop?.rating || 4)} {Number(selectedShop?.rating || 4).toFixed(1)}
                      </small>
                      <small>
                        M.R.P <s>{toCurrency(Number(product.price || 0) * 1.12)}</s>
                      </small>
                    </div>
                    <div className="market-product-foot">
                      <span className="status-pill">Qty {product.availableQuantity}</span>
                      <span className="status-pill">{titleCase(product.category || "general")}</span>
                    </div>
                    <div className="market-product-actions">
                      <strong className="market-price">{toCurrency(product.price)}</strong>
                      <div className="market-action-pair">
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={event => {
                            event.stopPropagation();
                            openMarketplaceProduct(product, selectedShop);
                          }}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            addToCart(product);
                          }}
                        >
                          Add to cart
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!visibleShopProducts.length && (
                  <div className="empty-line">Select a shop and category to view products.</div>
                )}
              </div>
            </article>
          </div>

          <aside className="panel-card market-cart-panel sticky-checkout">
            <div className="market-panel-head">
              <h3>Cart Summary</h3>
              <small>{selectedShop ? selectedShop.shopName : "No shop selected"}</small>
            </div>
            <div className="market-cart-list">
              {cart.map(item => (
                <div key={item.productId} className="market-cart-item">
                  <div className="market-cart-row">
                    <div>
                      <strong>{item.name}</strong>
                      <small>Unit {toCurrency(item.price)}</small>
                    </div>
                    <div className="market-cart-actions">
                      <input
                        value={item.quantity}
                        onChange={event => updateCartQuantity(item.productId, event.target.value)}
                        placeholder="Qty"
                      />
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
              <div className="market-total-row">
                <span>Total</span>
                <strong>{toCurrency(cartTotal)}</strong>
              </div>
              {!!cart.length && (
                <button type="button" className="ghost-btn" onClick={clearCart}>
                  Clear cart
                </button>
              )}
              <button type="button" onClick={goToMarketplaceCheckout} disabled={!cart.length || !selectedShopId}>
                Go to checkout page
              </button>
            </div>
          </aside>
        </div>
        )}
      </section>
    );
  }

  function renderServicesTab() {
    const availableProviders = providers.filter(provider => provider.available).length;
    const activeProfile = selectedProviderProfile || null;
    const profileName = activeProfile?.users?.name || selectedProviderCard?.name || "";
    const profileRating = Number(activeProfile?.rating ?? selectedProviderCard?.rating ?? 0);
    const profileExperience = Number(
      activeProfile?.experience_years ?? selectedProviderCard?.experienceYears ?? 0
    );
    const profileSkills = activeProfile?.provider_skills?.length
      ? activeProfile.provider_skills.map(item => item.skill_name)
      : selectedProviderCard?.skills || [];
    const profileLocation = activeProfile?.provider_locations
      ? {
          lat: Number(activeProfile.provider_locations.lat || 0),
          lng: Number(activeProfile.provider_locations.lng || 0),
          available: Boolean(activeProfile.provider_locations.available)
        }
      : {
          lat: Number(selectedProviderCard?.location?.lat || 0),
          lng: Number(selectedProviderCard?.location?.lng || 0),
          available: Boolean(selectedProviderCard?.available)
        };

    return (
      <section className="service-shell service-app-shell">
        <header className="panel-card service-hero">
          <div className="service-hero-head">
            <div>
              <h2>Find and Hire Top Workers Nearby</h2>
              <p>
                Discover top-rated nearby professionals with profile-first cards, then open full details and hire in one
                flow.
              </p>
            </div>
            <div className="service-hero-metrics">
              <span className="status-pill">Providers {providers.length}</span>
              <span className="status-pill">Available {availableProviders}</span>
              <span className="status-pill">Requests {serviceRequests.length}</span>
            </div>
          </div>
          <div className="service-skill-row">
            {serviceSkillOptions.map(skill => (
              <button
                key={skill}
                type="button"
                className={`service-skill-chip ${String(providerSkill).toLowerCase() === String(skill).toLowerCase() ? "active" : ""}`}
                onClick={() => {
                  setProviderSkill(skill);
                  setServiceForm(prev => ({
                    ...prev,
                    serviceType: skill
                  }));
                }}
              >
                {titleCase(skill)}
              </button>
            ))}
          </div>
          <div className="service-filter-grid">
            <button type="button" onClick={useCurrentLocation}>
              Use Current Location
            </button>
            <input
              value={providerSkill}
              onChange={event => setProviderSkill(event.target.value)}
              placeholder="Search skill"
            />
            <input
              value={serviceFilters.lat}
              onChange={event => setServiceFilters(prev => ({ ...prev, lat: event.target.value }))}
              placeholder="Latitude"
            />
            <input
              value={serviceFilters.lng}
              onChange={event => setServiceFilters(prev => ({ ...prev, lng: event.target.value }))}
              placeholder="Longitude"
            />
            <input
              value={serviceFilters.radiusKm}
              onChange={event =>
                setServiceFilters(prev => ({ ...prev, radiusKm: event.target.value }))
              }
              placeholder="Radius KM"
            />
            <button type="button" onClick={loadProviders}>
              Search Providers
            </button>
          </div>
          {(hasRole("PROVIDER") || hasRole("ADMIN")) && (
            <div className="service-provider-self">
              <input
                value={providerLocationForm.lat}
                onChange={event =>
                  setProviderLocationForm(prev => ({ ...prev, lat: event.target.value }))
                }
                placeholder="My latitude"
              />
              <input
                value={providerLocationForm.lng}
                onChange={event =>
                  setProviderLocationForm(prev => ({ ...prev, lng: event.target.value }))
                }
                placeholder="My longitude"
              />
              <select
                value={providerLocationForm.available ? "true" : "false"}
                onChange={event =>
                  setProviderLocationForm(prev => ({
                    ...prev,
                    available: event.target.value === "true"
                  }))
                }
              >
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
              <button type="button" onClick={updateMyProviderLocation}>
                Update My Provider Status
              </button>
            </div>
          )}
        </header>

        <div className="service-layout service-layout-modern">
          <article className="panel-card service-provider-panel">
            <div className="market-panel-head">
              <h3>Top Service Professionals</h3>
              <small>{topServiceProviders.length} workers nearby</small>
            </div>
            <div className="service-provider-grid service-provider-grid-modern">
              {topServiceProviders.map(provider => (
                <article
                  key={provider.id}
                  className={`service-provider-card modern ${String(provider.id) === String(selectedProviderId) ? "active" : ""}`}
                >
                  <div className="service-provider-profile">
                    <img
                      src={providerAvatarUrl(provider.name)}
                      alt={provider.name}
                      className="service-provider-avatar"
                    />
                    <div>
                      <strong>{provider.name}</strong>
                      <small>{(provider.skills || []).slice(0, 3).join(", ") || "General service"}</small>
                      <small className="service-rating-line">
                        {ratingStars(provider.rating)} {Number(provider.rating || 0).toFixed(1)}
                      </small>
                    </div>
                  </div>
                  <div className="service-provider-top">
                    <span className="status-pill">{provider.available ? "Available" : "Unavailable"}</span>
                    <span className="status-pill">
                      {provider.distanceKm !== null && provider.distanceKm !== undefined
                        ? `${provider.distanceKm.toFixed(1)} km away`
                        : "distance n/a"}
                    </span>
                  </div>
                  <div className="service-provider-actions">
                    <button type="button" className="ghost-btn" onClick={() => openProviderProfile(provider.id)}>
                      View Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setServiceForm(prev => ({
                          ...prev,
                          serviceType: provider.skills?.[0] || providerSkill,
                          preferredProviderId: String(provider.id)
                        }));
                        openProviderProfile(provider.id).catch(() => {});
                      }}
                    >
                      Hire Now
                    </button>
                  </div>
                </article>
              ))}
              {!topServiceProviders.length && <div className="empty-line">No providers loaded yet.</div>}
            </div>
          </article>

          <aside className="panel-card service-book-panel service-profile-panel">
            <h3>Worker Profile and Hire</h3>
            {loadingProviderProfile && <div className="info-line">Loading provider profile...</div>}
            {!!providerProfileError && <div className="empty-line">{providerProfileError}</div>}
            {!loadingProviderProfile && !providerProfileError && !!profileName && (
              <article className="service-profile-card">
                <div className="service-provider-profile">
                  <img
                    src={providerAvatarUrl(profileName)}
                    alt={profileName}
                    className="service-provider-avatar large"
                  />
                  <div>
                    <strong>{profileName}</strong>
                    <small>{ratingStars(profileRating)} {profileRating.toFixed(1)}</small>
                    <small>{profileExperience} years experience</small>
                  </div>
                </div>
                <div className="service-profile-chips">
                  {profileSkills.map(skill => (
                    <span key={`${profileName}_${skill}`} className="service-skill-chip">
                      {titleCase(skill)}
                    </span>
                  ))}
                  {!profileSkills.length && <span className="service-skill-chip">General service</span>}
                </div>
                <small>
                  {profileLocation.available ? "Available now" : "Currently unavailable"} |{" "}
                  {profileLocation.lat && profileLocation.lng
                    ? `${profileLocation.lat.toFixed(4)}, ${profileLocation.lng.toFixed(4)}`
                    : "Location unavailable"}
                </small>
              </article>
            )}
            {!loadingProviderProfile && !providerProfileError && !profileName && (
              <div className="info-line">Select a worker card to view profile details and hire.</div>
            )}

            {canCreateServiceRequest ? (
              <div className="service-book-form">
                <input
                  value={serviceForm.serviceType}
                  onChange={event =>
                    setServiceForm(prev => ({ ...prev, serviceType: event.target.value }))
                  }
                  placeholder="Service type"
                />
                <input
                  value={serviceForm.preferredProviderId}
                  onChange={event =>
                    setServiceForm(prev => ({ ...prev, preferredProviderId: event.target.value }))
                  }
                  placeholder="Preferred provider ID"
                />
                <textarea
                  value={serviceForm.description}
                  onChange={event =>
                    setServiceForm(prev => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Describe your issue, timing, address, and requirements"
                  rows={4}
                />
                <button type="button" onClick={createServiceRequest}>
                  Hire for Work
                </button>
              </div>
            ) : (
              <div className="info-line">You can track and complete assigned service requests in this view.</div>
            )}

            <div className="divider" />
            <h3>Request Activity</h3>
            <div className="service-request-list">
              {serviceRequests.map(request => (
                <div key={request.id} className="service-request-card">
                  <div className="item-header">
                    <strong>#{request.id} | {request.service_type}</strong>
                    <span className="status-pill">{request.status}</span>
                  </div>
                  <small>{request.description || "No description"}</small>
                  <div className="item-actions">
                    {canCompleteServiceRequest && (
                      <button type="button" onClick={() => completeServiceRequest(request.id)}>
                        Complete
                      </button>
                    )}
                    {canCancelServiceRequest && (
                      <button type="button" className="danger" onClick={() => cancelServiceRequest(request.id)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!serviceRequests.length && <div className="empty-line">No service requests yet.</div>}
            </div>
          </aside>
        </div>
      </section>
    );
  }

  function renderOrdersTab() {
    const steps = ["CREATED", "PAID", "ASSIGNED", "IN_PROGRESS", "OUT_FOR_DELIVERY", "COMPLETED"];
    const buildStepClass = (orderStatus, step) => {
      const normalized = String(orderStatus || "").toUpperCase();
      const currentIndex = steps.indexOf(normalized);
      const stepIndex = steps.indexOf(step);
      if (normalized === "CANCELLED") return "";
      if (currentIndex === stepIndex) return "active";
      if (currentIndex > stepIndex) return "done";
      return "";
    };

    return (
      <section className="workspace-grid single">
        <article className="panel-card">
          <h2>Order Tracking</h2>
          <div className="stack-list">
            {orders.map(order => (
              <div key={order.id} className="item-card">
                <div className="item-header">
                  <strong>Order #{order.id}</strong>
                  <span className="status-pill">{order.status}</span>
                </div>
                <small>Total: {toCurrency(order.total)} | Shop {order.shop_id}</small>
                {!!order?.order_delivery_details && (
                  <small>
                    Deliver to {order.order_delivery_details.recipient_name} |{" "}
                    {order.order_delivery_details.address_line1}
                  </small>
                )}
                {String(order.status).toUpperCase() === "CANCELLED" ? (
                  <div className="status-cancelled">This order is cancelled.</div>
                ) : (
                  <div className="timeline-row">
                    {steps.map(step => (
                      <div key={step} className={`timeline-node ${buildStepClass(order.status, step)}`}>
                        <span />
                        <small>{titleCase(step)}</small>
                      </div>
                    ))}
                  </div>
                )}
                <div className="item-actions">
                  {(hasRole("SHOPKEEPER") || hasRole("DELIVERY") || hasRole("ADMIN")) && (
                    <>
                      <button type="button" onClick={() => startDelivery(order.id)}>Start Delivery</button>
                      <button type="button" onClick={() => sendDeliveryOtp(order.id)}>Send OTP</button>
                    </>
                  )}
                  {(hasRole("SHOPKEEPER") || hasRole("ADMIN") || hasRole("BUSINESS")) && (
                    <button type="button" onClick={() => payoutShopkeeper(order.id)}>Payout</button>
                  )}
                  {(hasRole("CUSTOMER") || hasRole("ADMIN")) && (
                    <>
                      <input
                        value={deliveryOtpInput}
                        onChange={event => setDeliveryOtpInput(event.target.value)}
                        placeholder="Delivery OTP"
                      />
                      <select
                        value={deliveryRating}
                        onChange={event => setDeliveryRating(event.target.value)}
                      >
                        <option value="5">5 Star</option>
                        <option value="4">4 Star</option>
                        <option value="3">3 Star</option>
                        <option value="2">2 Star</option>
                        <option value="1">1 Star</option>
                      </select>
                      <input
                        value={deliveryFeedback}
                        onChange={event => setDeliveryFeedback(event.target.value)}
                        placeholder="Feedback for shopkeeper"
                      />
                      <button type="button" onClick={() => confirmDelivery(order.id)}>Confirm Delivery</button>
                      <button type="button" onClick={() => requestRefund(order.id)}>Refund</button>
                    </>
                  )}
                  <button
                    type="button"
                    className="danger"
                    disabled={["CANCELLED", "COMPLETED"].includes(String(order.status).toUpperCase())}
                    onClick={() => cancelOrder(order.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
            {!orders.length && <div className="empty-line">No orders yet.</div>}
          </div>
        </article>
      </section>
    );
  }

  function renderWalletTab() {
    const balanceValue = Number(
      walletSummary?.availableBalance ?? walletSummary?.wallet?.balance ?? 0
    );
    const safeBalance = Number.isFinite(balanceValue) ? balanceValue : 0;
    const formatMoney = value => {
      const amount = Number(value || 0);
      if (!Number.isFinite(amount)) return "0.00";
      return amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    const formatTransactionTime = raw => {
      if (!raw) return "";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "";
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const label = isSameDay(date, today)
        ? "Today"
        : isSameDay(date, yesterday)
          ? "Yesterday"
          : date.toLocaleDateString();
      const time = formatClock(date);
      return [label, time].filter(Boolean).join(", ");
    };
    const resolveTransactionAmount = tx => {
      const raw = Number(tx?.amount ?? tx?.value ?? 0);
      return Number.isFinite(raw) ? raw : 0;
    };
    const resolveTransactionLabel = tx => {
      const fallback = tx?.description || tx?.note || "Transaction";
      const rawType = tx?.transaction_type || tx?.type || fallback;
      return titleCase(String(rawType).replace(/_/g, " "));
    };
    const resolveTransactionMeta = tx => {
      const orderId = tx?.order_id || tx?.orderId;
      const reference = tx?.reference_id || tx?.referenceId;
      const refLabel = orderId
        ? `Order #${orderId}`
        : reference
          ? `Ref ${reference}`
          : tx?.counterparty || tx?.merchant || "";
      const timeLabel = formatTransactionTime(tx?.created_at || tx?.createdAt || tx?.timestamp);
      return [refLabel, timeLabel].filter(Boolean).join(" · ");
    };
    const isCreditTransaction = tx => {
      const type = String(tx?.transaction_type || tx?.type || "").toUpperCase();
      const amount = resolveTransactionAmount(tx);
      const creditHints = ["TOPUP", "RECEIVE", "REFUND", "CREDIT", "PAYMENT_RECEIVED"];
      const debitHints = ["TRANSFER", "PAYOUT", "DEBIT", "PAYMENT", "ORDER", "WITHDRAW"];
      if (creditHints.some(hint => type.includes(hint))) return true;
      if (debitHints.some(hint => type.includes(hint))) return false;
      return amount >= 0;
    };

    return (
      <section className="wallet-shell">
        <div className="wallet-balance-card">
          <div className="wallet-balance-top">
            <div className="wallet-balance-meta">
              <span>Available Balance</span>
              <strong>${formatMoney(safeBalance)}</strong>
            </div>
            <button type="button" className="wallet-refresh" onClick={loadWallet} aria-label="Refresh wallet">
              <UiIcon name="refresh" size={16} />
            </button>
          </div>
          <div className="wallet-actions">
            <button
              type="button"
              className={`wallet-action primary ${walletAction === "topup" ? "active" : ""}`}
              onClick={() => setWalletAction(prev => (prev === "topup" ? "" : "topup"))}
            >
              <UiIcon name="plus" size={16} />
              Top Up
            </button>
            <button
              type="button"
              className={`wallet-action ${walletAction === "transfer" ? "active" : ""}`}
              onClick={() => setWalletAction(prev => (prev === "transfer" ? "" : "transfer"))}
            >
              <span className="wallet-action-icon">↗</span>
              Transfer
            </button>
            <button
              type="button"
              className={`wallet-action ${walletAction === "cards" ? "active" : ""}`}
              onClick={() => setWalletAction(prev => (prev === "cards" ? "" : "cards"))}
            >
              <UiIcon name="wallet" size={16} />
              Cards
            </button>
          </div>
          {walletAction === "topup" && (
            <div className="wallet-inline-form">
              <div className="wallet-inline-row">
                <input
                  value={topupAmount}
                  onChange={event => setTopupAmount(event.target.value)}
                  placeholder="Top up amount"
                />
                <button type="button" onClick={topupWallet}>
                  Pay now
                </button>
              </div>
              {paymentIntent && (
                <div className="wallet-intent-note">
                  <div>
                    <strong>Gateway Intent Ready</strong>
                    <small>Provider: {paymentIntent.provider}</small>
                  </div>
                  <code>
                    {`${API_URL.replace("/api", "")}/api/payments/webhooks/${String(paymentIntent.provider || "").toLowerCase()}`}
                  </code>
                </div>
              )}
            </div>
          )}
          {walletAction === "transfer" && (
            <div className="wallet-inline-form">
              <div className="wallet-inline-row">
                <select
                  value={transferForm.recipientType}
                  onChange={event =>
                    setTransferForm(prev => ({
                      ...prev,
                      recipientType: event.target.value
                    }))
                  }
                >
                  <option value="phone">Transfer to phone</option>
                  <option value="upi">Transfer to UPI ID</option>
                </select>
                {transferForm.recipientType === "phone" ? (
                  <input
                    value={transferForm.toPhone}
                    onChange={event =>
                      setTransferForm(prev => ({ ...prev, toPhone: event.target.value }))
                    }
                    placeholder="Recipient phone"
                  />
                ) : (
                  <input
                    value={transferForm.toUpiId}
                    onChange={event =>
                      setTransferForm(prev => ({ ...prev, toUpiId: event.target.value }))
                    }
                    placeholder="Recipient UPI ID (example@bank)"
                  />
                )}
              </div>
              <div className="wallet-inline-row">
                <input
                  value={transferForm.amount}
                  onChange={event =>
                    setTransferForm(prev => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="Amount"
                />
                <input
                  value={transferForm.note}
                  onChange={event =>
                    setTransferForm(prev => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="Note (optional)"
                />
                <button type="button" onClick={transferWalletBalance} disabled={transferBusy}>
                  {transferBusy ? "Transferring..." : "Send"}
                </button>
              </div>
            </div>
          )}
          {walletAction === "cards" && (
            <div className="wallet-inline-form">
              <div className="wallet-inline-info">
                Link cards or UPI IDs from Settings to unlock instant transfers.
              </div>
              <button type="button" onClick={() => setActiveTab("profile")}>
                Open Settings
              </button>
            </div>
          )}
        </div>

        <div className="wallet-section-title">Transactions</div>
        <div className="wallet-transactions-card">
          {transactions.map(tx => {
            const credit = isCreditTransaction(tx);
            const amountValue = Math.abs(resolveTransactionAmount(tx));
            return (
              <div key={tx.id || tx.reference_id || tx.created_at} className="wallet-transaction-row">
                <div className="wallet-transaction-left">
                  <span className={`wallet-transaction-icon ${credit ? "credit" : "debit"}`}>
                    {credit ? "↙" : "↗"}
                  </span>
                  <div className="wallet-transaction-info">
                    <strong>{resolveTransactionLabel(tx)}</strong>
                    <small>{resolveTransactionMeta(tx) || "Recent activity"}</small>
                  </div>
                </div>
                <div className={`wallet-transaction-amount ${credit ? "credit" : "debit"}`}>
                  {credit ? "+" : "-"}${formatMoney(amountValue)}
                </div>
              </div>
            );
          })}
          {!transactions.length && (
            <div className="wallet-empty">No transactions available yet.</div>
          )}
        </div>

        <details className="wallet-advanced">
          <summary>Advanced wallet tools</summary>
          <div className="wallet-advanced-grid">
            <div className="wallet-advanced-card">
              <h4>Receive Money</h4>
              <div className="wallet-receive-card">
                <small>Your UPI ID</small>
                <strong>
                  {receiveProfile?.upiId || userSettings?.payments?.upiId || "Set UPI ID in profile settings"}
                </strong>
                {!!receiveProfile?.qrCodeUrl && (
                  <img
                    src={receiveProfile.qrCodeUrl}
                    alt="Receive payment QR"
                    className="wallet-receive-qr"
                  />
                )}
                {!!receiveProfile?.upiUri && (
                  <small>
                    UPI URI: <code>{receiveProfile.upiUri}</code>
                  </small>
                )}
              </div>
            </div>
            <div className="wallet-advanced-card">
              <h4>Balances</h4>
              <div className="wallet-metric-grid">
                <div className="wallet-metric">
                  <span>Available</span>
                  <strong>${formatMoney(walletSummary?.availableBalance)}</strong>
                </div>
                <div className="wallet-metric">
                  <span>Locked</span>
                  <strong>${formatMoney(walletSummary?.lockedBalance)}</strong>
                </div>
                <div className="wallet-metric">
                  <span>Total Balance</span>
                  <strong>${formatMoney(walletSummary?.wallet?.balance)}</strong>
                </div>
                <div className="wallet-metric">
                  <span>Transactions</span>
                  <strong>{transactions.length}</strong>
                </div>
              </div>
            </div>
          </div>
        </details>
      </section>
    );
  }

  function renderSellerTab() {
    const shopIdValue = sellerForm.shopId || selectedShopId || selectedShop?.id || "";
    const sellerOrders = shopIdValue
      ? orders.filter(order => String(order.shopId || order.shop_id || order.shop?.id || "") === String(shopIdValue))
      : [];
    const totalProducts = sellerProducts.length;
    const categoryMap = sellerProducts.reduce((acc, product) => {
      const key = String(product.category || "General").trim() || "General";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topCategories = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const ordersToday = sellerOrders.filter(order => {
      const rawDate = order.created_at || order.createdAt || order.timestamp;
      if (!rawDate) return false;
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) return false;
      return isSameDay(parsed, new Date());
    }).length;
    const revenue = sellerOrders.reduce((sum, order) => {
      const amount = Number(order.totalAmount || order.total || order.amount || order.value || 0);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);
    const growth = (() => {
      const now = new Date();
      const startThisWeek = new Date(now);
      startThisWeek.setDate(now.getDate() - 7);
      const startPrevWeek = new Date(now);
      startPrevWeek.setDate(now.getDate() - 14);
      const thisWeek = sellerOrders.reduce((sum, order) => {
        const rawDate = order.created_at || order.createdAt || order.timestamp;
        if (!rawDate) return sum;
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) return sum;
        if (parsed < startThisWeek) return sum;
        const amount = Number(order.totalAmount || order.total || order.amount || order.value || 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
      const prevWeek = sellerOrders.reduce((sum, order) => {
        const rawDate = order.created_at || order.createdAt || order.timestamp;
        if (!rawDate) return sum;
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) return sum;
        if (parsed < startPrevWeek || parsed >= startThisWeek) return sum;
        const amount = Number(order.totalAmount || order.total || order.amount || order.value || 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
      if (prevWeek <= 0) return 0;
      return Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
    })();

    return (
      <section className="seller-shell">
        <div className="seller-header">
          <div>
            <h2>Seller Hub</h2>
            <p>Manage your products and orders</p>
          </div>
          <button type="button" className="seller-primary-btn" onClick={() => setSellerFormOpen(true)}>
            + Add Product
          </button>
        </div>

        <div className="seller-stats-grid">
          <div className="seller-stat-card">
            <span className="seller-stat-label">Total Products</span>
            <strong>{totalProducts}</strong>
          </div>
          <div className="seller-stat-card">
            <span className="seller-stat-label">Orders Today</span>
            <strong>{ordersToday}</strong>
          </div>
          <div className="seller-stat-card">
            <span className="seller-stat-label">Revenue</span>
            <strong>${toCurrency(revenue)}</strong>
          </div>
          <div className="seller-stat-card">
            <span className="seller-stat-label">Growth</span>
            <strong>{growth}%</strong>
          </div>
        </div>

        {topCategories.length > 0 && (
          <div className="seller-category-row">
            {topCategories.map(([label, count]) => (
              <span key={label} className="seller-category-chip">
                {titleCase(label)} ? {count}
              </span>
            ))}
          </div>
        )}

        <article className="panel-card seller-inventory-card">
          <div className="seller-table-head">
            <h3>Inventory</h3>
            <span>{sellerProducts.length} items</span>
          </div>
          <div className="seller-table">
            <div className="seller-table-row seller-table-header">
              <span>Product</span>
              <span>SKU</span>
              <span>Price</span>
              <span>Stock</span>
              <span>Status</span>
            </div>
            {sellerProducts.map(product => {
              const status = Number(product.availableQuantity || 0) <= 0
                ? "Out of Stock"
                : Number(product.availableQuantity || 0) <= 10
                  ? "Low Stock"
                  : "Active";
              const sku = product.sku || product.code || `SKU-${String(product.id).slice(-4)}`;
              return (
                <div key={product.id} className="seller-table-row">
                  <div className="seller-product-cell">
                    {(() => {
                      const imageSrc = resolveMediaUrl(product.imageUrl, mediaBaseUrl);
                      return imageSrc ? (
                        <img src={imageSrc} alt={product.name} className="seller-product-thumb" />
                      ) : (
                        <div className="seller-product-thumb placeholder">{initials(product.name)}</div>
                      );
                    })()}
                    <div>
                      <strong>{product.name}</strong>
                      <small>{product.category || "General"}</small>
                    </div>
                  </div>
                  <span>{sku}</span>
                  <span>${toCurrency(product.price)}</span>
                  <span>{product.availableQuantity}</span>
                  <span className={`seller-status ${status.replace(/\s+/g, "-").toLowerCase()}`}>{status}</span>
                </div>
              );
            })}
            {!sellerProducts.length && <div className="empty-line">No products loaded yet.</div>}
          </div>
        </article>

        {sellerFormOpen && (
          <article className="panel-card seller-form-card">
            <div className="seller-table-head">
              <h3>Add Product</h3>
              <button type="button" className="ghost-btn" onClick={() => setSellerFormOpen(false)}>
                Close
              </button>
            </div>
            <div className="field-row">
              <input
                value={shopLocationForm.lat}
                onChange={event => setShopLocationForm(prev => ({ ...prev, lat: event.target.value }))}
                placeholder="Shop latitude"
              />
              <input
                value={shopLocationForm.lng}
                onChange={event => setShopLocationForm(prev => ({ ...prev, lng: event.target.value }))}
                placeholder="Shop longitude"
              />
              <button type="button" onClick={updateShopLocation}>Update Location</button>
            </div>
            <div className="field-row">
              <input
                value={sellerForm.shopId}
                onChange={event => setSellerForm(prev => ({ ...prev, shopId: event.target.value }))}
                placeholder="Shop ID"
              />
              <button type="button" onClick={() => loadSellerProducts()}>Load Inventory</button>
            </div>
            <div className="field-row">
              <input
                value={sellerForm.name}
                onChange={event => setSellerForm(prev => ({ ...prev, name: event.target.value }))}
                placeholder="Product name"
              />
              <input
                value={sellerForm.company}
                onChange={event => setSellerForm(prev => ({ ...prev, company: event.target.value }))}
                placeholder="Company / Brand"
              />
              <input
                value={sellerForm.category}
                onChange={event => setSellerForm(prev => ({ ...prev, category: event.target.value }))}
                placeholder="Category"
              />
            </div>
            <div className="field-row">
              <input
                value={sellerForm.imageUrl}
                onChange={event => setSellerForm(prev => ({ ...prev, imageUrl: event.target.value }))}
                placeholder="Product image URL (optional)"
              />
            </div>
            <div className="field-row seller-image-row">
              <input type="file" accept="image/*" onChange={handleSellerImageSelection} disabled={sellerImageUploading} />
              <small>
                {sellerImageUploading
                  ? "Uploading image to media storage..."
                  : "Upload from device to auto-fill image URL."}
              </small>
            </div>
            {(() => {
              const imageSrc = resolveMediaUrl(sellerForm.imageUrl, mediaBaseUrl);
              return imageSrc ? (
                <div className="field-row">
                  <img
                    src={imageSrc}
                    alt="Product preview"
                    style={{ width: 140, height: 90, objectFit: "cover", borderRadius: 10 }}
                  />
                </div>
              ) : null;
            })()}
            <div className="field-row">
              <input
                value={sellerForm.description}
                onChange={event => setSellerForm(prev => ({ ...prev, description: event.target.value }))}
                placeholder="Product description"
              />
            </div>
            <div className="field-row">
              <input
                value={sellerForm.price}
                onChange={event => setSellerForm(prev => ({ ...prev, price: event.target.value }))}
                placeholder="Price"
              />
              <input
                value={sellerForm.quantity}
                onChange={event => setSellerForm(prev => ({ ...prev, quantity: event.target.value }))}
                placeholder="Quantity"
              />
              <button type="button" onClick={createSellerProduct}>Add Product</button>
            </div>
          </article>
        )}
      </section>
    );
  }
function renderOpsTab() {
    return (
      <section className="workspace-grid single">
        <article className="panel-card">
          <div className="header-row">
            <h2>Workflow Graph</h2>
            <input
              value={workflowId}
              onChange={event => setWorkflowId(event.target.value)}
              placeholder="Workflow ID"
            />
            <button type="button" onClick={runReconciliationNow}>Run Reconciliation</button>
          </div>
          <WorkflowGraph workflowId={workflowId} authToken={token} />
        </article>
      </section>
    );
  }

  function renderProfileTab() {
    return (
      <section className="workspace-grid single">
        <article className="panel-card">
          <h2>Account and Preferences</h2>
          <div className="stack-list">
            <div className="item-card">
              <div className="profile-head">
                <div className="profile-avatar-wrap">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" className="profile-avatar" />
                  ) : (
                    <div className="profile-avatar">{String(user.name || "U").slice(0, 1)}</div>
                  )}
                </div>
                <div>
                  <strong>{user.name}</strong>
                  <small>Phone: {user.phone}</small>
                  <small>Email: {user.email || "n/a"}</small>
                  <small>Roles: {userRoles.join(", ") || "CUSTOMER"}</small>
                </div>
              </div>
              <label>
                Profile Photo
                <input type="file" accept="image/*" onChange={handleProfilePhotoChange} />
              </label>
            </div>

            <div className="item-card">
              <strong>Payment Settings</strong>
              <div className="field-row">
                <input
                  value={userSettings.payments?.upiId || ""}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      payments: {
                        ...(prev.payments || {}),
                        upiId: event.target.value
                      }
                    }))
                  }
                  placeholder="Your UPI ID (example@bank)"
                />
              </div>
              <div className="field-row">
                <input
                  value={userSettings.payments?.autoTopupThreshold || ""}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      payments: {
                        ...(prev.payments || {}),
                        autoTopupThreshold: event.target.value
                      }
                    }))
                  }
                  placeholder="Auto topup threshold"
                />
                <input
                  value={userSettings.payments?.autoTopupAmount || ""}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      payments: {
                        ...(prev.payments || {}),
                        autoTopupAmount: event.target.value
                      }
                    }))
                  }
                  placeholder="Auto topup amount"
                />
              </div>
            </div>

            <div className="item-card">
              <strong>Notification Channels</strong>
              <div className="field-row">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.notifications?.inApp)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        notifications: {
                          ...(prev.notifications || {}),
                          inApp: event.target.checked
                        }
                      }))
                    }
                  />
                  In-App
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.notifications?.push)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        notifications: {
                          ...(prev.notifications || {}),
                          push: event.target.checked
                        }
                      }))
                    }
                  />
                  Push
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.notifications?.sms)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        notifications: {
                          ...(prev.notifications || {}),
                          sms: event.target.checked
                        }
                      }))
                    }
                  />
                  SMS
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.notifications?.email)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        notifications: {
                          ...(prev.notifications || {}),
                          email: event.target.checked
                        }
                      }))
                    }
                  />
                  Email
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.notifications?.orderAlerts)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        notifications: {
                          ...(prev.notifications || {}),
                          orderAlerts: event.target.checked
                        }
                      }))
                    }
                  />
                  Order Alerts
                </label>
              </div>
              <div className="field-row">
                <button type="button" onClick={requestBrowserPushPermission}>
                  Browser Push: {browserPushPermission}
                </button>
                <button type="button" onClick={sendNotificationTest}>Send Test Notification</button>
              </div>
            </div>

            <div className="item-card">
              <strong>Quiet Hours and Location</strong>
              <div className="field-row">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(notificationPrefs.quietHours?.enabled)}
                    onChange={event =>
                      setNotificationPrefs(prev => ({
                        ...prev,
                        quietHours: {
                          ...(prev.quietHours || {}),
                          enabled: event.target.checked
                        }
                      }))
                    }
                  />
                  Quiet Hours
                </label>
                <input
                  value={notificationPrefs.quietHours?.startHour ?? 22}
                  onChange={event =>
                    setNotificationPrefs(prev => ({
                      ...prev,
                      quietHours: {
                        ...(prev.quietHours || {}),
                        startHour: Number(event.target.value || 0)
                      }
                    }))
                  }
                  placeholder="Start hour (0-23)"
                />
                <input
                  value={notificationPrefs.quietHours?.endHour ?? 7}
                  onChange={event =>
                    setNotificationPrefs(prev => ({
                      ...prev,
                      quietHours: {
                        ...(prev.quietHours || {}),
                        endHour: Number(event.target.value || 0)
                      }
                    }))
                  }
                  placeholder="End hour (0-23)"
                />
              </div>
              <div className="field-row">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.location?.shareLiveLocation)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        location: {
                          ...(prev.location || {}),
                          shareLiveLocation: event.target.checked
                        }
                      }))
                    }
                  />
                  Share live location
                </label>
                <select
                  value={userSettings.location?.locationPrecision || "precise"}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      location: {
                        ...(prev.location || {}),
                        locationPrecision: event.target.value
                      }
                    }))
                  }
                >
                  <option value="precise">Precise</option>
                  <option value="approximate">Approximate</option>
                </select>
              </div>
            </div>

            <div className="item-card">
              <strong>Privacy, Security and Chat</strong>
              <div className="field-row">
                <select
                  value={userSettings.privacy?.lastSeenVisibility || "contacts"}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      privacy: {
                        ...(prev.privacy || {}),
                        lastSeenVisibility: event.target.value
                      }
                    }))
                  }
                >
                  <option value="everyone">Last seen: Everyone</option>
                  <option value="contacts">Last seen: Contacts</option>
                  <option value="nobody">Last seen: Nobody</option>
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.privacy?.readReceipts)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        privacy: {
                          ...(prev.privacy || {}),
                          readReceipts: event.target.checked
                        }
                      }))
                    }
                  />
                  Read receipts
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.security?.loginAlerts)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        security: {
                          ...(prev.security || {}),
                          loginAlerts: event.target.checked
                        }
                      }))
                    }
                  />
                  Login alerts
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(userSettings.chat?.enterToSend)}
                    onChange={event =>
                      setUserSettings(prev => ({
                        ...prev,
                        chat: {
                          ...(prev.chat || {}),
                          enterToSend: event.target.checked
                        }
                      }))
                    }
                  />
                  Enter to send
                </label>
              </div>
              <div className="field-row">
                <select
                  value={userSettings.chat?.defaultCallType || "video"}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      chat: {
                        ...(prev.chat || {}),
                        defaultCallType: event.target.value
                      }
                    }))
                  }
                >
                  <option value="video">Default call: Video</option>
                  <option value="audio">Default call: Audio</option>
                </select>
                <select
                  value={userSettings.chat?.autoDownloadMedia || "wifi"}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      chat: {
                        ...(prev.chat || {}),
                        autoDownloadMedia: event.target.value
                      }
                    }))
                  }
                >
                  <option value="always">Auto-download: Always</option>
                  <option value="wifi">Auto-download: Wifi only</option>
                  <option value="never">Auto-download: Never</option>
                </select>
                <input
                  value={userSettings.security?.sessionTimeoutMinutes || 120}
                  onChange={event =>
                    setUserSettings(prev => ({
                      ...prev,
                      security: {
                        ...(prev.security || {}),
                        sessionTimeoutMinutes: Number(event.target.value || 0)
                      }
                    }))
                  }
                  placeholder="Session timeout minutes"
                />
              </div>
            </div>

            <div className="field-row">
              <button type="button" onClick={saveUserSettings}>Save Profile Settings</button>
              <button type="button" onClick={saveNotificationPreferences}>Save Notification Rules</button>
              <button type="button" className="danger" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
        </article>
      </section>
    );
  }

  function renderTab() {
    if (activeTab === "home") return renderHomeTab();
    if (activeTab === "chat") return renderChatTab();
    if (activeTab === "marketplace") return renderMarketplaceTab();
    if (activeTab === "services") return renderServicesTab();
    if (activeTab === "orders") return renderOrdersTab();
    if (activeTab === "wallet") return renderWalletTab();
    if (activeTab === "seller") return renderSellerTab();
    if (activeTab === "ops") return renderOpsTab();
    return renderProfileTab();
  }

  function handleTabSelect(tabId) {
    setActiveTab(tabId);
    setSidebarOpen(false);
  }

  const suppressGlobalHeader = activeTab === "chat"
    || (activeTab === "marketplace" && marketplaceView !== "catalog");
  const breadcrumbLabel = activeTab === "home" ? "Overview" : activeTabMeta.title;

  const handleGlobalSearchChange = event => {
    const value = event.target.value;
    setCommandQuery(value);
    if (!commandOpen) {
      setCommandOpen(true);
    }
  };

  return (
    <div className={`superapp-shell superapp-shell-full superapp-shell-v5 shell-${activeTab} ${sidebarOpen ? "sidebar-open" : ""}`}>
      <aside className={`sidebar-v5 ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img className="brand-mark" src="/lh-logo.svg" alt="LifeHub logo" />
          <strong>LifeHub</strong>
        </div>
        <div className="sidebar-search">
          <UiIcon name="search" />
          <input
            value={moduleSearch}
            onChange={event => setModuleSearch(event.target.value)}
            placeholder="Search services"
          />
        </div>
        <div className="sidebar-groups">
          {moduleGroups.map(group => (
            <div key={group.id} className="sidebar-group">
              <span className="sidebar-group-title">{group.label.toUpperCase()}</span>
              <div className="sidebar-links">
                {group.id === "core" && (
                  <>
                    <button type="button" className="sidebar-link" onClick={() => setCommandOpen(true)}>
                      <UiIcon name="search" />
                      Search
                    </button>
                    <button type="button" className="sidebar-link" onClick={() => handleTabSelect("home")}>
                      <UiIcon name="bell" />
                      Notifications
                    </button>
                  </>
                )}
              {group.items.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`sidebar-link ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => handleTabSelect(tab.id)}
                >
                  <UiIcon name={tabIconName(tab.id)} />
                  {tab.label}
                </button>
              ))}
              {group.id === "account" && (
                <button
                  type="button"
                  className="sidebar-link"
                  onClick={() => handleTabSelect("profile")}
                >
                  <UiIcon name="shield" />
                  Security
                </button>
              )}
            </div>
          </div>
        ))}
          {moduleGroups.length === 1 && moduleGroups[0].id === "results" && !moduleGroups[0].items.length && (
            <div className="module-empty">No services match that search.</div>
          )}
        </div>
        <div className="sidebar-foot">
          <span>{loading ? "Syncing workspace" : "Live"}</span>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="content-stack">
        <header className="topbar-v5">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle navigation"
            onClick={() => setSidebarOpen(prev => !prev)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="breadcrumb">
            <span>Dashboard</span>
            <span>/</span>
            <strong>{breadcrumbLabel}</strong>
          </div>
          <div className="topbar-search" onClick={() => setCommandOpen(true)}>
            <UiIcon name="search" />
            <input
              value={commandQuery}
              onChange={handleGlobalSearchChange}
              onFocus={() => setCommandOpen(true)}
              placeholder="Search anything..."
            />
            <span className="topbar-hotkey">⌘ K</span>
          </div>
          <div className="topbar-actions">
            <button type="button" className="icon-btn badge-btn" onClick={() => handleTabSelect("home")}>
              <UiIcon name="bell" />
              {notifications.length > 0 && (
                <span className="mini-badge">{notifications.length > 99 ? "99+" : notifications.length}</span>
              )}
            </button>
            <div className="topbar-avatar">
              {String(user.name || "A").slice(0, 1)}
            </div>
          </div>
        </header>

        <main className="main-stage main-stage-full">
          {!suppressGlobalHeader && (
            <div className={`page-intro ${activeTab === "home" ? "hero" : "compact"}`}>
              <h1>{activeTabMeta.title}</h1>
              <p>{activeTabMeta.description}</p>
            </div>
          )}

          {error && <div className="alert danger">{error}</div>}
          {toast && <div className="alert info">{toast}</div>}
          {renderTab()}
        </main>
      </div>

      {commandOpen && (
        <div className="command-overlay" onClick={() => setCommandOpen(false)}>
          <div className="command-modal" onClick={event => event.stopPropagation()}>
            <div className="command-header">
              <div>
                <strong>Command Center</strong>
                <small>Jump to any module or action instantly.</small>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setCommandOpen(false)}>
                Close
              </button>
            </div>
            <div className="command-search">
              <UiIcon name="search" />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={event => setCommandQuery(event.target.value)}
                placeholder="Search commands, modules, or actions"
              />
              <span className="command-hint">Ctrl+K</span>
            </div>
            <div className="command-list">
              {commandResults.map(action => (
                <button
                  key={action.id}
                  type="button"
                  className="command-item"
                  onClick={() => {
                    action.run();
                    setCommandOpen(false);
                    setCommandQuery("");
                  }}
                >
                  <span className="command-item-main">
                    <strong>{action.label}</strong>
                    <small>{action.hint}</small>
                  </span>
                  <span className="command-item-meta">Open</span>
                </button>
              ))}
              {!commandResults.length && (
                <div className="command-empty">
                  No matches. Try searching for "chat", "orders", or "wallet".
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
