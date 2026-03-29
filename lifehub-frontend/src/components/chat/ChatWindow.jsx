import React, { useState, useEffect, useRef } from "react";
import { useChatContext } from "./ChatContext";
import { SearchIcon, MenuIcon, CallIcon, AttachIcon, SendIcon, CheckIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";

export default function ChatWindow() {
  const { selectedChat, messages, messagesEndRef, user, api, fetchMessages, callProps } = useChatContext();
  const [messageInput, setMessageInput] = useState("");
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef(null);

  // Close attach menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      await api(`/chat/conversations/${selectedChat.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: messageInput, messageType: "TEXT" })
      });
      setMessageInput("");
      fetchMessages(selectedChat.id);
    } catch(e) { console.error("Send message error", e); }
  };

  const peer = selectedChat.peers?.[0] || {};
  const name = selectedChat.type === 'GROUP' ? 'Group Chat' : peer.name || "Unknown";
  const status = selectedChat.type === 'GROUP' ? `${selectedChat.peers?.length || 0} participants` : 'Online';

  return (
    <>
      <div className={`wa-main-header ${showProfileInfo ? 'pane-open' : ''}`}>
        <div className="wa-main-header-user" onClick={() => setShowProfileInfo(!showProfileInfo)}>
          <div className="wa-chat-avatar-wrapper">
             {peer.avatarUrl ? <img src={peer.avatarUrl} alt="avatar" className="wa-chat-avatar" /> : <div className="wa-chat-avatar fallback">{initials(name)}</div>}
          </div>
          <div className="wa-main-header-info">
            <div className="wa-main-name">{name}</div>
            <div className="wa-main-status">{status} • Click for info</div>
          </div>
        </div>
        <div className="wa-header-actions">
          <button className="wa-icon-btn action-video" onClick={() => callProps?.startInstantCall("video")} title="Video Call">
            <CallIcon />
          </button>
          <button className="wa-icon-btn action-audio" onClick={() => callProps?.startInstantCall("audio")} title="Audio Call">
            <span style={{fontSize: 20}}>📞</span>
          </button>
          <div className="wa-header-divider"></div>
          <button className="wa-icon-btn"><SearchIcon /></button>
        </div>
      </div>

      <div className="wa-chat-body-container">
        <div className={`wa-main-chat-area ${showProfileInfo ? 'shrink' : ''}`}>
          <div className="wa-chat-bg-pattern"></div>
           {messages.map((msg, i) => {
             const isMine = String(msg.sender_id) === String(user.id);
             const dateChange = i === 0 || new Date(messages[i-1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
             return (
               <React.Fragment key={msg.id}>
                 {dateChange && <div className="wa-date-divider"><span>{new Date(msg.created_at).toLocaleDateString()}</span></div>}
                 <div className={`wa-message-row ${isMine ? 'mine' : 'theirs'}`}>
                   <div className={`wa-message-bubble ${isMine ? 'sent' : 'received'}`}>
                      <div className="wa-message-text">{msg.content}</div>
                      <div className="wa-message-meta">
                        <span>{formatTime(msg.created_at)}</span>
                        {isMine && <span style={{marginLeft: 4, display: 'inline-block', opacity: msg.deliveryStatus === 'READ' ? 1 : 0.7}}><CheckIcon read={msg.deliveryStatus === "READ"} /></span>}
                      </div>
                      <div className="msg-actions">
                        <button title="Reply">↩️</button>
                        <button title="React">😀</button>
                      </div>
                   </div>
                 </div>
               </React.Fragment>
             )
           })}
           <div ref={messagesEndRef} />
        </div>

        {/* Floating Profile Info Pane */}
        <div className={`wa-profile-pane ${showProfileInfo ? 'open' : ''}`}>
           <div className="wa-profile-header">
             <button className="wa-icon-btn" onClick={() => setShowProfileInfo(false)}>✕</button>
             <span>Contact Info</span>
           </div>
           <div className="wa-profile-hero">
              <div className="wa-profile-avatar-large">
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
              <button>
                 <span className="icon">🔍</span>
                 <span>Search</span>
              </button>
           </div>
           <div className="wa-profile-section">
              <h4>About</h4>
              <p>Hey there! I am using LifeHub.</p>
           </div>
           <div className="wa-profile-section">
              <h4>Media, Links & Docs</h4>
              <div className="wa-media-preview-grid">
                 <div className="media-placeholder">🖼️</div>
                 <div className="media-placeholder">📄</div>
                 <div className="media-placeholder">🎵</div>
              </div>
           </div>
        </div>
      </div>

      <div className={`wa-main-input-area ${showProfileInfo ? 'shrink' : ''}`}>
        <div className="wa-attach-wrapper" ref={attachMenuRef}>
          <button className={`wa-icon-btn attach-btn ${showAttachMenu ? 'active' : ''}`} onClick={() => setShowAttachMenu(!showAttachMenu)}>
            <AttachIcon />
          </button>
          
          {showAttachMenu && (
            <div className="wa-attach-menu">
              <button className="attach-item img"><span className="icon">🖼️</span> Image/Video</button>
              <button className="attach-item doc"><span className="icon">📄</span> Document</button>
              <button className="attach-item loc"><span className="icon">📍</span> Location</button>
              <button className="attach-item contact"><span className="icon">👤</span> Contact</button>
            </div>
          )}
        </div>
        
        <div className="wa-input-container">
          <input 
            type="text" 
            placeholder="Type your message..." 
            className="wa-message-input" 
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => { if(e.key === 'Enter') sendMessage() }}
          />
          <button className="wa-icon-btn emoji-btn">😀</button>
        </div>
        
        {messageInput.trim() ? (
           <button className="wa-send-btn glow" onClick={sendMessage}><SendIcon /></button>
        ) : (
           <button className="wa-send-btn mic"><span style={{fontSize: 18}}>🎙️</span></button>
        )}
      </div>
    </>
  );
}
