import React from "react";
import { Inbox } from "lucide-react";

// Shown when a list or chart has no data yet.
export default function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        <Icon size={26} />
      </div>
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}
