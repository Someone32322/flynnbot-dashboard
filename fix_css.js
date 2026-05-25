const fs = require('fs');
const path = require('path');
const file = path.join('c:/Users/lone8/Downloads/Flynn/flynnbot-dashboard/public/css/dash2.css');
let content = fs.readFileSync(file, 'utf8');

// Find the start of the block
const startIdx = content.indexOf('/* ============================================================\r\n   CUSTOM COMMANDS SUB-NAVIGATION');

// Only keep everything up to startIdx and append the fixed version
const prefix = content.substring(0, startIdx);
const suffixIdx = content.lastIndexOf('/* Sub-nav header colors */');
const suffix = content.substring(suffixIdx);

const newBlock = \/* ============================================================
   MODULE SUB-NAVIGATION
   ============================================================ */

/* Hidden by default */
.module-sub-nav {
  display: none;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 8px 12px 12px;
  animation: sidebarSlideIn 0.22s cubic-bezier(0.4, 0, 0.2, 1) both;
}

#dashSidebar.module-mode .sidebar-nav { display: none; }
/* When JS applies flex inline style, it will show */

/* Back button */
.module-sub-back {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-3);
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.module-sub-back:hover {
  background: rgba(148, 163, 184, 0.08);
  color: var(--text);
  border-color: var(--card-border);
}
.module-sub-back svg { flex-shrink: 0; }

/* Module header (icon + name) */
.module-sub-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 10px 12px;
  border-bottom: 1px solid var(--card-border);
  margin-bottom: 10px;
}
.module-sub-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a78bfa;
  flex-shrink: 0;
}
.module-sub-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

/* Sub-nav items */
.module-sub-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.module-sub-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s var(--ease);
}
.module-sub-item:hover {
  background: rgba(139, 92, 246, 0.07);
  color: var(--text);
  border-color: var(--card-border);
}
.module-sub-item.active {
  background: rgba(139, 92, 246, 0.12);
  border-color: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  box-shadow: inset 3px 0 0 #8b5cf6;
}
.module-item-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-3);
  transition: color 0.18s;
}
.module-sub-item.active .module-item-icon { color: #a78bfa; }
.module-sub-item:hover  .module-item-icon { color: var(--text-2); }

\;

fs.writeFileSync(file, prefix + newBlock + suffix);
console.log('Fixed CSS class names and removed duplicates.');
