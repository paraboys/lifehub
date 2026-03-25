
filepath = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\WhatsAppChat.jsx"

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# ADD STATES FOR GROUPS AND ARCHIVE
state_insertion = r'''
  // Group & Archive States
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupPhones, setGroupPhones] = useState("");
  const [archivedChatIds, setArchivedChatIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wa_archived') || '[]'); } catch(e) { return []; }
  });
  const [showingArchived, setShowingArchived] = useState(false);
  const [activeStory, setActiveStory] = useState(null);

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

  const toggleArchive = (chatId, e) => {
     e.stopPropagation();
     const newArchived = archivedChatIds.includes(chatId) 
       ? archivedChatIds.filter(id => id !== chatId) 
       : [...archivedChatIds, chatId];
     setArchivedChatIds(newArchived);
     localStorage.setItem('wa_archived', JSON.stringify(newArchived));
  };
'''

text = text.replace('const [searchLoading, setSearchLoading] = useState(false);', 'const [searchLoading, setSearchLoading] = useState(false);\n' + state_insertion)

# FILTER CHATS BY ARCHIVE
filter_old = r'''const visibleChats = conversations.filter(c => {
    if (filter === "Unread") return Number(c.unreadCount || 0) > 0;
    if (filter === "Favourites") return false; // Not implemented
    return true;
  });'''

filter_new = r'''const visibleChats = conversations.filter(c => {
    const isArchived = archivedChatIds.includes(c.id);
    if (showingArchived) return isArchived;
    if (isArchived) return false;
    
    if (filter === "Unread") return Number(c.unreadCount || 0) > 0;
    if (filter === "Favourites") return false; // Not implemented
    return true;
  });'''
text = text.replace(filter_old, filter_new)

# ADD ARCHIVED BUTTON TO HEADER
header_old = r'''<div className="wa-list-header">
              <h2>Chats</h2>
              <div className="wa-header-actions">
                <button className="wa-icon-btn" onClick={() => setIsAddContactOpen(true)} title="Add Contact / New Chat">
                  <PlusIcon />
                </button>
                <button className="wa-icon-btn"><MenuIcon /></button>
              </div>
            </div>'''
            
header_new = r'''<div className="wa-list-header">
              <h2>{showingArchived ? 'Archived' : 'Chats'}</h2>
              <div className="wa-header-actions">
                {showingArchived ? (
                   <button className="wa-icon-btn" onClick={() => setShowingArchived(false)} title="Back to Chats">X</button>
                ) : (
                   <>
                     <button className="wa-icon-btn" onClick={() => setShowingArchived(true)} title="Archived Chats" style={{fontSize: 12}}>A</button>
                     <button className="wa-icon-btn" onClick={() => setIsGroupModalOpen(true)} title="New Group">G</button>
                     <button className="wa-icon-btn" onClick={() => setIsAddContactOpen(true)} title="Add Contact / New Chat">
                       <PlusIcon />
                     </button>
                   </>
                )}
              </div>
            </div>'''
text = text.replace(header_old, header_new)

# ADD ARCHIVE TOGGLE TO CHAT ROW
chat_row_old = r'''<div className="wa-chat-bottom-row">
                       <span className="wa-chat-msg">{chat.lastMessage?.content || "Tap to chat"}</span>
                       {unread > 0 && <span className="wa-unread-badge">{unread}</span>}
                     </div>'''

chat_row_new = r'''<div className="wa-chat-bottom-row">
                       <span className="wa-chat-msg">{chat.lastMessage?.content || "Tap to chat"}</span>
                       <div style={{display:'flex', gap: 5, alignItems:'center'}}>
                         {unread > 0 && <span className="wa-unread-badge">{unread}</span>}
                         <button onClick={(e) => toggleArchive(chat.id, e)} style={{background: 'none', border:'none', cursor:'pointer', color:'#8696a0'}} title={showingArchived ? "Unarchive" : "Archive"}>A</button>
                       </div>
                     </div>'''
text = text.replace(chat_row_old, chat_row_new)

# ADD GROUP MODAL & STORY MODAL TO RENDER BOTTOM
modals_append = r'''
      {/* Group Modal */}
      {isGroupModalOpen && (
        <div className="wa-modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <h2>New Group</h2>
              <button className="wa-icon-btn" onClick={() => setIsGroupModalOpen(false)}>X</button>
            </div>
            <div className="wa-modal-body">
              <p className="wa-hint">Enter comma-separated phone numbers of contacts you want to add to the group.</p>
              <input 
                type="text" 
                placeholder="e.g. +919876543210, +919876543211" 
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

      {/* Story Viewer Modal */}
      {activeStory && (
        <div className="wa-modal-overlay" onClick={() => setActiveStory(null)} style={{backgroundColor: '#000', zIndex: 9999}}>
          <button className="wa-icon-btn" style={{position:'absolute', top: 20, right: 20, color: 'white'}} onClick={() => setActiveStory(null)}>X</button>
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
'''

text = text.replace('    </div>\n  );\n}', modals_append + '\n    </div>\n  );\n}')

# UPDATE STORY ITEM CLICK
story_old = r'''<div key={story.id} className="wa-status-item">'''
story_new = r'''<div key={story.id} className="wa-status-item" onClick={() => setActiveStory(story)}>'''
text = text.replace(story_old, story_new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Group and Archive features patched safely without emojis.")
