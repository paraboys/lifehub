import React from "react";
import { ChatProvider, useChatContext } from "./ChatContext";
import ChatSidebar from "./ChatSidebar";
import ChatListPane from "./ChatListPane";
import ChatWindow from "./ChatWindow";
import ChatStatusPane from "./ChatStatusPane";
import ChatContactsPane from "./ChatContactsPane";
import ChatModals from "./ChatModals";
import "../WhatsAppChat.css";

function ChatAppContent() {
  const { activeTab, selectedChat } = useChatContext();
  
  return (
    <div className="wa-app-container">
      <ChatSidebar />
      <div className="wa-list-panel">
          {activeTab === 'CHATS' && <ChatListPane />}
          {activeTab === 'STATUS' && <ChatStatusPane />}
          {activeTab === 'CONTACTS' && <ChatContactsPane />}
      </div>
      <div className={`wa-main-panel ${selectedChat ? 'active' : ''}`}>
         {activeTab === 'CHATS' ? <ChatWindow /> : <div className="wa-empty-chat-state"><h1>Status</h1><p>Watch updates from your friends.</p></div>}
      </div>
      <ChatModals />
    </div>
  );
}

export default function ChatApp({ api, user, callProps, stories, onUploadStory }) {
  return (
    <ChatProvider 
      api={api} 
      user={user} 
      callProps={callProps}
      stories={stories}
      onUploadStory={onUploadStory}
    >
      <ChatAppContent />
    </ChatProvider>
  );
}
