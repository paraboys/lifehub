import os

base_dir = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\chat"

# 6. ChatWindow.jsx
window_content = r'''import React, { useState } from "react";
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
'''
with open(os.path.join(base_dir, "ChatWindow.jsx"), "w", encoding="utf-8") as f: f.write(window_content)

# 7. ChatStatusPane.jsx
status_content = r'''import React, { useState } from "react";
import { useChatContext } from "./ChatContext";
import { StatusIcon, PlusIcon, MenuIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";

export default function ChatStatusPane() {
  const { user, stories, setActiveStory, api, fetchStories } = useChatContext();
  const [newStoryContent, setNewStoryContent] = useState("");

  const handlePostStory = async () => {
    if (!newStoryContent.trim()) return;
    try {
      await api("/chat/stories", {
        method: "POST",
        body: JSON.stringify({ content: newStoryContent })
      });
      setNewStoryContent("");
      fetchStories();
    } catch (e) { alert("Error posting status"); }
  };

  return (
    <>
      <div className="wa-list-header">
        <h2>Status</h2>
        <div className="wa-header-actions">
          <button className="wa-icon-btn"><PlusIcon /></button>
          <button className="wa-icon-btn"><MenuIcon /></button>
        </div>
      </div>
      <div className="wa-status-my">
         <div className="wa-status-item">
           <div className="wa-status-avatar-ring own">
              {user?.avatar ? <img src={user.avatar} alt="My Status" /> : <div className="wa-status-placeholder">{initials(user?.name)}</div>}
              <div className="wa-status-add-badge">+</div>
           </div>
           <div className="wa-status-info">
             <div className="wa-status-name">My status</div>
             <div className="wa-status-time">Click to add status update</div>
           </div>
         </div>
      </div>
      <div className="wa-status-section-title">Recent Updates</div>
      <div className="wa-status-list">
         {stories.map(story => (
           <div key={story.id} className="wa-status-item" onClick={() => setActiveStory(story)}>
             <div className="wa-status-avatar-ring">
               {story.userAvatar ? <img src={story.userAvatar} alt={story.userName} /> : <div className="wa-status-placeholder">{initials(story.userName)}</div>}
             </div>
             <div className="wa-status-info">
               <div className="wa-status-name">{story.userName}</div>
               <div className="wa-status-time">{formatTime(story.createdAt)} - {story.content}</div>
             </div>
           </div>
         ))}
         {stories.length === 0 && <p className="wa-hint" style={{padding: 16}}>No recent updates.</p>}
      </div>
      
      {/* Creation Pane below it since Status Panel takes full pane */}
      <div style={{padding: 24, borderTop: '1px solid #202c33', display: 'flex', flexDirection: 'column', gap: 10}}>
         <h4 style={{margin: 0, color: '#e9edef'}}>Post a new status</h4>
         <div style={{display: 'flex', gap: 10}}>
           <input 
             type="text" 
             className="wa-message-input" 
             placeholder="Type a status..." 
             value={newStoryContent}
             onChange={e => setNewStoryContent(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') handlePostStory(); }}
             style={{flex: 1}}
           />
           <button className="wa-btn-primary" onClick={handlePostStory}>Post</button>
         </div>
      </div>
    </>
  );
}
'''
with open(os.path.join(base_dir, "ChatStatusPane.jsx"), "w", encoding="utf-8") as f: f.write(status_content)

