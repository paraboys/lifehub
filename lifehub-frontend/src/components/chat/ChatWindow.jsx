import React, { useState, useEffect, useRef, useMemo } from "react";
import { useChatContext } from "./ChatContext";
import { SearchIcon, MenuIcon, CallIcon, AttachIcon, SendIcon, CheckIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";
import ChatEmojiPicker from "./ChatEmojiPicker";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "👎", "🙏"];

export default function ChatWindow() {
  const { 
    selectedChat, messages, messagesEndRef, user, api, fetchMessages, 
    callProps, reactToMessage, markConversationAsRead 
  } = useChatContext();
  
  const [messageInput, setMessageInput] = useState("");
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const attachMenuRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setShowAttachMenu(false);
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setShowEmojiPicker(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mark as read when entering chat
  useEffect(() => {
    if (selectedChat) {
      markConversationAsRead(selectedChat.id);
    }
  }, [selectedChat?.id]);

  // Derived Media Gallery
  const mediaGallery = useMemo(() => {
    if (!messages) return [];
    return messages.filter(m => m.message_type === "IMAGE" || m.message_type === "VIDEO" || m.message_attachments?.length > 0);
  }, [messages]);

  // Derived Search Filter
  const renderedMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter(m => String(m.content || "").toLowerCase().includes(searchQuery.toLowerCase()));
  }, [messages, searchQuery]);

  if (!selectedChat) {
    return (
      <div className="wa-empty-chat-state">
        <div className="wa-empty-shield">
          <div className="wa-shield-icon">💬</div>
        </div>
        <h1>LifeHub Messenger</h1>
        <p>End-to-end encrypted messaging. Connect with friends and family seamlessly.</p>
        <div className="wa-empty-features">
          <span>🔒 Private</span>
          <span>⚡ Fast</span>
          <span>🎨 Modern</span>
        </div>
      </div>
    );
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedChat) return;
    try {
      await api(`/chat/conversations/${selectedChat.id}/messages`, 'POST', {
        content: messageInput,
        messageType: "TEXT",
        replyToId: replyingTo ? replyingTo.id : null
      });
      setMessageInput("");
      setReplyingTo(null);
      fetchMessages(selectedChat.id);
    } catch(e) { console.error("Send message error", e); }
  };

  const handleEmojiSelect = (emoji) => {
    setMessageInput(prev => prev + emoji);
  };

  const handleReact = (msgId, emoji) => {
    reactToMessage(msgId, emoji);
  };

  const peer = selectedChat.peers?.[0] || {};
  const name = selectedChat.type === 'GROUP' ? 'Group Chat' : peer.name || "Unknown";
  const isOnline = selectedChat.type !== 'GROUP' ? Math.random() > 0.5 : false; // Mocking presence for real-world feel
  const status = selectedChat.type === 'GROUP' ? `${selectedChat.peers?.length || 0} participants` : (isOnline ? 'Online' : 'Offline');

  return (
    <>
      <div className={`wa-main-header ${showProfileInfo ? 'pane-open' : ''} glass-header`}>
        <div className="wa-main-header-user" onClick={() => setShowProfileInfo(!showProfileInfo)} style={{cursor:'pointer'}}>
          <div className="wa-chat-avatar-wrapper">
             {peer.avatarUrl ? <img src={peer.avatarUrl} alt="avatar" className="wa-chat-avatar shadow" /> : <div className="wa-chat-avatar fallback shadow">{initials(name)}</div>}
             {isOnline && <span className="online-indicator"></span>}
          </div>
          <div className="wa-main-header-info">
            <div className="wa-main-name">{name}</div>
            <div className="wa-main-status">{status} • Click for info</div>
          </div>
        </div>
        <div className="wa-header-actions">
          {showSearch && (
             <div className="wa-header-search shadow">
               <input autoFocus type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
               <button className="wa-icon-btn" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>✕</button>
             </div>
          )}
          <button className="wa-icon-btn glass-btn action-video" onClick={() => callProps?.startInstantCall("video")} title="Video Call"><CallIcon /></button>
          <button className="wa-icon-btn glass-btn action-audio" onClick={() => callProps?.startInstantCall("audio")} title="Audio Call"><span style={{fontSize: 20}}>📞</span></button>
          <div className="wa-header-divider"></div>
          <button className={`wa-icon-btn glass-btn ${showSearch ? 'active' : ''}`} onClick={() => setShowSearch(!showSearch)}><SearchIcon /></button>
        </div>
      </div>

      <div className="wa-chat-body-container">
        <div className={`wa-main-chat-area ${showProfileInfo ? 'shrink' : ''}`}>
          <div className="wa-chat-bg-pattern"></div>
           {renderedMessages.map((msg, i) => {
             const isMine = String(msg.sender_id) === String(user.id);
             const dateChange = i === 0 || new Date(renderedMessages[i-1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
             const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;
             const isHovered = hoveredMessageId === msg.id;

             return (
               <React.Fragment key={msg.id}>
                 {dateChange && <div className="wa-date-divider shadow"><span>{new Date(msg.created_at).toLocaleDateString()}</span></div>}
                 
                 <div 
                   className={`wa-message-row ${isMine ? 'mine' : 'theirs'}`}
                   onMouseEnter={() => setHoveredMessageId(msg.id)}
                   onMouseLeave={() => setHoveredMessageId(null)}
                 >
                   <div className={`wa-message-bubble ${isMine ? 'sent' : 'received'} shadow`}>
                      
                      {msg.parent_message && (
                        <div className="wa-reply-quote" onClick={() => document.getElementById(`msg-${msg.parent_message.id}`)?.scrollIntoView({behavior: "smooth"})}>
                           <div className="reply-sender">{String(msg.parent_message.sender_id) === String(user.id) ? "You" : "Them"}</div>
                           <div className="reply-text truncate">{msg.parent_message.content}</div>
                        </div>
                      )}

                      <div className="wa-message-text" id={`msg-${msg.id}`}>{msg.content}</div>
                      
                      <div className="wa-message-meta">
                        <span>{formatTime(msg.created_at)}</span>
                        {isMine && <span style={{marginLeft: 4, display: 'inline-block'}}><CheckIcon read={msg.deliveryStatus === "READ"} /></span>}
                      </div>

                      {hasReactions && (
                        <div className="wa-reactions-floating shadow">
                          {Object.values(msg.reactions).map((emo, idx) => <span key={idx}>{emo}</span>)}
                          <span className="count">{Object.keys(msg.reactions).length}</span>
                        </div>
                      )}

                      <div className={`msg-actions ${isHovered ? 'visible' : ''}`}>
                        <div className="reaction-fast-bar shadow">
                          {QUICK_REACTIONS.map(emo => (
                            <button key={emo} onClick={() => handleReact(msg.id, emo)}>{emo}</button>
                          ))}
                        </div>
                        <button title="Reply" onClick={() => setReplyingTo(msg)} className="shadow">↩️</button>
                      </div>
                   </div>
                 </div>
               </React.Fragment>
             )
           })}
           <div ref={messagesEndRef} />
        </div>

        {/* Floating Profile Info Pane */}
        <div className={`wa-profile-pane shadow ${showProfileInfo ? 'open' : ''}`}>
           <div className="wa-profile-header glass-header">
             <button className="wa-icon-btn filled" onClick={() => setShowProfileInfo(false)}>✕</button>
             <span>Contact Info</span>
           </div>
           <div className="modern-scroll">
             <div className="wa-profile-hero">
                <div className="wa-profile-avatar-large shadow">
                  {peer.avatarUrl ? <img src={peer.avatarUrl} alt="avatar" /> : <div className="fallback-large">{initials(name)}</div>}
                </div>
                <h2 className="wa-profile-name">{name}</h2>
                <p className="wa-profile-phone">{peer.phone || "+91 •••• ••••••"}</p>
             </div>
             <div className="wa-profile-actions-grid">
                <button onClick={() => callProps?.startInstantCall("audio")}>
                   <span className="icon">📞</span>
                   <span>Audio</span>
                </button>
                <button onClick={() => callProps?.startInstantCall("video")}>
                   <span className="icon">📹</span>
                   <span>Video</span>
                </button>
                <button onClick={() => { setShowProfileInfo(false); setShowSearch(true); }}>
                   <span className="icon">🔍</span>
                   <span>Search</span>
                </button>
             </div>
             <div className="wa-profile-section">
                <h4>About</h4>
                <p>Hey there! I am using LifeHub Messenger.</p>
             </div>
             <div className="wa-profile-section">
                <h4>Media, Links & Docs</h4>
                <div className="wa-media-preview-grid">
                   {mediaGallery.length === 0 ? (
                      <div className="wa-empty-hint" style={{gridColumn: '1 / -1', padding: 10, fontSize: 12}}>No media shared yet.</div>
                   ) : (
                      mediaGallery.slice(0, 6).map((m, i) => (
                        <div key={i} className="media-placeholder shadow">
                           {m.message_type === "IMAGE" ? "🖼️" : "📄"}
                        </div>
                      ))
                   )}
                </div>
             </div>
           </div>
        </div>
      </div>

      <div className={`wa-main-input-area ${showProfileInfo ? 'shrink' : ''}`}>
        
        {replyingTo && (
           <div className="wa-reply-preview-bar shadow">
             <div className="reply-preview-content">
                <strong>Replying to {String(replyingTo.sender_id) === String(user.id) ? "Yourself" : peer.name || "Unknown"}</strong>
                <span className="truncate">{replyingTo.content}</span>
             </div>
             <button className="wa-icon-btn" onClick={() => setReplyingTo(null)}>✕</button>
           </div>
        )}

        <div className="wa-attach-wrapper" ref={attachMenuRef}>
          <button className={`wa-icon-btn attach-btn glass-btn ${showAttachMenu ? 'active' : ''}`} onClick={() => setShowAttachMenu(!showAttachMenu)}>
            <AttachIcon />
          </button>
          
          {showAttachMenu && (
            <div className="wa-attach-menu shadow">
              <button className="attach-item img"><span className="icon">🖼️</span> Image/Video</button>
              <button className="attach-item doc"><span className="icon">📄</span> Document</button>
              <button className="attach-item loc"><span className="icon">📍</span> Location</button>
              <button className="attach-item contact"><span className="icon">👤</span> Contact</button>
            </div>
          )}
        </div>
        
        <div className="wa-input-container glow-focus">
          <div ref={emojiPickerRef} style={{position: 'relative'}}>
            <button className="wa-icon-btn emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>😀</button>
            {showEmojiPicker && <ChatEmojiPicker onEmojiSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />}
          </div>
          <input 
            type="text" 
            placeholder="Type your message..." 
            className="wa-message-input" 
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => { if(e.key === 'Enter') sendMessage() }}
          />
        </div>
        
        {messageInput.trim() ? (
           <button className="wa-send-btn glow" onClick={sendMessage}><SendIcon /></button>
        ) : (
           <button className="wa-send-btn mic shadow"><span style={{fontSize: 18}}>🎙️</span></button>
        )}
      </div>
    </>
  );
}
