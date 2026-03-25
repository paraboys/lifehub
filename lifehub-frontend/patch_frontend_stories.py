
import re

filepath = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\WhatsAppChat.jsx"

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# ADD STATES
state_insertion = r'''
  const [stories, setStories] = useState([]);
  const [newStoryContent, setNewStoryContent] = useState("");
  const fetchStories = async () => {
    try {
      const data = await api("/chat/stories");
      if (data && data.stories) {
        setStories(data.stories);
      }
    } catch (e) { console.error(e); }
  };
  
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

'''
text = text.replace('const [searchLoading, setSearchLoading] = useState(false);', 'const [searchLoading, setSearchLoading] = useState(false);\n' + state_insertion)

# ADD EFFECT
text = text.replace('fetchConversations();', 'fetchConversations();\n    fetchStories();', 1)

# REPLACE STATUS PANEL UI
status_ui_old = r'''<div className="wa-status-list">
               <p className="wa-hint" style={{padding: 16}}>No recent updates.</p>
            </div>'''
            
status_ui_new = r'''<div className="wa-status-list">
               {stories.map(story => (
                 <div key={story.id} className="wa-status-item">
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
            </div>'''
            
text = text.replace(status_ui_old, status_ui_new)

# REPLACE STATUS CREATION UI
status_viewer_old = r'''<div className="wa-status-viewer-placeholder">
             <div className="wa-status-ring-large"><StatusIcon /></div>
             <h2>Share status updates</h2>
             <p>Share photos, videos and text that disappear after 24 hours.</p>
           </div>'''

status_viewer_new = r'''<div className="wa-status-viewer-placeholder">
             <div className="wa-status-ring-large"><StatusIcon /></div>
             <h2>Share status updates</h2>
             <p>Share photos, videos and text that disappear after 24 hours.</p>
             <div style={{marginTop: 20, display: 'flex', gap: 10, width: '60%', maxWidth: 400}}>
                <input 
                  type="text" 
                  className="wa-message-input" 
                  placeholder="Type a status..." 
                  value={newStoryContent}
                  onChange={e => setNewStoryContent(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handlePostStory(); }}
                />
                <button className="wa-btn-primary" onClick={handlePostStory}>Post</button>
             </div>
           </div>'''

text = text.replace(status_viewer_old, status_viewer_new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("WhatsAppChat patched with stories fully.")