# 8. ChatModals.jsx
modals_content = r'''import React, { useState } from "react";
import { useChatContext } from "./ChatContext";
import { CallIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";

export default function ChatModals() {
  const { 
    isAddContactOpen, setIsAddContactOpen, incomingReqs, api, fetchContactsAndReqs, fetchConversations,
    searchPhone, setSearchPhone, searchResult, setSearchResult, searchLoading, setSearchLoading,
    isGroupModalOpen, setIsGroupModalOpen,
    activeStory, setActiveStory,
    callProps
  } = useChatContext();

  const [groupPhones, setGroupPhones] = useState("");

  const handleSearchContact = async () => {
    if (!searchPhone) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const data = await api("/chat/contacts/resolve", {
        method: "POST",
        body: JSON.stringify({ phones: [searchPhone] })
      });
      if (data && data.length > 0) setSearchResult(data[0]);
      else setSearchResult({ notFound: true });
    } catch (e) { console.error(e); }
    setSearchLoading(false);
  };

  const sendFriendRequest = async () => {
    try {
      await api("/chat/contacts/request", {
        method: "POST",
        body: JSON.stringify({ phone: searchPhone })
      });
      alert("Request sent successfully!");
      setIsAddContactOpen(false);
      setSearchPhone("");
      setSearchResult(null);
      fetchContactsAndReqs();
    } catch(e) { alert("Error sending request: " + e.message); }
  };

  const respondToRequest = async (requestId, action) => {
    try {
      await api(`/chat/contacts/requests/${requestId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      fetchContactsAndReqs();
      fetchConversations();
    } catch(e) { console.error(e); }
  };

  const handleCreateGroup = async () => {
    if (!groupPhones) return;
    try {
      const phones = groupPhones.split(',').map(p => p.trim()).filter(Boolean);
      await api("/chat/conversations/group-by-phones", {
        method: "POST",
        body: JSON.stringify({ phones })
      });
      setIsGroupModalOpen(false);
      setGroupPhones("");
      fetchConversations();
    } catch(e) { alert("Error creating group: " + e.message); }
  };

  return (
    <>
      {isAddContactOpen && (
        <div className="wa-modal-overlay" onClick={() => setIsAddContactOpen(false)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h2>New Chat / Contacts</h2>
              <button className="wa-icon-btn" onClick={() => setIsAddContactOpen(false)}>✕</button>
            </div>
            
            <div className="wa-modal-tabs">
              <h4>Pending Requests ({incomingReqs.length})</h4>
              {incomingReqs.map(req => (
                 <div key={req.requestId} className="wa-req-row">
                   <div><strong>{req.name}</strong><small>{req.phone}</small></div>
                   <div style={{display:'flex', gap: 5}}>
                     <button className="wa-btn-primary" onClick={() => respondToRequest(req.requestId, "ACCEPT")}>Accept</button>
                     <button className="wa-btn-secondary" onClick={() => respondToRequest(req.requestId, "REJECT")}>Reject</button>
                   </div>
                 </div>
              ))}
            </div>

            <div className="wa-modal-body" style={{borderTop: '1px solid #313d45'}}>
              <h4>Add New Contact</h4>
              <div style={{display:'flex', gap: 10, marginTop:10}}>
                <input 
                  type="text" 
                  placeholder="Enter phone number..." 
                  className="wa-search-input" 
                  style={{border: '1px solid #313d45'}}
                  value={searchPhone} 
                  onChange={(e) => setSearchPhone(e.target.value)} 
                />
                <button className="wa-btn-primary" onClick={handleSearchContact}>{searchLoading ? '...' : 'Search'}</button>
              </div>
              
              <div className="wa-modal-results" style={{marginTop: 20}}>
                 {searchResult?.notFound ? (
                    <p className="wa-hint">No user found with this number.</p>
                 ) : searchResult ? (
                    <div className="wa-req-row">
                      <div><strong>{searchResult.name}</strong><small>{searchResult.phone}</small></div>
                      {searchResult.contactStatus === "NONE" ? (
                         <button className="wa-btn-primary" onClick={sendFriendRequest}>Add Contact</button>
                      ) : (
                         <span className="wa-hint" style={{color: '#00a884'}}>{searchResult.contactStatus}</span>
                      )}
                    </div>
                 ) : (
                    <p className="wa-hint">Search for friends registered on LifeHub to start chatting.</p>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isGroupModalOpen && (
        <div className="wa-modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h2>New Group</h2>
              <button className="wa-icon-btn" onClick={() => setIsGroupModalOpen(false)}>✕</button>
            </div>
            <div className="wa-modal-body">
              <p className="wa-hint">Enter comma-separated phone numbers of contacts.</p>
              <input 
                type="text" 
                placeholder="e.g. +919876543210" 
                className="wa-message-input" 
                value={groupPhones} 
                onChange={(e) => setGroupPhones(e.target.value)} 
                style={{marginTop: 10, width: 'calc(100% - 24px)'}}
              />
              <div style={{marginTop: 20, textAlign: 'right'}}>
                 <button className="wa-btn-primary" onClick={handleCreateGroup}>Create Group</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeStory && (
        <div className="wa-modal-overlay" onClick={() => setActiveStory(null)} style={{backgroundColor: '#000', zIndex: 9999}}>
          <button className="wa-icon-btn" style={{position:'absolute', top: 20, right: 20, color: 'white'}} onClick={() => setActiveStory(null)}>✕</button>
          <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
             <div style={{display: 'flex', alignItems: 'center', gap: 10, position: 'absolute', top: 20, left: 20}}>
                {activeStory.userAvatar ? <img src={activeStory.userAvatar} alt="avatar" style={{width:40, height:40, borderRadius:'50%'}} /> : <div className="wa-chat-avatar fallback" style={{width:40, height:40}}>{initials(activeStory.userName)}</div>}
                <strong style={{color: 'white', fontSize: 18}}>{activeStory.userName}</strong>
                <small style={{color: '#aebac1'}}>{formatTime(activeStory.createdAt)}</small>
             </div>
             <div style={{color: 'white', fontSize: 36, textAlign: 'center', maxWidth: '80%', padding: 40, backgroundColor: '#202c33', borderRadius: 16}}>
                {activeStory.content}
             </div>
          </div>
        </div>
      )}

      {callProps?.callSession?.open && (
        <div className="wa-modal-overlay" style={{zIndex: 9999}}>
          <div className="wa-modal" style={{width: 500, backgroundColor: '#0b141a', textAlign: 'center'}}>
            <div className="wa-modal-header" style={{borderBottom: 'none'}}>
              <h2 style={{width: '100%'}}>
                {callProps.callSession.type === "audio" ? "Audio Call" : "Video Call"} 
                {callProps.activeCallRoomId ? ' - Connected' : ' - ' + callProps.callSession.status}
              </h2>
            </div>
            <div className="wa-modal-body" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20}}>
              {callProps.callSession.type === "video" && (
                <div style={{display: 'flex', gap: 10, width: '100%', justifyContent: 'center'}}>
                  <div style={{flex: 1, backgroundColor: '#202c33', borderRadius: 8, overflow: 'hidden', minHeight: 150, position: 'relative'}}>
                     <span style={{position: 'absolute', bottom: 5, left: 10, fontSize: 12}}>You</span>
                     <video ref={callProps.localVideoRef} autoPlay muted playsInline style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  </div>
                  <div style={{flex: 1, backgroundColor: '#202c33', borderRadius: 8, overflow: 'hidden', minHeight: 150, position: 'relative'}}>
                     <span style={{position: 'absolute', bottom: 5, left: 10, fontSize: 12}}>Peer</span>
                     <video ref={callProps.remoteVideoRef} autoPlay playsInline style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  </div>
                </div>
              )}
              {callProps.callSession.type === "audio" && (
                <div style={{width: 100, height: 100, borderRadius: '50%', backgroundColor: '#202c33', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '30px 0'}}>
                   <CallIcon />
                   <video ref={callProps.localVideoRef} autoPlay muted playsInline style={{display:'none'}} />
                   <video ref={callProps.remoteVideoRef} autoPlay playsInline style={{display:'none'}} />
                </div>
              )}
              
              <div style={{display: 'flex', gap: 20}}>
                {callProps.callSession.status === "incoming" ? (
                  <>
                    <button onClick={callProps.acceptIncomingCall} className="wa-btn-primary" style={{backgroundColor: '#00a884', padding: '10px 30px', borderRadius: 24, border: 'none'}}>Accept</button>
                    <button onClick={callProps.declineIncomingCall} className="wa-btn-secondary" style={{backgroundColor: '#ef5350', color: 'white', padding: '10px 30px', borderRadius: 24, border: 'none'}}>Decline</button>
                  </>
                ) : (
                  <button onClick={() => callProps.endCurrentCall()} className="wa-btn-secondary" style={{backgroundColor: '#ef5350', color: 'white', padding: '10px 30px', borderRadius: 24, border: 'none'}}>End Call</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
'''
with open(os.path.join(base_dir, "ChatModals.jsx"), "w", encoding="utf-8") as f: f.write(modals_content)

