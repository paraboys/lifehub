import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(value) {
  const text = String(value || "").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || "").join("") || "?";
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

export function TypingIndicator({ names }) {
  if (!names?.length) return null;
  const label = names.length === 1
    ? `${names[0]} is typing`
    : `${names.slice(0, 2).join(", ")} are typing`;

  return (
    <div className="chat-typing-indicator">
      <span className="chat-typing-dots">
        <span />
        <span />
        <span />
      </span>
      <small className="chat-typing-label">{label}</small>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export function MessageBubble({ message, isSelf, showAvatar, peerName }) {
  const text = message?.text || message?.content || message?.message || "";
  const time = formatTime(message?.createdAt || message?.created_at || message?.timestamp);
  const status = String(message?.status || message?.deliveryStatus || "SENT").toUpperCase();

  function DeliveryTick() {
    if (!isSelf) return null;
    if (status === "READ") return <span className="chat-tick read" title="Seen">✓✓</span>;
    if (status === "DELIVERED") return <span className="chat-tick delivered" title="Delivered">✓✓</span>;
    return <span className="chat-tick sent" title="Sent">✓</span>;
  }

  const attachments = message?.attachments || [];

  return (
    <div className={`chat-bubble-row ${isSelf ? "self" : "peer"}`}>
      {!isSelf && showAvatar && (
        <div className="chat-bubble-avatar" title={peerName}>
          {initials(peerName)}
        </div>
      )}
      {!isSelf && !showAvatar && <div className="chat-bubble-avatar-spacer" />}

      <div className={`chat-bubble ${isSelf ? "chat-bubble-sent" : "chat-bubble-received"}`}>
        {attachments.map((att, i) => {
          const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileUrl || "");
          if (isImage) {
            return (
              <a key={i} href={att.fileUrl} target="_blank" rel="noreferrer" className="chat-bubble-attachment-img-link">
                <img src={att.fileUrl} alt={att.fileName || "Attachment"} className="chat-bubble-attachment-img" />
              </a>
            );
          }
          return (
            <a key={i} href={att.fileUrl} target="_blank" rel="noreferrer" className="chat-bubble-attachment-file">
              📎 {att.fileName || "File"}
            </a>
          );
        })}
        {text && <p className="chat-bubble-text">{text}</p>}
        <div className="chat-bubble-meta">
          <span className="chat-bubble-time">{time}</span>
          <DeliveryTick />
        </div>
      </div>
    </div>
  );
}

// ─── AddContactModal ──────────────────────────────────────────────────────────

export function AddContactModal({
  open,
  onClose,
  onSearchUsers,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  incomingRequests,
  outgoingRequests,
  contacts
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activeTab, setActiveTab] = useState("search"); // "search" | "requests"
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open) {
      setQuery("");
      setResults([]);
      setSearchError("");
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const found = await onSearchUsers?.(query.trim());
        setResults(found || []);
      } catch (err) {
        setSearchError(err.message || "Search failed. Try again.");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const contactPhones = new Set((contacts || []).map(c => c.phone));
  const outgoingPhones = new Set((outgoingRequests || []).map(r => r.phone || r.receiverPhone));

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="chat-add-contact-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="chat-add-contact-modal"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
          >
            <div className="chat-modal-header">
              <strong>Add Contact</strong>
              <button type="button" className="chat-modal-close-btn" onClick={onClose}>✕</button>
            </div>

        <div className="chat-modal-tabs">
          <button
            type="button"
            className={`chat-modal-tab ${activeTab === "search" ? "active" : ""}`}
            onClick={() => setActiveTab("search")}
          >
            Search Users
          </button>
          <button
            type="button"
            className={`chat-modal-tab ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => setActiveTab("requests")}
          >
            Requests
            {incomingRequests?.length > 0 && (
              <span className="chat-modal-tab-badge">{incomingRequests.length}</span>
            )}
          </button>
        </div>

        {activeTab === "search" && (
          <div className="chat-modal-search-body">
            <div className="chat-modal-search-wrap">
              <span className="chat-modal-search-icon">🔍</span>
              <input
                ref={inputRef}
                type="text"
                className="chat-modal-input"
                placeholder="Search by name or phone..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {searching && <span className="chat-modal-spin">⟳</span>}
            </div>

            {searchError && <p className="chat-modal-error">{searchError}</p>}

            <div className="chat-modal-results">
              {results.map(user => {
                const phone = user.phone;
                const isContact = contactPhones.has(phone);
                const requestSent = outgoingPhones.has(phone);
                return (
                  <div key={user.id} className="chat-modal-result-item">
                    <div className="chat-modal-result-avatar">
                      {initials(user.name)}
                    </div>
                    <div className="chat-modal-result-info">
                      <strong>{user.name || "User"}</strong>
                      <small>{phone}</small>
                    </div>
                    {isContact ? (
                      <span className="chat-modal-result-status contact">✓ Contact</span>
                    ) : requestSent ? (
                      <span className="chat-modal-result-status pending">Requested</span>
                    ) : (
                      <button
                        type="button"
                        className="chat-modal-add-btn"
                        onClick={() => onSendRequest?.(phone)}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
              {!results.length && !searching && query.trim() && (
                <p className="chat-modal-no-results">No users found for "{query}"</p>
              )}
              {!query.trim() && (
                <p className="chat-modal-hint">Search for a LifeHub user by name or phone number.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "requests" && (
          <div className="chat-modal-requests-body">
            {incomingRequests?.length > 0 && (
              <>
                <h4 className="chat-modal-requests-section-title">Incoming Requests</h4>
                {incomingRequests.map(req => (
                  <div key={req.id || req.phone} className="chat-modal-request-item">
                    <div className="chat-modal-result-avatar">{initials(req.name || req.senderName)}</div>
                    <div className="chat-modal-result-info">
                      <strong>{req.name || req.senderName || "User"}</strong>
                      <small>{req.phone || req.senderPhone}</small>
                    </div>
                    <div className="chat-modal-request-actions">
                      <button
                        type="button"
                        className="chat-modal-accept-btn"
                        onClick={() => onAcceptRequest?.(req.id || req.phone)}
                      >✓ Accept</button>
                      <button
                        type="button"
                        className="chat-modal-reject-btn"
                        onClick={() => onRejectRequest?.(req.id || req.phone)}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </>
            )}
            {outgoingRequests?.length > 0 && (
              <>
                <h4 className="chat-modal-requests-section-title">Sent Requests</h4>
                {outgoingRequests.map(req => (
                  <div key={req.id || req.phone} className="chat-modal-request-item">
                    <div className="chat-modal-result-avatar">{initials(req.name || req.receiverName)}</div>
                    <div className="chat-modal-result-info">
                      <strong>{req.name || req.receiverName || "User"}</strong>
                      <small>{req.phone || req.receiverPhone}</small>
                    </div>
                    <span className="chat-modal-result-status pending">Pending...</span>
                  </div>
                ))}
              </>
            )}
            {!incomingRequests?.length && !outgoingRequests?.length && (
              <p className="chat-modal-hint">No pending requests.</p>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── StoryAvatar ──────────────────────────────────────────────────────────────

function StoryAvatar({ story, onClick, isOwn, hasUnread }) {
  return (
    <button type="button" className="story-avatar-btn" onClick={() => onClick?.(story)}>
      <div className={`story-avatar-ring ${hasUnread ? "unread" : ""} ${isOwn ? "own" : ""}`}>
        {story.imageUrl ? (
          <img src={story.imageUrl} alt={story.userName || "Story"} className="story-avatar-img" />
        ) : (
          <div className="story-avatar-placeholder">{initials(story.userName)}</div>
        )}
        {isOwn && (
          <span className="story-add-badge">+</span>
        )}
      </div>
      <span className="story-avatar-name">{isOwn ? "Your Story" : (story.userName || "User")}</span>
    </button>
  );
}

// ─── StoryViewer ─────────────────────────────────────────────────────────────

function StoryViewer({ story, onClose, onNext, onPrev, hasNext, hasPrev }) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    setProgress(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timerRef.current);
          onNext?.();
          return 100;
        }
        return prev + 2; // 5 seconds total (100 / 2 = 50 ticks * 100ms)
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [story?.id]);

  if (!story) return null;

  return (
    <div className="story-viewer-overlay" onClick={onClose}>
      <div className="story-viewer-panel" onClick={e => e.stopPropagation()}>
        {/* Progress bar */}
        <div className="story-viewer-progress">
          <div className="story-viewer-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Header */}
        <div className="story-viewer-header">
          <div className="story-viewer-user">
            <div className="story-viewer-avatar">{initials(story.userName)}</div>
            <div>
              <strong>{story.userName || "User"}</strong>
              <small>{story.createdAt ? new Date(story.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</small>
            </div>
          </div>
          <button type="button" className="story-viewer-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Content */}
        <div className="story-viewer-content">
          {story.imageUrl && (
            <img src={story.imageUrl} alt="Story" className="story-viewer-image" />
          )}
          {story.text && (
            <p className="story-viewer-text">{story.text}</p>
          )}
        </div>

        {/* Navigation */}
        {hasPrev && (
          <button type="button" className="story-nav-btn story-nav-prev" onClick={e => { e.stopPropagation(); onPrev?.(); }}>
            ‹
          </button>
        )}
        {hasNext && (
          <button type="button" className="story-nav-btn story-nav-next" onClick={e => { e.stopPropagation(); onNext?.(); }}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}

// ─── UploadStoryModal ─────────────────────────────────────────────────────────

function UploadStoryModal({ open, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!text.trim() && !imageFile) return;
    setSubmitting(true);
    try {
      await onSubmit?.({ text, imageFile });
      setText("");
      setImageFile(null);
      setImagePreview(null);
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="story-upload-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="story-upload-modal"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
          >
            <div className="chat-modal-header">
              <strong>Add to Your Story</strong>
              <button type="button" className="chat-modal-close-btn" onClick={onClose}>✕</button>
            </div>
        <div className="story-upload-body">
          {imagePreview ? (
            <div className="story-upload-preview-wrap">
              <img src={imagePreview} alt="Story preview" className="story-upload-preview" />
              <button type="button" className="story-upload-remove-img" onClick={() => { setImageFile(null); setImagePreview(null); }}>✕ Remove</button>
            </div>
          ) : (
            <button type="button" className="story-upload-img-btn" onClick={() => fileRef.current?.click()}>
              <span>📷</span>
              <span>Add Photo</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden-file-input" onChange={handleImageChange} />
          <textarea
            className="story-upload-textarea"
            placeholder="What's on your mind?"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
          />
        </div>
        <div className="story-upload-footer">
          <button type="button" className="mp-filter-reset-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="mp-filter-apply-btn"
            onClick={handleSubmit}
            disabled={submitting || (!text.trim() && !imageFile)}
          >
            {submitting ? "Sharing..." : "Share Story"}
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── StoryBar ─────────────────────────────────────────────────────────────────

export function StoryBar({ stories, currentUserId, onUploadStory }) {
  const [viewingStory, setViewingStory] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const scrollRef = useRef(null);

  const allStories = stories || [];
  const myStory = allStories.find(s => s.userId === currentUserId);
  const othersStories = allStories.filter(s => s.userId !== currentUserId);

  function openStory(story, index) {
    setViewingStory(story);
    setViewingIndex(index);
  }

  function goNext() {
    const next = viewingIndex + 1;
    if (next < allStories.length) {
      setViewingStory(allStories[next]);
      setViewingIndex(next);
    } else {
      setViewingStory(null);
    }
  }

  function goPrev() {
    const prev = viewingIndex - 1;
    if (prev >= 0) {
      setViewingStory(allStories[prev]);
      setViewingIndex(prev);
    }
  }

  async function handleUpload({ text, imageFile }) {
    await onUploadStory?.({ text, imageFile });
  }

  const storyList = [
    // Own story first
    {
      id: "own",
      userId: currentUserId,
      userName: "Your Story",
      imageUrl: myStory?.imageUrl || null,
      text: myStory?.text || "",
      createdAt: myStory?.createdAt || null,
      isOwn: true
    },
    ...othersStories.map(s => ({ ...s, isOwn: false }))
  ];

  return (
    <div className="story-bar">
      <div className="story-bar-scroll" ref={scrollRef}>
        {/* Own story / upload button */}
        <button
          type="button"
          className="story-avatar-btn"
          onClick={() => myStory ? openStory(myStory, 0) : setUploadOpen(true)}
        >
          <div className={`story-avatar-ring own ${myStory ? "unread" : ""}`}>
            {myStory?.imageUrl ? (
              <img src={myStory.imageUrl} alt="Your story" className="story-avatar-img" />
            ) : (
              <div className="story-avatar-placeholder story-own-placeholder">
                <span>+</span>
              </div>
            )}
          </div>
          <span className="story-avatar-name">Your Story</span>
        </button>

        {/* Other stories */}
        {othersStories.map((story, i) => (
          <StoryAvatar
            key={story.id || i}
            story={story}
            hasUnread={!story.viewed}
            isOwn={false}
            onClick={s => openStory(s, i + 1)}
          />
        ))}
      </div>

      {viewingStory && (
        <StoryViewer
          story={viewingStory}
          onClose={() => setViewingStory(null)}
          onNext={goNext}
          onPrev={goPrev}
          hasNext={viewingIndex < allStories.length - 1}
          hasPrev={viewingIndex > 0}
        />
      )}

      <UploadStoryModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUpload}
      />
    </div>
  );
}
