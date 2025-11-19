import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { openDB } from 'idb';

interface Message {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

interface Community {
  cID: string;
  cName: string;
  joinedPeers: string[];
}

export default function Chatting() {
  const { cID } = useParams<{ cID: string }>();
  const navigate = useNavigate();
  const [communityName, setCommunityName] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch community details
  const fetchCommunityDetails = async (): Promise<void> => {
    try {
      if (!cID) return;
      
      const db = await openDB('p2pchats', 1);
      const community: Community = await db.get('community', cID);
      
      if (community) {
        setCommunityName(community.cName);
      } else {
        // Community not found, redirect back
        navigate('/');
      }
    } catch (error) {
      console.error('Error fetching community details:', error);
      navigate('/');
    }
  };

  // Handle message sending
  const handleSendMessage = (e: React.FormEvent): void => {
    e.preventDefault();
    if (message.trim()) {
      // Add your WebSocket message sending logic here
      console.log('Sending message:', message);
      setMessage('');
    }
  };

  // Handle key press for sending message
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Scroll to bottom when new messages arrive
  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (cID) {
      fetchCommunityDetails();
    }
  }, [cID]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="chatting-container">
      {/* Top Bar */}
      <div className="top-bar">
        <button 
          onClick={() => navigate('/chat')} 
          className="back-button"
          title="Back to sidebar"
        >
          ←
        </button>
        <div className="community-info">
          <h2 className="community-name">{communityName || 'Loading...'}</h2>
          <span className="community-id">ID: {cID}</span>
        </div>
        <div className="online-indicator">
          <div className="online-dot"></div>
          <span className="online-text">Online</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="messages-container">
        <div className="messages-wrapper">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <p className="empty-text">No messages yet</p>
              <p className="empty-subtext">Start a conversation in this community!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="message">
                <div className="message-header">
                  <span className="message-author">{msg.author}</span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="input-container">
        <form onSubmit={handleSendMessage} className="message-form">
          <div className="input-wrapper">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message #${communityName || 'community'}`}
              className="message-input"
              rows={1}
            />
            <button 
              type="submit" 
              className={`send-button ${message.trim() ? 'active' : ''}`}
              disabled={!message.trim()}
            >
              <span className="send-icon">→</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}