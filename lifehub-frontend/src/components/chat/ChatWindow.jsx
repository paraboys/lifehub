import React, { useState } from "react";
import { useChatContext } from "./ChatContext";
import { SearchIcon, MenuIcon, CallIcon, AttachIcon, SendIcon, CheckIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";

export default function ChatWindow() {
  const { selectedChat, messages, messagesEndRef, user, api, fetchMessages, callProps } = useChatContext();
  const [messageInput, setMessageInput] = useState("");

  if (!selectedChat) {
    return (
      <div className="wa-empty-chat-state">
        <h1>WhatsApp for Web</h1>
        <p>Send and receive messages without keeping your phone online.</p>
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

  return (
    <>
      <div className="wa-main-header">
        <div className="wa-main-header-user">
          <div className="wa-chat-avatar-wrapper">
             {peer.avatarUrl ? <img src={peer.avatarUrl} alt="avatar" className="wa-chat-avatar" /> : <div className="wa-chat-avatar fallback">{initials(name)}</div>}
          </div>
          <div className="wa-main-header-info">
            <div className="wa-main-name">{name}</div>
            <div className="wa-main-status">Click here for contact info</div>
          </div>
        </div>
        <div className="wa-header-actions">
          <button className="wa-icon-btn" onClick={() => callProps?.startInstantCall("video")}><CallIcon /></button>
          <button className="wa-icon-btn"><SearchIcon /></button>
          <button className="wa-icon-btn"><MenuIcon /></button>
        </div>
      </div>

      <div className="wa-main-chat-area">
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
                      {formatTime(msg.created_at)}
                      {isMine && <span style={{marginLeft: 4, display: 'inline-block'}}><CheckIcon read={msg.deliveryStatus === "READ"} /></span>}
                    </div>
                 </div>
               </div>
             </React.Fragment>
           )
         })}
         <div ref={messagesEndRef} />
      </div>

      <div className="wa-main-input-area">
        <button className="wa-icon-btn"><AttachIcon /></button>
        <div className="wa-input-container">
          <input 
            type="text" 
            placeholder="Type a message" 
            className="wa-message-input" 
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => { if(e.key === 'Enter') sendMessage() }}
          />
        </div>
        <button className="wa-icon-btn" onClick={sendMessage}><SendIcon /></button>
      </div>
    </>
  );
}