# 9. ChatApp.jsx
app_content = r'''import React from "react";
import { ChatProvider, useChatContext } from "./ChatContext";
import ChatSidebar from "./ChatSidebar";
import ChatListPane from "./ChatListPane";
import ChatWindow from "./ChatWindow";
import ChatStatusPane from "./ChatStatusPane";
import ChatModals from "./ChatModals";
import "../WhatsAppChat.css";

function ChatAppContent() {
  const { activeTab, selectedChat } = useChatContext();
  
  return (
    <div className="wa-app-container">
      <ChatSidebar />
      <div className="wa-list-panel">
         {activeTab === 'CHATS' ? <ChatListPane /> : <ChatStatusPane />}
      </div>
      <div className={`wa-main-panel ${selectedChat ? 'active' : ''}`}>
         {activeTab === 'CHATS' ? <ChatWindow /> : <div className="wa-empty-chat-state"><h1>Status</h1><p>Watch updates from your friends.</p></div>}
      </div>
      <ChatModals />
    </div>
  );
}

export default function ChatApp({ api, user, callProps }) {
  return (
    <ChatProvider api={api} user={user} callProps={callProps}>
      <ChatAppContent />
    </ChatProvider>
  );
}
'''
with open(os.path.join(base_dir, "ChatApp.jsx"), "w", encoding="utf-8") as f: f.write(app_content)

print("Created remaining components. Checking syntax.")
