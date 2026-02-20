import { useEffect, useMemo, useRef, useState } from "react";
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
    case "settings":
      nodes = (
        <>
          <circle cx="12" cy="12" r="3" {...style} />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.2a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.2a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.2a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" {...style} />
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
    if (canAccess.services) available.push({ id: "services", label: "Services" });
    if (canAccess.orders) available.push({ id: "orders", label: "Orders" });
    if (canAccess.seller) available.push({ id: "seller", label: "Seller Hub" });
    if (canAccess.wallet) available.push({ id: "wallet", label: "Wallet" });
    if (canAccess.ops) available.push({ id: "ops", label: "Ops" });
    if (canAccess.profile) available.push({ id: "profile", label: "Profile" });
    return available;
  }, [canAccess]);

  const [activeTab, setActiveTab] = useState("home");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [home, setHome] = useState(null);

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
  const [productSearchFilters, setProductSearchFilters] = useState({
    maxPrice: "",
    minShopRating: "0",
    sortBy: "fair"
  });
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
  const [cart, setCart] = useState([]);

  const [providerSkill, setProviderSkill] = useState("plumber");
  const [serviceFilters, setServiceFilters] = useState({
    lat: "28.6139",
    lng: "77.2090",
    radiusKm: "8"
  });
  const [providers, setProviders] = useState([]);
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
  const [checkoutMode, setCheckoutMode] = useState("RAZORPAY");
  const [pendingOrderAfterPayment, setPendingOrderAfterPayment] = useState(false);
  const [deliveryOtpInput, setDeliveryOtpInput] = useState("");
  const [deliveryRating, setDeliveryRating] = useState("5");
  const [deliveryFeedback, setDeliveryFeedback] = useState("");

  const [sellerForm, setSellerForm] = useState({
    shopId: "1",
    name: "",
    company: "",
    description: "",
    imageUrl: "",
    category: "",
    price: "",
    quantity: ""
  });
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

  const selectedThread = useMemo(
    () => conversations.find(conv => String(conv.id) === String(selectedConversationId)) || null,
    [conversations, selectedConversationId]
  );

  const filteredConversations = useMemo(() => {
    if (!chatSearch.trim()) return conversations;
    return conversations.filter(conv =>
      [
        conv.id,
        conv?.peers?.[0]?.name,
        conv?.peers?.[0]?.phone
      ]
        .filter(Boolean)
        .some(value =>
          String(value).toLowerCase().includes(chatSearch.trim().toLowerCase())
        )
    );
  }, [conversations, chatSearch]);
  const totalUnreadChats = useMemo(
    () => conversations.reduce((sum, conv) => sum + Number(conv.unreadCount || 0), 0),
    [conversations]
  );
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
    if (!threadSearch.trim()) return messages;
    const needle = threadSearch.trim().toLowerCase();
    return messages.filter(message =>
      String(message.content || "").toLowerCase().includes(needle)
    );
  }, [messages, threadSearch]);
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

    const uploadRes = await fetch(init.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    if (!uploadRes.ok) {
      throw new Error(`Attachment upload failed: ${uploadRes.status}`);
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
      sortBy: "fair",
      limit: "30"
    });
    const data = await api(`/marketplace/shops/search?${query}`);
    setShops(data.shops || []);
  }

  async function loadShopProducts(shopId) {
    if (!shopId) return;
    const data = await api(`/marketplace/shops/${shopId}/products?limit=100`);
    setSelectedShopId(String(shopId));
    setShopProducts(data.products || []);
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

  async function placeOrder() {
    if (!selectedShopId || !cart.length) return;
    try {
      await api("/orders", {
        method: "POST",
        headers: { "x-idempotency-key": `order_${Date.now()}` },
        body: JSON.stringify({
          shopId: selectedShopId,
          total: Number(cartTotal.toFixed(2)),
          items: cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          }))
        })
      });
      setCart([]);
      await Promise.all([loadHome(), loadOrders()]);
    } catch (err) {
      setError(`${err.message || "Order failed"}. You can top up wallet and retry.`);
      setActiveTab("wallet");
    }
  }

  async function proceedCheckout() {
    try {
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
    const mine = rows.find(item => String(item.userId) === String(user.id));
    if (mine?.id) {
      setMyProviderProfileId(String(mine.id));
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
    const [summary, txRows] = await Promise.all([
      api("/transactions/wallet"),
      api("/transactions?limit=50")
    ]);
    setWalletSummary(summary);
    setTransactions(txRows.transactions || []);
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
    const data = await api("/notifications/me?limit=30");
    const rows = data.notifications || [];
    setNotifications(rows);

    const incoming = rows
      .map(item => String(item.id))
      .filter(id => !seenMessageIds.has(id));
    if (incoming.length) {
      const next = new Set([...seenMessageIds, ...incoming]);
      setSeenMessageIds(next);
      localStorage.setItem(seenStoreKey, JSON.stringify([...next]));
      const latest = rows[0];
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
    await api(`/marketplace/shops/${sellerForm.shopId}/products`, {
      method: "POST",
      body: JSON.stringify({
        name: sellerForm.name,
        company: sellerForm.company,
        description: sellerForm.description,
        imageUrl: sellerForm.imageUrl,
        category: sellerForm.category,
        price: Number(sellerForm.price || 0),
        quantity: Number(sellerForm.quantity || 0)
      })
    });
    setSellerForm(prev => ({
      ...prev,
      name: "",
      company: "",
      description: "",
      imageUrl: "",
      category: "",
      price: "",
      quantity: ""
    }));
    await loadSellerProducts();
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
    const handle = setTimeout(() => {
      searchProductsNearby(productQuery).catch(() => {});
    }, 350);
    return () => clearTimeout(handle);
  }, [
    productQuery,
    shopFilters.lat,
    shopFilters.lng,
    shopFilters.radiusKm,
    productSearchFilters.maxPrice,
    productSearchFilters.minShopRating,
    productSearchFilters.sortBy
  ]);

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
      <section className="workspace-grid">
        <article className="panel-card">
          <h2>Welcome to LifeHub</h2>
          <p className="info-line">
            Use Home as your landing screen. Open Chat only when you want to read messages.
          </p>
          <div className="field-row">
            <button onClick={() => setActiveTab("chat")}>Open Chats</button>
            <button onClick={() => setActiveTab("marketplace")}>Explore Grocery</button>
            <button onClick={() => setActiveTab("services")}>Book Services</button>
          </div>
        </article>
        <article className="panel-card">
          <h2>Live Snapshot</h2>
          <div className="metric-grid">
            <div className="metric-card">
              <h3>Orders</h3>
              <strong>{orders.length}</strong>
            </div>
            <div className="metric-card">
              <h3>Chats</h3>
              <strong>{conversations.length}</strong>
            </div>
            <div className="metric-card">
              <h3>Providers</h3>
              <strong>{providers.length}</strong>
            </div>
            <div className="metric-card">
              <h3>Shops</h3>
              <strong>{shops.length}</strong>
            </div>
            <div className="metric-card">
              <h3>Notifications</h3>
              <strong>{notifications.length}</strong>
            </div>
          </div>
          <div className="stack-list compact">
            {(notifications || []).slice(0, 5).map(item => (
              <div key={item.id} className="item-card compact">
                <strong>{item.event_type}</strong>
                <small>{formatClock(item.created_at)}</small>
              </div>
            ))}
          </div>
        </article>
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
      <section className="chat-shell">
        <aside className="chat-nav-rail">
          <div className="chat-nav-top">
            <button className="rail-item active" type="button" title="Chats">
              <UiIcon name="chat" />
              {totalUnreadChats > 0 && <span className="rail-badge">{totalUnreadChats}</span>}
            </button>
            <button
              className="rail-item"
              type="button"
              title="Notifications"
              onClick={() => setActiveTab("home")}
            >
              <UiIcon name="bell" />
              {notifications.length > 0 && <span className="rail-badge">{notifications.length}</span>}
            </button>
            <button
              className="rail-item"
              type="button"
              title="Grocery marketplace"
              onClick={() => setActiveTab("marketplace")}
            >
              <UiIcon name="cart" />
            </button>
            <button
              className="rail-item"
              type="button"
              title="Service providers"
              onClick={() => setActiveTab("services")}
            >
              <UiIcon name="tool" />
            </button>
          </div>
          <div className="chat-nav-bottom">
            <button
              className="rail-item"
              type="button"
              title="Settings"
              onClick={() => setActiveTab("profile")}
            >
              <UiIcon name="settings" />
            </button>
            <button
              className="rail-item"
              type="button"
              title="My profile"
              onClick={() => setActiveTab("profile")}
            >
              <UiIcon name="user" />
            </button>
          </div>
        </aside>

        <div className="chat-layout">
          <aside className="chat-sidebar">
            <div className="chat-sidebar-head">
              <h2>Chats</h2>
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
                placeholder="Search or start a new chat"
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
                      {initials(conv?.peers?.[0]?.name || conv?.peers?.[0]?.phone || "C")}
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

          <article className="chat-thread">
            <div className="chat-thread-head">
              <div className="thread-peer">
                <div className="chat-avatar large">
                  {initials(activePeer?.name || activePeer?.phone || "C")}
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
                <div className="messages-panel">
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

                <div className="composer">
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
    return (
      <section className="workspace-grid">
        <article className="panel-card">
          <h2>Nearby Grocery Stores</h2>
          <div className="field-row">
            <input
              value={productQuery}
              onChange={event => setProductQuery(event.target.value)}
              placeholder="Search item like Amazon/Flipkart (debounced)"
            />
          </div>
          <div className="field-row">
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
              placeholder="Min rating (0-5)"
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
          {!!productQuery.trim() && (
            <div className="stack-list compact">
              {searchingProducts && <div className="empty-line">Searching nearby inventory...</div>}
              {!searchingProducts && !!productSearchError && (
                <div className="empty-line">{productSearchError}</div>
              )}
              {!searchingProducts &&
                productResults.map(item => (
                  <button
                    key={`${item?.shop?.id || "shop"}-${item.productId}`}
                    className="item-card button-like"
                    onClick={async () => {
                      setSelectedShopId(String(item.shop.id));
                      await loadShopProducts(item.shop.id);
                    }}
                    disabled={!item?.shop?.id}
                  >
                    <strong>{item.productName}</strong>
                    <small>
                      {(item.company ? `${item.company} | ` : "")}
                      {item?.shop?.shopName || "Unknown shop"} | {toCurrency(item.price)} | Qty {item.availableQuantity} |{" "}
                      {item.distanceKm !== null && item.distanceKm !== undefined ? `${item.distanceKm.toFixed(1)} km` : "distance n/a"}
                    </small>
                    <small>
                      Shop rating {Number(item?.shop?.rating || 0).toFixed(1)} | Reliability {Number(item?.shop?.reliabilityScore || 0).toFixed(1)} | Reviews {item?.shop?.feedbackCount || 0}
                    </small>
                  </button>
                ))}
              {!searchingProducts && !productSearchError && !productResults.length && (
                <div className="empty-line">No nearby shops found for this item.</div>
              )}
            </div>
          )}
          <div className="field-row">
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
              placeholder="Radius KM"
            />
            <button onClick={searchShops}>Search</button>
          </div>
          <div className="stack-list">
            {shops.map(shop => (
              <button
                key={shop.id}
                className={`item-card button-like ${
                  String(shop.id) === String(selectedShopId) ? "active" : ""
                }`}
                onClick={() => loadShopProducts(shop.id)}
              >
                <strong>{shop.shopName}</strong>
                <small>
                  {shop.address} | {shop.distanceKm !== null && shop.distanceKm !== undefined ? `${shop.distanceKm.toFixed(1)} km` : "Distance n/a"} |
                  Rating {shop.rating || "n/a"} | Reliability {Number(shop.reliabilityScore || 0).toFixed(1)} | Reviews {shop.feedbackCount || 0}
                </small>
                <small>
                  {shop.openNow ? "Open now" : "Closed now"}{" "}
                  {shop.location?.lat && shop.location?.lng ? (
                    <a
                      href={`https://www.google.com/maps?q=${shop.location.lat},${shop.location.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Maps
                    </a>
                  ) : null}
                </small>
              </button>
            ))}
            {!shops.length && <div className="empty-line">No shops loaded yet.</div>}
          </div>
        </article>

        <article className="panel-card">
          <h2>Products and Quick Cart</h2>
          <div className="stack-list">
            {shopProducts.map(product => (
              <div key={product.id} className="item-card">
                {!!product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 10 }}
                  />
                )}
                <div className="item-header">
                  <strong>{product.name}</strong>
                  <span className="status-pill">Qty {product.availableQuantity}</span>
                </div>
                <small>
                  {(product.company ? `Company: ${product.company} | ` : "")}
                  Price: {toCurrency(product.price)} | Category: {product.category || "general"}
                </small>
                {!!product.description && <small>{product.description}</small>}
                <button onClick={() => addToCart(product)}>Add to Cart</button>
              </div>
            ))}
            {!shopProducts.length && (
              <div className="empty-line">Select a shop to view products and prices.</div>
            )}
          </div>

          <div className="divider" />
          <h3>Cart</h3>
          <div className="stack-list compact">
            {cart.map(item => (
              <div key={item.productId} className="item-card compact">
                <strong>{item.name}</strong>
                <small>Unit: {toCurrency(item.price)}</small>
                <div className="field-row">
                  <input
                    value={item.quantity}
                    onChange={event => updateCartQuantity(item.productId, event.target.value)}
                    placeholder="Qty"
                  />
                </div>
              </div>
            ))}
            {!cart.length && <div className="empty-line">Your cart is empty.</div>}
          </div>
          <div className="field-row">
            <strong>Total: {toCurrency(cartTotal)}</strong>
            <select value={checkoutMode} onChange={event => setCheckoutMode(event.target.value)}>
              <option value="RAZORPAY">Razorpay Checkout</option>
              <option value="WALLET">Wallet Balance</option>
            </select>
            <button onClick={proceedCheckout} disabled={!cart.length || !selectedShopId}>
              Proceed Payment
            </button>
          </div>
        </article>
      </section>
    );
  }

  function renderServicesTab() {
    return (
      <section className="workspace-grid">
        <article className="panel-card">
          <h2>Nearby Service Providers</h2>
          {(hasRole("PROVIDER") || hasRole("ADMIN")) && (
            <div className="field-row">
              <input
                value={providerLocationForm.lat}
                onChange={event =>
                  setProviderLocationForm(prev => ({ ...prev, lat: event.target.value }))
                }
                placeholder="My lat"
              />
              <input
                value={providerLocationForm.lng}
                onChange={event =>
                  setProviderLocationForm(prev => ({ ...prev, lng: event.target.value }))
                }
                placeholder="My lng"
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
              <button onClick={updateMyProviderLocation}>Update My Location</button>
            </div>
          )}
          <div className="field-row">
            <button type="button" onClick={useCurrentLocation}>
              Use Current Location
            </button>
            <input
              value={providerSkill}
              onChange={event => setProviderSkill(event.target.value)}
              placeholder="plumber / electrician / technician"
            />
            <button onClick={loadProviders}>Search</button>
          </div>
          <div className="field-row">
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
          </div>
          <div className="stack-list">
            {providers.map(provider => (
              <button
                key={provider.id}
                className="item-card button-like"
                onClick={() =>
                  setServiceForm(prev => ({
                    ...prev,
                    serviceType: provider.skills?.[0] || providerSkill,
                    preferredProviderId: String(provider.id)
                  }))
                }
              >
                <strong>{provider.name}</strong>
                <small>
                  Skills: {(provider.skills || []).join(", ")} | Rating {provider.rating || "n/a"}
                </small>
                <small>
                  {provider.available ? "Available" : "Unavailable"} |{" "}
                  {provider.distanceKm !== null && provider.distanceKm !== undefined ? `${provider.distanceKm.toFixed(1)} km` : "distance n/a"}{" "}
                  {provider.location?.lat && provider.location?.lng ? (
                    <a
                      href={`https://www.google.com/maps?q=${provider.location.lat},${provider.location.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Maps
                    </a>
                  ) : null}
                </small>
              </button>
            ))}
            {!providers.length && <div className="empty-line">No providers loaded yet.</div>}
          </div>
        </article>

        <article className="panel-card">
          <h2>Book Service Request</h2>
          {canCreateServiceRequest ? (
            <>
              <div className="field-row">
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
              </div>
              <div className="field-row">
                <input
                  value={serviceForm.description}
                  onChange={event =>
                    setServiceForm(prev => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Describe issue and location details"
                />
                <button onClick={createServiceRequest}>Book</button>
              </div>
            </>
          ) : (
            <div className="info-line">You can track and complete assigned service requests in this view.</div>
          )}

          <div className="stack-list">
            {serviceRequests.map(request => (
              <div key={request.id} className="item-card">
                <div className="item-header">
                  <strong>#{request.id} | {request.service_type}</strong>
                  <span className="status-pill">{request.status}</span>
                </div>
                <small>{request.description || "No description"}</small>
                <div className="item-actions">
                  {canCompleteServiceRequest && (
                    <button onClick={() => completeServiceRequest(request.id)}>Complete</button>
                  )}
                  {canCancelServiceRequest && (
                    <button className="danger" onClick={() => cancelServiceRequest(request.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!serviceRequests.length && <div className="empty-line">No service requests yet.</div>}
          </div>
        </article>
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
                      <button onClick={() => startDelivery(order.id)}>Start Delivery</button>
                      <button onClick={() => sendDeliveryOtp(order.id)}>Send OTP</button>
                    </>
                  )}
                  {(hasRole("SHOPKEEPER") || hasRole("ADMIN") || hasRole("BUSINESS")) && (
                    <button onClick={() => payoutShopkeeper(order.id)}>Payout</button>
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
                      <button onClick={() => confirmDelivery(order.id)}>Confirm Delivery</button>
                      <button onClick={() => requestRefund(order.id)}>Refund</button>
                    </>
                  )}
                  <button
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
    return (
      <section className="workspace-grid">
        <article className="panel-card">
          <h2>Wallet and Payments</h2>
          <div className="field-row">
            <button onClick={loadWallet}>Refresh</button>
            <input
              value={topupAmount}
              onChange={event => setTopupAmount(event.target.value)}
              placeholder="Topup amount"
            />
            <button onClick={topupWallet}>Topup via Razorpay</button>
          </div>
          {paymentIntent && (
            <div className="item-card">
              <strong>Gateway Intent</strong>
              <small>Intent: {paymentIntent.intentId}</small>
              <small>Provider: {paymentIntent.provider}</small>
              {paymentIntent.checkout?.provider === "RAZORPAY" && (
                <small>Order ID: {paymentIntent.checkout.orderId}</small>
              )}
              {paymentIntent.checkout?.provider === "STRIPE" && (
                <small>PaymentIntent: {paymentIntent.checkout.paymentIntentId}</small>
              )}
              <small>
                Configure gateway webhook to:
                {" "}
                <code>{`${API_URL.replace("/api", "")}/api/payments/webhooks/${String(paymentIntent.provider || "").toLowerCase()}`}</code>
              </small>
            </div>
          )}
          <div className="metric-grid wide">
            <div className="metric-card">
              <h3>Available</h3>
              <strong>{toCurrency(walletSummary?.availableBalance)}</strong>
            </div>
            <div className="metric-card">
              <h3>Locked</h3>
              <strong>{toCurrency(walletSummary?.lockedBalance)}</strong>
            </div>
            <div className="metric-card">
              <h3>Balance</h3>
              <strong>{toCurrency(walletSummary?.wallet?.balance)}</strong>
            </div>
            <div className="metric-card">
              <h3>Transactions</h3>
              <strong>{transactions.length}</strong>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <h2>Recent Transactions</h2>
          <div className="stack-list">
            {transactions.map(tx => (
              <div key={tx.id} className="item-card">
                <div className="item-header">
                  <strong>{tx.transaction_type}</strong>
                  <span className="status-pill">{tx.status}</span>
                </div>
                <small>
                  Amount {toCurrency(tx.amount)} | Ref {tx.reference_id || "n/a"}
                </small>
              </div>
            ))}
            {!transactions.length && <div className="empty-line">No transactions available.</div>}
          </div>
        </article>
      </section>
    );
  }

  function renderSellerTab() {
    return (
      <section className="workspace-grid">
        <article className="panel-card">
          <h2>Add Grocery Product</h2>
          <div className="field-row">
            <input
              value={shopLocationForm.lat}
              onChange={event =>
                setShopLocationForm(prev => ({ ...prev, lat: event.target.value }))
              }
              placeholder="Shop lat"
            />
            <input
              value={shopLocationForm.lng}
              onChange={event =>
                setShopLocationForm(prev => ({ ...prev, lng: event.target.value }))
              }
              placeholder="Shop lng"
            />
            <button onClick={updateShopLocation}>Update Shop Location</button>
          </div>
          <div className="field-row">
            <input
              value={sellerForm.shopId}
              onChange={event => setSellerForm(prev => ({ ...prev, shopId: event.target.value }))}
              placeholder="Shop ID"
            />
            <button onClick={() => loadSellerProducts()}>Load Inventory</button>
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
              placeholder="Product image URL"
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleSellerImageSelection}
            />
            <small>{sellerImageUploading ? "Uploading..." : "Pick image file to upload"}</small>
          </div>
          {!!sellerForm.imageUrl && (
            <div className="field-row">
              <img
                src={sellerForm.imageUrl}
                alt="Product preview"
                style={{ width: 140, height: 90, objectFit: "cover", borderRadius: 10 }}
              />
            </div>
          )}
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
            <button onClick={createSellerProduct}>Add Product</button>
          </div>
        </article>

        <article className="panel-card">
          <h2>Inventory</h2>
          <div className="stack-list">
            {sellerProducts.map(product => (
              <div key={product.id} className="item-card">
                {!!product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 10 }}
                  />
                )}
                <div className="item-header">
                  <strong>{product.name}</strong>
                  <span className="status-pill">Qty {product.availableQuantity}</span>
                </div>
                <small>
                  {(product.company ? `Company ${product.company} | ` : "")}
                  Price {toCurrency(product.price)} | Category {product.category || "general"}
                </small>
                {!!product.description && <small>{product.description}</small>}
                <div className="field-row">
                  <input
                    placeholder="New quantity"
                    onBlur={event => {
                      if (!event.target.value) return;
                      updateSellerQuantity(product.id, event.target.value);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
            ))}
            {!sellerProducts.length && <div className="empty-line">No products loaded.</div>}
          </div>
        </article>
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
            <button onClick={runReconciliationNow}>Run Reconciliation</button>
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
              <button className="danger" onClick={onLogout}>
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

  return (
    <div className="superapp-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">LH</div>
          <div>
            <h2>LifeHub</h2>
            <p>{roleLabel(userRoles)} Workspace</p>
          </div>
        </div>
        <nav className="side-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div>
            <h3>Hi, {user.name}</h3>
            <p>
              Persistent chats, fair wallet transactions, nearby marketplace, and role-aware workflows.
            </p>
          </div>
          <div className="topbar-avatar">
            {profilePhoto ? (
              <img src={profilePhoto} alt="Profile" className="profile-avatar" />
            ) : (
              <div className="profile-avatar">{String(user.name || "U").slice(0, 1)}</div>
            )}
          </div>
          <div className="chip-row">
            <button type="button" className="chip chip-button" onClick={() => setActiveTab("home")}>
              Notifications: {notifications.length}
            </button>
            <span className="chip">Role: {roleLabel(userRoles)}</span>
            <span className="chip chip-live">
              {loading ? "Loading data..." : "Live session"}
            </span>
          </div>
        </header>

        {error && <div className="alert danger">{error}</div>}
        {toast && <div className="alert info">{toast}</div>}
        {renderTab()}
      </main>
    </div>
  );
}
