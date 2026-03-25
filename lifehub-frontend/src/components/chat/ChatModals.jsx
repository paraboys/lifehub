import React, { useState } from "react";
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
