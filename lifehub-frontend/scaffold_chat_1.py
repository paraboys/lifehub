import os

base_dir = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\chat"
os.makedirs(base_dir, exist_ok=True)

# 1. ChatIcons.jsx
icons_content = r'''import React from "react";
export const SearchIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.608 0a3.606 3.606 0 1 1 0-7.212 3.606 3.606 0 0 1 0 7.212z"></path></svg>;
export const MenuIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path></svg>;
export const PlusIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"></path></svg>;
export const StatusIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M12.072 1.761a10.05 10.05 0 0 0-9.303 5.65.977.977 0 0 0 1.756.855 8.098 8.098 0 0 1 7.496-4.553.977.977 0 1 0 .051-1.952zM1.926 13.64a10.052 10.052 0 0 0 7.461 7.925.977.977 0 0 0 .471-1.895 8.097 8.097 0 0 1-6.012-6.386.977.977 0 0 0-1.92.356zm13.729 7.454a10.053 10.053 0 0 0 6.201-8.946.976.976 0 1 0-1.951-.081v.014a8.097 8.097 0 0 1-4.997 7.209.977.977 0 0 0 .727 1.813L15.655 21.1z"></path></svg>;
export const ChatIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"></path></svg>;
export const CallIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M17.65 11.23a1.996 1.996 0 0 0-.25-1.55c-.56-.99-.89-2.07-1.12-3.15-.22-1.04-.6-2.22-1.74-2.73-1.07-.48-2.2-.24-3.52.28-1.4.56-2.88 1.15-4.52 1.15H6.27a.99.99 0 0 0-.71.29l-.3.29c-.77.77-1.02 1.87-.66 2.87.5 1.34 1.3 2.65 2.15 3.96 1.48 2.29 2.54 3.93 4.3 5 1.78 1.09 3.51 1.7 5 1.96.2.03.4.05.6.05.97 0 1.87-.41 2.5-1.14l.21-.24c.48-.56.63-1.33.43-2.03-.26-.91-.84-2.14-1.36-3.26-.41-.89-.98-1.89-1.2-2.7z"></path></svg>;
export const AttachIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.57.57 0 0 0-.834.018l-7.205 7.207a5.577 5.577 0 0 0-1.645 3.971z"></path></svg>;
export const CheckIcon = ({ read }) => <svg viewBox="0 0 16 15" width="16" height="15" className="wa-icon" style={{color: read ? '#53bdeb' : '#8696a0'}}><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.51zM10.824 3.012l-.478-.372a.365.365 0 0 0-.51.063L4.542 9.479a.32.32 0 0 1-.484.032L1.892 7.551a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l2.5 2.4c.143.14.361.125.484-.033l6.71-8.448a.366.366 0 0 0-.064-.51z"></path></svg>;
export const SendIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg>;
export const EmojiIcon = () => <svg viewBox="0 0 24 24" height="24" width="24" className="wa-icon"><path fill="currentColor" d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z"></path></svg>;
'''
with open(os.path.join(base_dir, "ChatIcons.jsx"), "w", encoding="utf-8") as f: f.write(icons_content)

# 2. ChatUtils.jsx
utils_content = r'''export function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function initials(name) {
  return String(name || "U").slice(0, 1).toUpperCase();
}
'''
with open(os.path.join(base_dir, "ChatUtils.jsx"), "w", encoding="utf-8") as f: f.write(utils_content)

