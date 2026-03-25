import os

def patch_file():
    filepath = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-frontend\src\components\SuperAppPage.jsx"
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    start_idx = -1
    end_idx = -1
    
    for i, line in enumerate(lines):
        if "function renderChatTab()" in line:
            start_idx = i
        if start_idx != -1 and "function renderMarketplaceTab()" in line:
            end_idx = i - 1
            break
            
    if start_idx != -1 and end_idx != -1:
        new_render = """  function renderChatTab() {
    return <WhatsAppChat api={api} user={{ id: user?.id, name: user?.name, phone: user?.phone, avatar: profilePhoto }} />;
  }\n
"""
        # Replace the slice
        lines[start_idx:end_idx+1] = [new_render]
        
        # Insert import
        for i, line in enumerate(lines):
            if line.startswith("import { StoryBar, AddContactModal"):
                lines.insert(i + 1, 'import WhatsAppChat from "./WhatsAppChat.jsx";\n')
                break
                
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print("Patched successfully.")
    else:
        print(f"Failed to find indices. Start: {start_idx}, End: {end_idx}")

patch_file()
