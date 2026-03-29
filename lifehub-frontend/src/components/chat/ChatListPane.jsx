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
    
    if (filter === "Unread") return Number(c.unreadCount || 0) > 0;
    if (filter === "Favourites") return false; 
    return true;
  });

  return (
    <>
      <div className="wa-list-header glass-header">
        <div className="wa-list-header-left">
           <h2>{showingArchived ? 'Archive' : 'Messages'}</h2>
           {!showingArchived && <span className="wa-badge-pulse">{visibleChats.length}</span>}
        </div>
        <div className="wa-header-actions">
          {showingArchived ? (
             <button className="wa-icon-btn filled" onClick={() => setShowingArchived(false)} title="Back to Chats">✕</button>
          ) : (
             <>
               <button className="wa-icon-btn glass-btn" onClick={() => setShowingArchived(true)} title="Archived Chats">📦</button>
               <button className="wa-icon-btn glass-btn" onClick={() => window.alert('Status/Stories feature is deeply linked with the main navigation!')} title="Status / Stories">⭕</button>
               <button className="wa-icon-btn glass-btn" onClick={() => setIsGroupModalOpen(true)} title="New Group">👥</button>
               <button className="wa-icon-btn glass-btn accent" onClick={() => setIsAddContactOpen(true)} title="Add Contact / New Chat">
                 <PlusIcon />
               </button>
             </>
          )}
        </div>
      </div>
      
      <div className="wa-search-bar">
        <div className="wa-search-input-container glow-focus">
          <SearchIcon />
          <input type="text" placeholder="Search conversations..." className="wa-search-input" />
        </div>
      </div>

      <div className="wa-filter-chips modern-scroll">
        <button className={`wa-filter-chip ${filter === 'All' ? 'active shadow' : ''}`} onClick={() => setFilter('All')}>All</button>
        <button className={`wa-filter-chip ${filter === 'Unread' ? 'active shadow' : ''}`} onClick={() => setFilter('Unread')}>Unread</button>
        <button className={`wa-filter-chip ${filter === 'Favourites' ? 'active shadow' : ''}`} onClick={() => setFilter('Favourites')}>Favourites</button>
      </div>

      <div className="wa-chat-list modern-scroll">
        {incomingReqs.length > 0 && (
           <div className="wa-requests-banner glass-banner" onClick={() => setIsAddContactOpen(true)}>
              <div className="banner-icon">🔔</div>
              <div className="banner-text">
                <strong>{incomingReqs.length} New Requests</strong>
                <span>Click to respond to friend requests</span>
              </div>
           </div>
        )}
        
        {visibleChats.map(chat => {
          const peer = chat.peers?.[0] || {};
          const name = chat.type === 'GROUP' ? 'Group Chat' : peer.name || `Chat #${chat.id}`;
          const unread = Number(chat.unreadCount || 0);
          return (
           <div key={chat.id} className={`wa-chat-item modern-item ${selectedChat?.id === chat.id ? 'active' : ''}`} onClick={() => handleOpenChat(chat)}>
             <div className="wa-chat-avatar-wrapper">
                {peer.avatarUrl ? <img src={peer.avatarUrl} alt={name} className="wa-chat-avatar shadow" /> : <div className="wa-chat-avatar fallback shadow">{initials(name)}</div>}
                {unread > 0 && <span className="online-indicator"></span>}
             </div>
             <div className="wa-chat-info">
               <div className="wa-chat-top-row">
                 <span className="wa-chat-name">{name}</span>
                 <span className={`wa-chat-time ${unread > 0 ? 'unread' : ''}`}>{formatTime(chat.lastMessage?.created_at || chat.created_at)}</span>
               </div>
               <div className="wa-chat-bottom-row">
                 <span className="wa-chat-msg truncate">{chat.lastMessage?.content || "Tap to chat"}</span>
                 <div className="wa-chat-badges">
                   {unread > 0 && <span className="wa-unread-badge pulse">{unread}</span>}
                   <button className="archive-hover-btn" onClick={(e) => toggleArchive(chat.id, e)} title={showingArchived ? "Unarchive" : "Archive"}>
                      {showingArchived ? "📤" : "📦"}
                   </button>
                 </div>
               </div>
             </div>
           </div>
          );
        })}
        {visibleChats.length === 0 && (
           <div className="wa-empty-hint modern-empty">
              <div className="empty-icon">📂</div>
              <p>No conversations found</p>
              <span>{showingArchived ? "Your archive is clean" : "Start a new chat to connect"}</span>
           </div>
        )}
      </div>
    </>
  );
}
