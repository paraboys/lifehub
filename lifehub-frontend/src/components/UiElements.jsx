import React from "react";

export function UiIcon({ name, size = 18 }) {
  const style = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  let nodes = null;
  switch (name) {
    case "chat":
      nodes = (
        <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" {...style} />
      );
      break;
    case "home":
      nodes = (
        <>
          <path d="M3 10.5 12 3l9 7.5v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" {...style} />
        </>
      );
      break;
    case "bell":
      nodes = (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" {...style} />
          <path d="M10 21a2 2 0 0 0 4 0" {...style} />
        </>
      );
      break;
    case "cart":
      nodes = (
        <>
          <circle cx="9" cy="20" r="1.8" {...style} />
          <circle cx="18" cy="20" r="1.8" {...style} />
          <path d="M3 4h2l2.3 10.2A2 2 0 0 0 9.3 16H19a2 2 0 0 0 2-1.6L22 8H7" {...style} />
        </>
      );
      break;
    case "tool":
      nodes = <path d="M15 6a4 4 0 0 0-5 5L4 17a2 2 0 0 0 3 3l6-6a4 4 0 0 0 5-5l-3 3-2-2 3-3z" {...style} />;
      break;
    case "store":
      nodes = (
        <>
          <path d="M3 7h18l-2 4H5L3 7z" {...style} />
          <path d="M5 11v9h14v-9" {...style} />
          <path d="M9 20v-6h6v6" {...style} />
        </>
      );
      break;
    case "settings":
      nodes = (
        <>
          <circle cx="12" cy="12" r="3" {...style} />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.2a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.2a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.2a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" {...style} />
        </>
      );
      break;
    case "wallet":
      nodes = (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" ry="2" {...style} />
          <path d="M17 12h4" {...style} />
          <circle cx="16" cy="12" r="1" {...style} />
        </>
      );
      break;
    case "user":
      nodes = (
        <>
          <circle cx="12" cy="8" r="4" {...style} />
          <path d="M4 20a8 8 0 0 1 16 0" {...style} />
        </>
      );
      break;
    case "chart":
      nodes = (
        <>
          <path d="M4 19h16" {...style} />
          <path d="M6 16V9" {...style} />
          <path d="M12 16V5" {...style} />
          <path d="M18 16v-7" {...style} />
        </>
      );
      break;
    case "shield":
      nodes = (
        <>
          <path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z" {...style} />
        </>
      );
      break;
    case "sun":
      nodes = (
        <>
          <circle cx="12" cy="12" r="4" {...style} />
          <path d="M12 2v3" {...style} />
          <path d="M12 19v3" {...style} />
          <path d="M4.9 4.9l2.1 2.1" {...style} />
          <path d="M17 17l2.1 2.1" {...style} />
          <path d="M2 12h3" {...style} />
          <path d="M19 12h3" {...style} />
          <path d="M4.9 19.1 7 17" {...style} />
          <path d="M17 7l2.1-2.1" {...style} />
        </>
      );
      break;
    case "moon":
      nodes = (
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5z" {...style} />
      );
      break;
    case "refresh":
      nodes = (
        <>
          <polyline points="23 4 23 10 17 10" {...style} />
          <polyline points="1 20 1 14 7 14" {...style} />
          <path d="M3.5 9a9 9 0 0 1 15.5-3L23 10M1 14l4 4a9 9 0 0 0 15.5-3" {...style} />
        </>
      );
      break;
    case "plus":
      nodes = (
        <>
          <line x1="12" y1="5" x2="12" y2="19" {...style} />
          <line x1="5" y1="12" x2="19" y2="12" {...style} />
        </>
      );
      break;
    case "dots":
      nodes = (
        <>
          <circle cx="5" cy="12" r="1.4" {...style} />
          <circle cx="12" cy="12" r="1.4" {...style} />
          <circle cx="19" cy="12" r="1.4" {...style} />
        </>
      );
      break;
    case "search":
      nodes = (
        <>
          <circle cx="11" cy="11" r="7" {...style} />
          <line x1="20" y1="20" x2="16.7" y2="16.7" {...style} />
        </>
      );
      break;
    case "video":
      nodes = (
        <>
          <rect x="2" y="7" width="14" height="10" rx="2" ry="2" {...style} />
          <polygon points="16 10 22 7 22 17 16 14 16 10" {...style} />
        </>
      );
      break;
    case "phone":
      nodes = (
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.9 19.9 0 0 1-8.7-3.1A19.6 19.6 0 0 1 5 12.7 19.8 19.8 0 0 1 1.9 4 2 2 0 0 1 3.9 1.8h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8 9.7a16 16 0 0 0 6.3 6.3l1.2-1.2a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.5 1.8z" {...style} />
      );
      break;
    case "attach":
      nodes = <path d="M21.4 11.5l-8.7 8.7a6 6 0 1 1-8.5-8.5l8.7-8.7a4 4 0 0 1 5.7 5.7l-8.8 8.8a2 2 0 1 1-2.8-2.8l8-8" {...style} />;
      break;
    case "emoji":
      nodes = (
        <>
          <circle cx="12" cy="12" r="9" {...style} />
          <circle cx="9" cy="10" r="0.9" {...style} />
          <circle cx="15" cy="10" r="0.9" {...style} />
          <path d="M8 14c1 1.4 2.4 2 4 2s3-.6 4-2" {...style} />
        </>
      );
      break;
    case "send":
      nodes = (
        <>
          <path d="M22 2L11 13" {...style} />
          <path d="M22 2L15 22l-4-9-9-4 20-7z" {...style} />
        </>
      );
      break;
    case "check":
      nodes = <polyline points="20 7 9 18 4 13" {...style} />;
      break;
    case "download":
      nodes = (
         <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...style} />
          <polyline points="7 10 12 15 17 10" {...style} />
          <line x1="12" y1="15" x2="12" y2="3" {...style} />
         </>
      );
      break;
    default:
      nodes = <circle cx="12" cy="12" r="8" {...style} />;
  }

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {nodes}
    </svg>
  );
}