import React, { useState } from "react";
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
