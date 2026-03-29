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
  const [showProfileInfo, setShowProfileInfo] = useState(true); // Default open on wide screens
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const attachMenuRef = useRef(null);
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setShowAttachMenu(false);
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setShowEmojiPicker(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedChat) {
      markConversationAsRead(selectedChat.id);
    }
  }, [selectedChat?.id]);

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
        <p>End-to-end encrypted messaging. Click a contact to start chatting securely.</p>
      </div>
    );
  }

  const sendMessage = async () => {
    if (!messageInput.trim()) return;
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

  const peer = selectedChat.peers?.[0] || {};
  const name = selectedChat.type === 'GROUP' ? 'Group Chat' : peer.name || "Unknown";
  const isOnline = true; // For UI demo accuracy to reference
  const status = isOnline ? 'Online' : 'Offline';

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Center Chat Thread */}
      <div className="chat-thread">
        <div className="wa-list-header">
          <div className="wa-main-header-user">
            <div className="item-name" style={{fontSize: '16px'}}>{name}</div>
          </div>
          <div className="wa-header-actions" style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
            <button className="wa-toolbar-btn" onClick={() => setShowSearch(!showSearch)}><SearchIcon /></button>
            <button className="wa-toolbar-btn" onClick={() => setShowProfileInfo(!showProfileInfo)}><MenuIcon /></button>
          </div>
          {showSearch && (
            <div className="wa-header-search">
              <input 
                autoFocus 
                type="text" 
                placeholder="Search..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
              />
              <button className="wa-toolbar-btn" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>✕</button>
            </div>
          )}
        </div>

        <div className="wa-main-chat-area modern-scroll" style={{flex: 1}}>
          <div className="wa-date-divider">
            <span>Chat started: Today, 10:38</span>
          </div>

          {renderedMessages.map((msg, i) => {
            const isMine = String(msg.sender_id) === String(user.id);
            const showAvatar = !isMine && (i === 0 || String(renderedMessages[i-1].sender_id) !== String(msg.sender_id));
            const isHovered = hoveredMessageId === msg.id;

            return (
              <div 
                key={msg.id} 
                className="wa-message-row"
                style={{ alignItems: isMine ? 'flex-end' : 'flex-start', paddingLeft: !isMine && !showAvatar ? '56px' : '0' }}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
              >
                {!isMine && showAvatar && (
                  <img src={peer.avatarUrl || "https://ui-avatars.com/api/?name="+name} className="wa-chat-avatar" style={{position: 'absolute', left: '0', top: '0'}} />
                )}
                
                <div className={`wa-message-bubble ${isMine ? 'sent' : 'received'}`} style={{marginLeft: !isMine && showAvatar ? '56px' : '0'}}>
                  {msg.parent_message && (
                    <div className="wa-reply-quote">
                      <div className="reply-sender" style={{fontSize: '11px', opacity: 0.8}}>{String(msg.parent_message.sender_id) === String(user.id) ? "You" : peer.name}</div>
                      <div style={{fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{msg.parent_message.content}</div>
                    </div>
                  )}
                  <div>{msg.content}</div>
                  <div style={{fontSize: '10px', marginTop: '4px', opacity: 0.7, textAlign: 'right'}}>
                    {formatTime(msg.created_at)}
                    {isMine && <span style={{marginLeft: '4px'}}><CheckIcon read={msg.deliveryStatus === "READ"} /></span>}
                  </div>

                  {isHovered && (
                    <div className="msg-actions visible" style={{position: 'absolute', [isMine ? 'left' : 'right']: '-80px', top: '0'}}>
                       <div className="reaction-fast-bar">
                         {QUICK_REACTIONS.slice(0, 5).map(emo => (
                           <button key={emo} onClick={() => reactToMessage(msg.id, emo)} style={{fontSize: '16px'}}>{emo}</button>
                         ))}
                         <button onClick={() => setReplyingTo(msg)} style={{fontSize: '14px'}}>↩️</button>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* AI Suggestion Mockup */}
          <div className="wa-message-row" style={{alignItems: 'flex-start'}}>
             <div className="wa-message-bubble" style={{background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.2)', color: '#4c1d95', maxWidth: '80%'}}>
                <div style={{fontSize: '13px'}}>You can personalize your account by choosing a base theme, adding your initials, or a custom status tag.</div>
                <div style={{marginTop: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer', color: '#7c3aed'}}>Use Suggestion</div>
             </div>
             <div style={{fontSize: '10px', color: '#94a3b8', marginTop: '4px', marginLeft: '4px'}}>AI reply suggestions</div>
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* SaaS Style Input Area */}
        <div className="wa-main-input-area">
          {replyingTo && (
            <div className="wa-reply-preview-bar">
              <div className="reply-preview-content">
                <strong>Replying to {peer.name}</strong>
                <span className="truncate">{replyingTo.content}</span>
              </div>
              <button className="wa-toolbar-btn" onClick={() => setReplyingTo(null)}>✕</button>
            </div>
          )}
          <div className="wa-input-container">
            <textarea 
              placeholder="Type a message" 
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <div className="wa-input-toolbar">
              <div className="toolbar-group">
                <div ref={emojiPickerRef} style={{position: 'relative'}}>
                   <button className="wa-toolbar-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>😀</button>
                   {showEmojiPicker && (
                     <div style={{position:'absolute', bottom: '100%', left: 0}}>
                       <ChatEmojiPicker onEmojiSelect={emo => { setMessageInput(p => p+emo); setShowEmojiPicker(false); }} onClose={() => setShowEmojiPicker(false)} />
                     </div>
                   )}
                </div>
                <button className="wa-toolbar-btn" title="Add mention"><span style={{fontSize: '18px'}}>@</span></button>
                <button className="wa-toolbar-btn" title="Flash commands"><span style={{fontSize: '18px', fontWeight: 'bold'}}>#</span></button>
                <button className="wa-toolbar-btn" title="Attach file"><AttachIcon /></button>
                <button className="wa-toolbar-btn" title="Formatting"><span style={{fontSize: '18px', fontWeight: 'bold'}}>⚡</span></button>
              </div>
              <button className="wa-send-btn-solid" onClick={sendMessage}>Send</button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Profile Pane - SaaS Static */}
      {showProfileInfo && (
        <div className="chat-profile-sidebar">
          <div className="wa-list-header">
            <div className="item-name">Contact Info</div>
            <button className="wa-toolbar-btn" onClick={() => setShowProfileInfo(false)}>✕</button>
          </div>
          <div className="modern-scroll" style={{flex: 1}}>
            <div className="profile-hero-minimal">
              <img src={peer.avatarUrl || "https://ui-avatars.com/api/?name="+name} className="profile-avatar-large" alt="avatar" />
              <h2 className="profile-name-minimal">{name}</h2>
              <p className="profile-email-minimal">{peer.email || (peer.phone + "@lifehub.com")}</p>
              <p style={{fontSize: '12px', color: '#94a3b8', marginTop: '4px'}}>New York, United States • 10:15 PM local time</p>
            </div>

            <div className="profile-map-container">
               <div className="map-mockup">
                  <div className="map-pin">📍</div>
                  <div className="map-label">New York</div>
                  <div style={{position: 'absolute', inset: 0, background: 'url(https://maps.googleapis.com/maps/api/staticmap?center=New+York&zoom=13&size=300x200&sensor=false) center/cover', opacity: 0.3}}></div>
               </div>
            </div>

            <div className="profile-accordion-item">
              <div className="profile-accordion-header">
                 <span>Additional Info</span>
                 <span>›</span>
              </div>
            </div>
            <div className="profile-accordion-item">
              <div className="profile-accordion-header">
                 <span>Technology</span>
                 <span>›</span>
              </div>
            </div>
            <div className="profile-accordion-item">
              <div className="profile-accordion-header">
                 <span>Visited pages</span>
                 <span>›</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
