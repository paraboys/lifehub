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
      <div className="wa-list-header">
        <h2>{showingArchived ? 'Archived' : 'Chats'}</h2>
        <div className="wa-header-actions">
          {showingArchived ? (
             <button className="wa-icon-btn" onClick={() => setShowingArchived(false)} title="Back to Chats">✕</button>
          ) : (
             <>
               <button className="wa-icon-btn" onClick={() => setShowingArchived(true)} title="Archived Chats" style={{fontSize: 12}}>📦</button>
               <button className="wa-icon-btn" onClick={() => setIsGroupModalOpen(true)} title="New Group">👥</button>
               <button className="wa-icon-btn" onClick={() => setIsAddContactOpen(true)} title="Add Contact / New Chat">
                 <PlusIcon />
               </button>
             </>
          )}
        </div>
      </div>
      
      <div className="wa-search-bar">
        <div className="wa-search-input-container">
          <SearchIcon />
          <input type="text" placeholder="Search or start a new chat" className="wa-search-input" />
        </div>
      </div>

      <div className="wa-filter-chips">
        <button className={`wa-filter-chip ${filter === 'All' ? 'active' : ''}`} onClick={() => setFilter('All')}>All</button>
        <button className={`wa-filter-chip ${filter === 'Unread' ? 'active' : ''}`} onClick={() => setFilter('Unread')}>Unread</button>
        <button className={`wa-filter-chip ${filter === 'Favourites' ? 'active' : ''}`} onClick={() => setFilter('Favourites')}>Favourites</button>
      </div>

      <div className="wa-chat-list">
        {incomingReqs.length > 0 && (
           <div className="wa-requests-banner" onClick={() => setIsAddContactOpen(true)}>
              <span>You have {incomingReqs.length} new contact requests!</span>
           </div>
        )}
        {visibleChats.map(chat => {
          const peer = chat.peers?.[0] || {};
          const name = chat.type === 'GROUP' ? 'Group Chat' : peer.name || `Chat #${chat.id}`;
          const unread = Number(chat.unreadCount || 0);
          return (
           <div key={chat.id} className={`wa-chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`} onClick={() => handleOpenChat(chat)}>
             <div className="wa-chat-avatar-wrapper">
                {peer.avatarUrl ? <img src={peer.avatarUrl} alt={name} className="wa-chat-avatar" /> : <div className="wa-chat-avatar fallback">{initials(name)}</div>}
             </div>
             <div className="wa-chat-info">
               <div className="wa-chat-top-row">
                 <span className="wa-chat-name">{name}</span>
                 <span className={`wa-chat-time ${unread > 0 ? 'unread' : ''}`}>{formatTime(chat.lastMessage?.created_at || chat.created_at)}</span>
               </div>
               <div className="wa-chat-bottom-row">
                 <span className="wa-chat-msg">{chat.lastMessage?.content || "Tap to chat"}</span>
                 <div style={{display:'flex', gap: 5, alignItems:'center'}}>
                   {unread > 0 && <span className="wa-unread-badge">{unread}</span>}
                   <button onClick={(e) => toggleArchive(chat.id, e)} style={{background: 'none', border:'none', cursor:'pointer', color:'#8696a0'}} title={showingArchived ? "Unarchive" : "Archive"}>📦</button>
                 </div>
               </div>
             </div>
           </div>
          );
        })}
        {visibleChats.length === 0 && <div className="wa-empty-hint">No chats found.</div>}
      </div>
    </>
  );
}
