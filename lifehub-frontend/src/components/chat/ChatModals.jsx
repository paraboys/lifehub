import React, { useState } from "react";
import { useChatContext } from "./ChatContext";
import { CallIcon } from "./ChatIcons";
import { initials, formatTime } from "./ChatUtils";

// Normalize phone before sending to backend
// 10-digit → prepend +91 (India); if already has country code digits, prepend +
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return String(raw || "").trim();
}

export default function ChatModals() {
  const { 
    isAddContactOpen, setIsAddContactOpen, incomingReqs, api, fetchContactsAndReqs, fetchConversations,
    searchPhone, setSearchPhone, searchResult, setSearchResult, searchLoading, setSearchLoading,
    isGroupModalOpen, setIsGroupModalOpen,
    activeStory, setActiveStory,
    callProps
  } = useChatContext();

  const [groupPhones, setGroupPhones] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const handleSearchContact = async () => {
    if (!searchPhone.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    setStatusMsg("");
    try {
      const normalized = normalizePhone(searchPhone);
      const data = await api("/chat/contacts/resolve", {
        method: "POST",
        body: JSON.stringify({ phones: [normalized] })
      });
      // API returns { contacts: [...] }
      const contacts = data?.contacts || (Array.isArray(data) ? data : []);
      if (contacts.length > 0) setSearchResult(contacts[0]);
      else setSearchResult({ notFound: true });
    } catch (e) { 
      console.error(e);
      setStatusMsg("Error searching. Check phone format (e.g. +919876543210)");
    }
    setSearchLoading(false);
  };

  const sendFriendRequest = async () => {
    setSendingRequest(true);
    setStatusMsg("");
    try {
      const normalized = normalizePhone(searchPhone);
      await api("/chat/contacts/request", {
        method: "POST",
        body: JSON.stringify({ phone: normalized })
      });
      setStatusMsg("✅ Request sent successfully!");
      setTimeout(() => {
        setIsAddContactOpen(false);
        setSearchPhone("");
        setSearchResult(null);
        setStatusMsg("");
      }, 1200);
      fetchContactsAndReqs();
    } catch(e) { 
      setStatusMsg(`❌ Error: ${e.message}`);
    }
    setSendingRequest(false);
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
      const phones = groupPhones.split(',').map(p => normalizePhone(p.trim())).filter(Boolean);
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
          <div className="wa-modal wa-modal-modern" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h2>💬 New Contact / Chat</h2>
              <button className="wa-icon-btn" onClick={() => setIsAddContactOpen(false)}>✕</button>
            </div>
            
            {incomingReqs.length > 0 && (
              <div className="wa-modal-section">
                <h4 className="wa-section-label">Pending Requests ({incomingReqs.length})</h4>
                {incomingReqs.map(req => (
                   <div key={req.requestId} className="wa-req-row">
                     <div className="wa-req-info">
                       <div className="wa-chat-avatar fallback" style={{width:36,height:36,fontSize:14}}>{initials(req.name)}</div>
                       <div>
                         <strong>{req.name}</strong>
                         <small style={{display:'block',color:'#8696a0'}}>{req.phone}</small>
                       </div>
                     </div>
                     <div style={{display:'flex', gap: 6}}>
                       <button className="wa-btn-accept" onClick={() => respondToRequest(req.requestId, "ACCEPT")}>Accept</button>
                       <button className="wa-btn-reject" onClick={() => respondToRequest(req.requestId, "REJECT")}>Reject</button>
                     </div>
                   </div>
                ))}
              </div>
            )}

            <div className="wa-modal-section" style={{borderTop: incomingReqs.length > 0 ? '1px solid #2a3942' : 'none', paddingTop: incomingReqs.length > 0 ? 16 : 0}}>
              <h4 className="wa-section-label">Add New Contact by Phone</h4>
              <p className="wa-hint" style={{marginBottom: 12}}>Enter phone number with country code (e.g. +919876543210 or 9876543210)</p>
              <div style={{display:'flex', gap: 8}}>
                <input 
                  type="tel" 
                  placeholder="+91 9876543210" 
                  className="wa-search-input" 
                  style={{flex:1, fontSize: 15}}
                  value={searchPhone} 
                  onChange={(e) => setSearchPhone(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter') handleSearchContact(); }}
                />
                <button 
                  className="wa-btn-primary" 
                  onClick={handleSearchContact}
                  disabled={searchLoading || !searchPhone.trim()}
                  style={{minWidth: 80}}
                >
                  {searchLoading ? '⏳' : '🔍 Find'}
                </button>
              </div>
              
              {statusMsg && (
                <p style={{marginTop: 10, fontSize: 13, color: statusMsg.startsWith('✅') ? '#00a884' : '#ef5350'}}>{statusMsg}</p>
              )}
              
              <div className="wa-modal-results" style={{marginTop: 16}}>
                 {searchResult?.notFound ? (
                    <div className="wa-not-found-hint">
                      <span>👤</span>
                      <div>
                        <p>No LifeHub account found.</p>
                        <small>Make sure the number is correct and registered on LifeHub.</small>
                      </div>
                    </div>
                 ) : searchResult ? (
                    <div className="wa-req-row wa-found-user">
                      <div className="wa-req-info">
                        <div className="wa-chat-avatar fallback" style={{width:42,height:42}}>{initials(searchResult.name)}</div>
                        <div>
                          <strong>{searchResult.name}</strong>
                          <small style={{display:'block',color:'#8696a0'}}>{searchResult.phone}</small>
                        </div>
                      </div>
                      {searchResult.contactStatus === "NONE" || !searchResult.contactStatus ? (
                         <button 
                           className="wa-btn-primary" 
                           onClick={sendFriendRequest}
                           disabled={sendingRequest}
                         >
                           {sendingRequest ? '...' : '➕ Add'}
                         </button>
                      ) : (
                         <span className="wa-hint" style={{color: '#00a884', fontWeight: 600}}>
                           {searchResult.contactStatus === 'ACCEPTED' ? '✅ Contact' : 
                            searchResult.contactStatus === 'OUTGOING_PENDING' ? '⏳ Sent' : searchResult.contactStatus}
                         </span>
                      )}
                    </div>
                 ) : (
                    <p className="wa-hint">Search for a LifeHub user by their phone number to send a contact request.</p>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isGroupModalOpen && (
        <div className="wa-modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
          <div className="wa-modal wa-modal-modern" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h2>👥 New Group Chat</h2>
              <button className="wa-icon-btn" onClick={() => setIsGroupModalOpen(false)}>✕</button>
            </div>
            <div className="wa-modal-body">
              <p className="wa-hint">Enter comma-separated phone numbers (min 2 contacts).</p>
              <p className="wa-hint" style={{fontSize: 12, marginTop: 4}}>Example: +919876543210, +919123456789</p>
              <textarea 
                placeholder="+919876543210, +919123456789..." 
                className="wa-message-input" 
                rows={3}
                value={groupPhones} 
                onChange={(e) => setGroupPhones(e.target.value)} 
                style={{marginTop: 10, width: 'calc(100% - 24px)', resize: 'vertical'}}
              />
              <div style={{marginTop: 16, textAlign: 'right'}}>
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
                {callProps.activeCallRoomId ? ' — Connected' : ' — ' + callProps.callSession.status}
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
                    <button onClick={callProps.acceptIncomingCall} style={{backgroundColor: '#00a884', color:'white', padding: '10px 30px', borderRadius: 24, border: 'none', cursor:'pointer'}}>Accept</button>
                    <button onClick={callProps.declineIncomingCall} style={{backgroundColor: '#ef5350', color: 'white', padding: '10px 30px', borderRadius: 24, border: 'none', cursor:'pointer'}}>Decline</button>
                  </>
                ) : (
                  <button onClick={() => callProps.endCurrentCall()} style={{backgroundColor: '#ef5350', color: 'white', padding: '10px 30px', borderRadius: 24, border: 'none', cursor:'pointer'}}>End Call</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
