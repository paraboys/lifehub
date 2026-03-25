import os

css_to_append = """
/* Contact Request specific CSS */
.wa-modal-tabs {
  padding: 16px 24px;
}

.wa-modal-tabs h4, .wa-modal-body h4 {
  margin: 0 0 10px 0;
  color: #00a884;
  font-weight: 500;
  font-size: 14px;
}

.wa-req-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #202c33;
}

.wa-req-row:last-child {
  border-bottom: none;
}

.wa-req-row strong {
  display: block;
  font-size: 15px;
  color: #e9edef;
}

.wa-req-row small {
  display: block;
  font-size: 13px;
  color: #8696a0;
}

.wa-btn-primary {
  background-color: #00a884;
  color: #111b21;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
}

.wa-btn-secondary {
  background-color: transparent;
  color: #f15c6d;
  border: 1px solid #f15c6d;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
}

.wa-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: #667781;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
}

.wa-active-icon svg {
  color: #00a884 !important;
}

.wa-date-divider {
  text-align: center;
  margin: 10px 0;
}

.wa-date-divider span {
  background-color: #182229;
  color: #8696a0;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 8px;
  display: inline-block;
  box-shadow: 0 1px 0.5px rgba(11,20,26,.13);
}

.wa-requests-banner {
  background-color: #0b141a;
  color: #00a884;
  padding: 12px 16px;
  text-align: center;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
  border-bottom: 1px solid #202c33;
}

.wa-requests-banner:hover {
  background-color: #202c33;
}

.wa-chat-avatar-wrapper {
  width: 49px;
  height: 49px;
  margin-right: 15px;
  flex-shrink: 0;
}

.wa-chat-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.wa-chat-avatar.fallback {
  background-color: #667781;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
}
"""

filepath = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\WhatsAppChat.css"
with open(filepath, 'a', encoding='utf-8') as f:
    f.write(css_to_append)
print("CSS patched.")
