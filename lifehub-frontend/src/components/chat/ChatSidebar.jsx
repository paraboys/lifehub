import React from "react";
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
        <div className={`wa-slim-icon ${activeTab === 'CONTACTS' ? 'active-icon' : ''}`} onClick={() => setActiveTab("CONTACTS")}>
          <div className="wa-contacts-icon">👤</div>
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
