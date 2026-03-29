import React from "react";

const EMOJI_CATEGORIES = [
  { name: "Smileys", emojis: ["😀","😂","🤣","😊","😍","🥰","😘","😋","😎","😢","😭","😡","🤬","🤯","😱","🥶","🤢","🤮","🤒","🤡","🥳","🥴","🥵","🥺","🥰","🤫","🤭","🧐","🤓"] },
  { name: "Gestures", emojis: ["👍","👎","👌","✌️","🤞","🫰","🤟","🤘","🤙","🖐️","✋","🖖","👋","👏","🙌","👐","🤲","🤝","🙏","✍️","💪","🦾","🖕","🖕","💅"] },
  { name: "Hearts", emojis: ["❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟"] }
];

export default function ChatEmojiPicker({ onEmojiSelect, onClose }) {
  return (
    <div className="wa-emoji-picker-container shadow">
      <div className="emoji-picker-header">
        <span>Select an Emoji</span>
        <button onClick={onClose} className="wa-icon-btn filled" style={{width: 24, height: 24, padding: 0}}>✕</button>
      </div>
      <div className="emoji-picker-body modern-scroll">
        {EMOJI_CATEGORIES.map(cat => (
          <div key={cat.name} className="emoji-category">
            <div className="emoji-category-title">{cat.name}</div>
            <div className="emoji-grid">
              {cat.emojis.map(emoji => (
                <button key={emoji} className="emoji-btn" onClick={() => onEmojiSelect(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
