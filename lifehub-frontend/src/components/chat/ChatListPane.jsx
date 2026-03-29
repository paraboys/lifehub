import React from "react";
import { useChatContext } from "./ChatContext";
import { PlusIcon, MenuIcon, SearchIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";

export default function ChatListPane() {
  const { 
    conversations, selectedChat, setSelectedChat, setMessages, fetchMessages, 
    filter, setFilter, showingArchived, setShowingArchived, setIsGroupModalOpen, 
    setIsAddContactOpen, toggleArchive, archivedChatIds, incomingReqs
  } = useChatContext();

  const handleOpenChat = (chat) => {
    setSelectedChat(chat);
    setMessages([]); 
    fetchMessages(chat.id);
  };

  const visibleChats = conversations.filter(c => {
    const isArchived = archivedChatIds.includes(c.id);
    if (showingArchived) return isArchived;
    if (isArchived) return false;
    return true;
  });

  // Split chats into "Active" and "Others" to match reference UI style
  const activeChats = visibleChats.filter(c => (c.unreadCount || 0) > 0);
  const otherChats = visibleChats.filter(c => !(c.unreadCount || 0) > 0);

  return (
    <>
      <div className="wa-list-header">
        <h2>{showingArchived ? 'Archive' : 'All'}</h2>
        <div className="wa-header-actions">
           <button className="wa-toolbar-btn" onClick={() => setIsAddContactOpen(true)} title="Filter/Search"><SearchIcon /></button>
        </div>
      </div>
      
      <div className="wa-chat-list modern-scroll" style={{flex: 1}}>
        {showingArchived && (
          <div style={{padding: '10px 20px'}}>
            <button className="wa-toolbar-btn" onClick={() => setShowingArchived(false)} style={{fontSize: '12px'}}>← Back to All</button>
          </div>
        )}

        {incomingReqs.length > 0 && (
           <div className="modern-item" style={{background: 'rgba(37, 99, 235, 0.05)', borderLeft: '3px solid #2563eb'}} onClick={() => setIsAddContactOpen(true)}>
              <div className="wa-chat-avatar" style={{background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>🔔</div>
              <div className="modern-item-body">
                <div className="item-name">New Requests</div>
                <div className="item-snippet">{incomingReqs.length} people want to connect</div>
              </div>
           </div>
        )}

        <div className="wa-list-section-title">Active ({activeChats.length})</div>
        {activeChats.map(chat => {
          const peer = chat.peers?.[0] || {};
          const name = chat.type === 'GROUP' ? 'Group Chat' : peer.name || "Unknown";
          return (
            <div key={chat.id} className={`modern-item ${selectedChat?.id === chat.id ? 'active' : ''}`} onClick={() => handleOpenChat(chat)}>
              <div style={{position: 'relative'}}>
                <img src={peer.avatarUrl || "https://ui-avatars.com/api/?name="+name} className="wa-chat-avatar" alt="avatar" />
                <span className="online-indicator"></span>
              </div>
              <div className="modern-item-body">
                <div className="item-top">
                  <span className="item-name">{name}</span>
                  <span className="item-time">{formatTime(chat.lastMessage?.created_at || chat.created_at)}</span>
                </div>
                <div className="item-snippet">{chat.lastMessage?.content || "No messages yet"}</div>
              </div>
            </div>
          );
        })}

        <div className="wa-list-section-title">Chats ({otherChats.length})</div>
        {otherChats.map(chat => {
          const peer = chat.peers?.[0] || {};
          const name = chat.type === 'GROUP' ? 'Group Chat' : peer.name || "Unknown";
          return (
            <div key={chat.id} className={`modern-item ${selectedChat?.id === chat.id ? 'active' : ''}`} onClick={() => handleOpenChat(chat)}>
              <img src={peer.avatarUrl || "https://ui-avatars.com/api/?name="+name} className="wa-chat-avatar" alt="avatar" />
              <div className="modern-item-body">
                <div className="item-top">
                  <span className="item-name">{name}</span>
                  <span className="item-time">{formatTime(chat.lastMessage?.created_at || chat.created_at)}</span>
                </div>
                <div className="item-snippet">{chat.lastMessage?.content || "Tap to chat"}</div>
              </div>
            </div>
          );
        })}

        {visibleChats.length === 0 && (
           <div className="modern-empty">
              <p>No conversations found</p>
           </div>
        )}
      </div>
    </>
  );
}