# 3. ChatContext.jsx
context_content = r'''import React, { createContext, useContext, useState, useEffect, useRef } from "react";

const ChatContext = createContext(null);

export function ChatProvider({ children, api, user, callProps }) {
  const [activeTab, setActiveTab] = useState("CHATS"); // CHATS, STATUS
  
  // Data States
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [incomingReqs, setIncomingReqs] = useState([]);
  const [outgoingReqs, setOutgoingReqs] = useState([]);
  const [stories, setStories] = useState([]);
  
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("All"); 

  // Modals & Forms
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [activeStory, setActiveStory] = useState(null);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [archivedChatIds, setArchivedChatIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wa_archived') || '[]'); } catch(e) { return []; }
  });
  const [showingArchived, setShowingArchived] = useState(false);

  // References
  const pollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const fetchContactsAndReqs = async () => {
    try {
      const data = await api("/chat/contacts");
      if (data) {
        setContacts(data.contacts || []);
        setIncomingReqs(data.incomingRequests || []);
        setOutgoingReqs(data.outgoingRequests || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStories = async () => {
    try {
      const data = await api("/chat/stories");
      if (data && data.stories) setStories(data.stories);
    } catch (e) { console.error(e); }
  };

  const fetchConversations = async () => {
    try {
      const data = await api("/chat/conversations");
      if (data && data.conversations) {
        setConversations(data.conversations);
      }
    } catch(e) { console.error(e) }
  };

  const fetchMessages = async (conversationId) => {
    try {
      const data = await api(`/chat/conversations/${conversationId}/messages`);
      if (data && data.messages) {
        setMessages([...data.messages].reverse());
      }
      setTimeout(() => scrollToBottom(), 100);
    } catch(e) { console.error(e) }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    fetchContactsAndReqs();
    fetchConversations();
    fetchStories();
    
    pollRef.current = setInterval(() => {
      fetchConversations();
      if (selectedChat) {
         fetchMessages(selectedChat.id);
      }
    }, 4000);

    return () => clearInterval(pollRef.current);
  }, [selectedChat]);

  const toggleArchive = (chatId, e) => {
     e.stopPropagation();
     const newArchived = archivedChatIds.includes(chatId) 
       ? archivedChatIds.filter(id => id !== chatId) 
       : [...archivedChatIds, chatId];
     setArchivedChatIds(newArchived);
     localStorage.setItem('wa_archived', JSON.stringify(newArchived));
  };

  const value = {
    api, user, callProps,
    activeTab, setActiveTab,
    conversations, setConversations, fetchConversations,
    contacts, incomingReqs, outgoingReqs, fetchContactsAndReqs,
    stories, setStories, fetchStories,
    selectedChat, setSelectedChat,
    messages, setMessages, fetchMessages, messagesEndRef, scrollToBottom,
    filter, setFilter,
    isAddContactOpen, setIsAddContactOpen,
    isGroupModalOpen, setIsGroupModalOpen,
    activeStory, setActiveStory,
    searchPhone, setSearchPhone, searchResult, setSearchResult, searchLoading, setSearchLoading,
    archivedChatIds, showingArchived, setShowingArchived, toggleArchive
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChatContext = () => useContext(ChatContext);
'''
with open(os.path.join(base_dir, "ChatContext.jsx"), "w", encoding="utf-8") as f: f.write(context_content)

# 4. ChatSidebar.jsx
sidebar_content = r'''import React from "react";
import { useChatContext } from "./ChatContext";
import { ChatIcon, StatusIcon, CallIcon } from "./ChatIcons";
import { initials } from "./ChatUtils";

export default function ChatSidebar() {
  const { activeTab, setActiveTab, user } = useChatContext();

  return (
    <div className="wa-slim-sidebar">
      <div className="wa-slim-top">
        <div className={`wa-slim-icon ${activeTab === 'CHATS' ? 'active-icon' : ''}`} onClick={() => setActiveTab("CHATS")}>
          <ChatIcon />
        </div>
        <div className={`wa-slim-icon ${activeTab === 'STATUS' ? 'active-icon' : ''}`} onClick={() => setActiveTab("STATUS")}>
          <StatusIcon />
        </div>
        <div className="wa-slim-icon" onClick={() => alert("Calls UI is invoked from chat headers or direct incoming.")}>
          <CallIcon />
        </div>
      </div>
      <div className="wa-slim-bottom">
        <div className="wa-slim-icon" title="Settings">
           <div className="wa-profile-icon">
              {user?.avatar ? <img src={user.avatar} alt="Me" /> : <div className="wa-avatar-fallback">{initials(user?.name)}</div>}
           </div>
        </div>
      </div>
    </div>
  );
}
'''
with open(os.path.join(base_dir, "ChatSidebar.jsx"), "w", encoding="utf-8") as f: f.write(sidebar_content)

# 5. ChatListPane.jsx
list_content = r'''import React from "react";
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
'''
with open(os.path.join(base_dir, "ChatListPane.jsx"), "w", encoding="utf-8") as f: f.write(list_content)

print("Created Core Chat Components successfully.")
