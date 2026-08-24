import React from 'react';
import { Plus, Users, Radio } from 'lucide-react';

export default function Navbar({ status, onlineCount, userName, userColor, onAddNote }) {
  const getStatusDisplay = () => {
    switch (status) {
      case 'CONNECTED':
        return { label: 'Connected', class: 'status-connected' };
      case 'CONNECTING':
        return { label: 'Connecting...', class: 'status-connecting' };
      case 'DISCONNECTED':
      default:
        return { label: 'Disconnected', class: 'status-disconnected' };
    }
  };

  const statusInfo = getStatusDisplay();

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <div className="brand-icon">📌</div>
        <span className="brand-title">SyncBoard</span>
      </div>

      <div className="navbar-controls">
        {/* Status indicator */}
        <div className={`status-pill ${statusInfo.class}`}>
          <div className="status-dot"></div>
          <span>{statusInfo.label}</span>
        </div>

        {/* Online User Count */}
        <div className="users-count-pill">
          <Users size={16} />
          <span>{onlineCount} {onlineCount === 1 ? 'user' : 'users'} online</span>
        </div>

        {/* Current User Badge */}
        {userName && (
          <div className="user-tag-pill" style={{ backgroundColor: userColor || '#6366f1' }}>
            <Radio size={14} />
            <span>You: {userName}</span>
          </div>
        )}

        {/* Add Note Button */}
        <button className="btn-add-note" onClick={onAddNote}>
          <Plus size={18} />
          <span>New Note</span>
        </button>
      </div>
    </header>
  );
}
