import React from "react";
import { useChatContext } from "./ChatContext";
import { initials } from "./ChatUtils";

export default function ChatContactsPane() {
  const { contacts, setSelectedChat, setActiveTab, fetchMessages, setMessages, api } = useChatContext();

  const handleStartChat = async (contact) => {
    try {
      const data = await api("/chat/conversations/by-phone", "POST", { phone: contact.phone });
      if (data && data.conversation) {
        setSelectedChat(data.conversation);
        setMessages([]);
        fetchMessages(data.conversation.id);
        setActiveTab("CHATS");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="wa-contacts-pane">
       <div className="wa-list-header">
          <h2>Contacts</h2>
       </div>
       <div className="wa-chat-list">
          {contacts.length === 0 && <div className="wa-empty-hint">No contacts yet. Add some!</div>}
          {contacts.map(contact => (
            <div key={contact.id} className="wa-chat-item" onClick={() => handleStartChat(contact)}>
               <div className="wa-chat-avatar-wrapper">
                  <div className="wa-chat-avatar fallback">{initials(contact.name)}</div>
               </div>
               <div className="wa-chat-info">
                  <div className="wa-chat-top-row">
                     <span className="wa-chat-name">{contact.name}</span>
                  </div>
                  <div className="wa-chat-bottom-row">
                     <span className="wa-chat-msg">{contact.phone}</span>
                  </div>
               </div>
            </div>
          ))}
       </div>
    </div>
  );
}
