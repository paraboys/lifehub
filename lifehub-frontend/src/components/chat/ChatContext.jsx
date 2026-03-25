import React, { createContext, useContext, useState, useEffect, useRef } from "react";

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
