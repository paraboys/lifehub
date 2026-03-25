import os

def patch_calls():
    # 1. Patch SuperAppPage.jsx to pass call props
    superapp = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\SuperAppPage.jsx"
    with open(superapp, 'r', encoding='utf-8') as f:
        s_text = f.read()
        
    old_render = "return <WhatsAppChat api={api} user={{ id: user?.id, name: user?.name, phone: user?.phone, avatar: profilePhoto }} />;"
    new_render = """return <WhatsAppChat 
      api={api} 
      user={{ id: user?.id, name: user?.name, phone: user?.phone, avatar: profilePhoto }} 
      callProps={{ callSession, acceptIncomingCall, declineIncomingCall, endCurrentCall, startInstantCall, localVideoRef, remoteVideoRef, activeCallRoomId }}
    />;"""
    
    if old_render in s_text:
        s_text = s_text.replace(old_render, new_render)
        with open(superapp, 'w', encoding='utf-8') as f:
            f.write(s_text)
        print("SuperAppPage patched for calls.")

    # 2. Patch WhatsAppChat.jsx to receive and render call props
    wachat = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\WhatsAppChat.jsx"
    with open(wachat, 'r', encoding='utf-8') as f:
        w_text = f.read()
        
    # Replace the component signature
    w_text = w_text.replace(
        "export default function WhatsAppChat({ api, user }) {", 
        "export default function WhatsAppChat({ api, user, callProps }) {"
    )
    
    # Replace the CallIcon click handler
    w_text = w_text.replace(
        '<button className="wa-icon-btn"><CallIcon /></button>',
        '<button className="wa-icon-btn" onClick={() => callProps?.startInstantCall("video")}><CallIcon /></button>'
    )
    
    # Insert call UI at the end
    call_ui = """
      {/* Call Overlay UI */}
      {callProps?.callSession?.open && (
        <div className="wa-modal-overlay">
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
                   {/* hidden elements just for stream */}
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
    </div>
  );
}
"""
    w_text = w_text.replace("    </div>\n  );\n}", call_ui)
    
    with open(wachat, 'w', encoding='utf-8') as f:
        f.write(w_text)
    print("WhatsAppChat patched for calls.")

patch_calls()
