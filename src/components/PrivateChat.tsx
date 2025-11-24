// Fixed PrivateChat.tsx with proper message handling and pending messages
import { openDB } from 'idb';
import { useNavigate, useParams } from 'react-router';
import { useState, useEffect } from 'react';
import { useP2P } from '../context/P2PContext';
import { useFedimintWallet } from '../context/fedimint';
import { useCashuWallet } from '../context/cashu';

export default function PrivateChat() {
    const navigate = useNavigate()
    const { chatId } = useParams();

    const [enteredName, setEnteredName] = useState('');
    const [messages, setMessages] = useState<{ from: string; content: string; timestamp: number; type?: string }[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [targetPersistentId, setTargetPersistentId] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

    // Use P2P hook
    const { persistentUserId, sendMessage, isP2PConnected, isConnected } = useP2P();
    
    // Wallet hooks
    const { Fedimintwallet, isFedWalletInitialized } = useFedimintWallet()
    const { CocoManager, isCashuWalletInitialized } = useCashuWallet()

    useEffect(() => {
        if (chatId) {
            setTargetPersistentId(chatId);
            loadDisplayName(chatId);
        }
    }, [chatId]);

    useEffect(() => {
        // Check connection status
        if (isConnected && targetPersistentId) {
            const connected = isP2PConnected(targetPersistentId);
            setConnectionStatus(connected ? 'connected' : 'connecting');
            
            // Send pending messages when connection establishes
            if (connected && persistentUserId) {
                sendPendingMessages();
            }
        } else {
            setConnectionStatus('disconnected');
        }
    }, [isConnected, targetPersistentId, isP2PConnected, persistentUserId]);

    useEffect(() => {
        // Load messages from IndexedDB
        const loadMessages = async () => {
            if (!persistentUserId || !targetPersistentId) return;

            const db = await openDB('p2pchats', 1);
            const record = await db.get('chat', [persistentUserId, targetPersistentId]);

            if (record && record.messages) {
                const messagesWithNames = await Promise.all(
                    record.messages.map(async (msg: any) => {
                        if (msg.from === 'me' || msg.from === persistentUserId) {
                            const myName = await getDisplayName(persistentUserId);
                            return { ...msg, from: myName };
                        }
                        const senderName = await getDisplayName(msg.from);
                        return { ...msg, from: senderName };
                    })
                );
                setMessages(messagesWithNames);
            }
        };

        loadMessages();
    }, [persistentUserId, targetPersistentId]);

    useEffect(() => {
        // Listen for incoming P2P messages
        const handleP2PMessage = async (event: any) => {
            const { from, content, timestamp } = event.detail;

            // Get current chatId from URL params dynamically
            const currentChatId = window.location.pathname.split('/').pop();
            
            console.log('📩 PrivateChat received message:', {
                from,
                currentChatId,
                targetPersistentId,
                match: from === currentChatId || from === targetPersistentId
            });

            // Check if message is from the current chat peer (check both chatId and targetPersistentId)
            if (from === targetPersistentId || from === currentChatId) {
                console.log('✅ Message is from current chat peer, processing...');
                
                // Check if it's an ecash message
                try {
                    const data = JSON.parse(content);
                    
                    if (data.type === 'fedimint' || data.type === 'cashu') {
                        console.log('💰 Received ecash - Main.tsx will handle it');
                        // Ecash is handled by Main.tsx global listener
                        return; // Don't process as text
                    }
                } catch {
                    // Not JSON or not ecash, continue as regular message
                }
                
                // Regular text message
                const senderName = await getDisplayName(from);
                const newMessage = {
                    from: senderName,
                    content: content,
                    timestamp: timestamp,
                    type: 'text'
                };

                console.log('💬 Adding text message:', newMessage);
                setMessages((prev) => {
                    // Prevent duplicates
                    const isDuplicate = prev.some(msg => 
                        msg.timestamp === newMessage.timestamp && 
                        msg.content === newMessage.content &&
                        msg.from === newMessage.from
                    );
                    if (isDuplicate) {
                        console.log('⚠️ Duplicate message, ignoring');
                        return prev;
                    }
                    return [...prev, newMessage];
                });
                await storeMessage(persistentUserId, from, newMessage);
            } else {
                console.log('⚠️ Message from different peer:', {
                    from,
                    expected: targetPersistentId,
                    currentChatId
                });
            }
        };

        window.addEventListener('p2p-message', handleP2PMessage);

        return () => {
            window.removeEventListener('p2p-message', handleP2PMessage);
        };
    }, [persistentUserId, targetPersistentId]);

    const sendPendingMessages = async () => {
        if (!persistentUserId || !targetPersistentId) return;

        try {
            const db = await openDB('p2pchats', 1);
            const key = [persistentUserId, targetPersistentId];
            const pending = await db.get('pendingMessages', key);

            if (pending && pending.messages && pending.messages.length > 0) {
                console.log(`📤 Sending ${pending.messages.length} pending messages to ${targetPersistentId}`);

                for (const msg of pending.messages) {
                    const sent = await sendMessage(targetPersistentId, msg.content);
                    if (sent) {
                        console.log('✅ Pending message sent via P2P');
                    } else {
                        console.log('⚠️ Pending message sent via relay');
                    }
                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // Clear pending messages after sending
                await db.delete('pendingMessages', key);
                console.log('✅ All pending messages sent and cleared');
            }
        } catch (error) {
            console.error('Error sending pending messages:', error);
        }
    };

    const getDisplayName = async (persistentId: string): Promise<string> => {
        const db = await openDB('p2pchats', 1);
        const userProfile = await db.get('userProfile', persistentId);
        if (userProfile && userProfile.displayName) {
            return userProfile.displayName;
        }

        const customName = await db.get('p2pnaming', persistentId);
        if (customName?.name) {
            return customName.name;
        }

        return `User_${persistentId.slice(0, 8)}`;
    };

    const loadDisplayName = async (persistentId: string) => {
        const name = await getDisplayName(persistentId);
        setDisplayName(name);
        setEnteredName(name);
    };

    const saveDisplayName = async (persistentId: string, name: string) => {
        if (!name.trim()) return;

        const db = await openDB('p2pchats', 1);
        await db.put('p2pnaming', { peerid: persistentId, name: name.trim() });

        setDisplayName(name.trim());
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputMessage || !targetPersistentId || !persistentUserId) return;

        const myName = await getDisplayName(persistentUserId);
        const trimmedMessage = inputMessage.trim();

        // Check for /pay command
        if (trimmedMessage.startsWith('/pay ')) {
            const parts = trimmedMessage.split(' ');
            if (parts.length < 2 || isNaN(Number(parts[1]))) {
                alert('Invalid command. Usage: /pay <amount>\nExample: /pay 100');
                return;
            }

            const amount = Number(parts[1]);
            
            // Check wallet initialization
            const { activeTab } = await import('../redux/store').then(m => {
                const state = m.store.getState();
                return { activeTab: state.ActiveWalletTab.activeTab };
            });

            if (!activeTab && !isFedWalletInitialized) {
                alert('Fedimint wallet not initialized');
                return;
            }
            if (activeTab && !isCashuWalletInitialized) {
                alert('Cashu wallet not initialized');
                return;
            }

            // Check if peer is connected
            if (connectionStatus !== 'connected') {
                alert('Cannot send payment - peer is not connected');
                return;
            }

            try {
                const { TransferFunds } = await import('../services/TransferFund');
                await TransferFunds(
                    activeTab,
                    Fedimintwallet,
                    CocoManager,
                    sendMessage,
                    persistentUserId,
                    amount,
                    targetPersistentId
                );

                // Add payment message to chat
                const paymentMessage = {
                    from: myName,
                    content: `💸 Sent ${amount} sats`,
                    timestamp: Date.now(),
                    type: 'payment-sent'
                };

                setMessages((prev) => [...prev, paymentMessage]);
                await storeMessage(persistentUserId, targetPersistentId, paymentMessage);
                setInputMessage('');
                
                alert(`✅ Sent ${amount} sats!`);
                return;
            } catch (error) {
                console.error('Payment error:', error);
                alert('Failed to send payment: ' + (error as Error).message);
                return;
            }
        }

        // Regular message
        const newMessage = {
            from: myName,
            content: trimmedMessage,
            timestamp: Date.now(),
            type: 'text'
        };

        if (connectionStatus === 'connected') {
            const sent = await sendMessage(targetPersistentId, trimmedMessage);
            
            if (sent) {
                console.log('✅ Message sent via P2P');
            } else {
                console.log('⚠️ Message sent via server relay');
            }
        } else {
            console.log('📝 Storing message as pending (peer offline)');
            await storePendingMessage(trimmedMessage);
        }

        setMessages((prev) => [...prev, newMessage]);
        await storeMessage(persistentUserId, targetPersistentId, newMessage);
        setInputMessage('');
    };

    const storePendingMessage = async (content: string) => {
        const db = await openDB('p2pchats', 1);
        const key = [persistentUserId, targetPersistentId];
        
        const existing = await db.get('pendingMessages', key);
        const pendingMsg = {
            content: content,
            timestamp: Date.now()
        };

        if (existing && existing.messages) {
            existing.messages.push(pendingMsg);
            await db.put('pendingMessages', existing);
        } else {
            await db.put('pendingMessages', {
                from: persistentUserId,
                to: targetPersistentId,
                messages: [pendingMsg]
            });
        }

        console.log('✅ Message stored as pending');
    };

    const handleNameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!enteredName.trim() || !targetPersistentId) return;

        await saveDisplayName(targetPersistentId, enteredName);
    };

    async function storeMessage(
        fromUserId: string,
        toUserId: string,
        message: { from: string; content: string; timestamp: number; type?: string }
    ) {
        const db = await openDB('p2pchats', 1);
        const key = [fromUserId, toUserId];

        const existing = await db.get('chat', key);
        const newMessage = {
            ...message,
            timestamp: message.timestamp || Date.now()
        };

        if (existing) {
            existing.messages.push(newMessage);
            await db.put('chat', existing);
        } else {
            await db.put('chat', {
                userID: fromUserId,
                peerID: toUserId,
                messages: [newMessage],
            });
        }
    }

    const getConnectionColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'bg-green-500';
            case 'connecting': return 'bg-yellow-500';
            case 'disconnected': return 'bg-red-500';
        }
    };

    const getConnectionText = () => {
        switch (connectionStatus) {
            case 'connected': return 'P2P Connected';
            case 'connecting': return 'Connecting...';
            case 'disconnected': return 'Offline';
        }
    };

    const getMessageStyle = (messageType?: string) => {
        if (messageType === 'ecash-received') {
            return 'message-ecash-received';
        }
        return '';
    };

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
                    <h2 className="community-name">Chat with {displayName}</h2>
                    <span className="community-id">
                        ID: {targetPersistentId.slice(0, 12)}... 
                        <i 
                            onClick={() => navigator.clipboard.writeText(targetPersistentId)} 
                            style={{cursor:'pointer'}} 
                            className="fa-regular fa-copy"
                        />
                    </span>
                </div>
                <div className="online-indicator">
                    <div className={`online-dot ${getConnectionColor()}`}></div>
                    <span className="online-text">{getConnectionText()}</span>
                </div>
            </div>

            {/* Name Form */}
            <div className="name-form-container">
                <form onSubmit={handleNameSubmit} className="name-form">
                    <input
                        type="text"
                        placeholder="Enter display name for this user"
                        value={enteredName}
                        onChange={(e) => setEnteredName(e.target.value)}
                        className="name-input"
                    />
                    <button type="submit" className="name-button">Save Name</button>
                </form>
            </div>

            {/* Messages Area */}
            <div className="messages-container">
                <div className="messages-wrapper">
                    {messages.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">💬</div>
                            <p className="empty-text">No messages yet</p>
                            <p className="empty-subtext">
                                {connectionStatus === 'connected' 
                                    ? 'Start a conversation!' 
                                    : 'Waiting for peer to connect...'}
                            </p>
                        </div>
                    ) : (
                        <ul className="messages-list">
                            {messages.map((message, id) => (
                                <li key={id} className={`message ${getMessageStyle(message.type)}`}>
                                    <div className="message-header">
                                        <span className="message-author">{message.from}</span>
                                        <span className="message-time">
                                            {new Date(message.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="message-content">{message.content}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Message Input */}
            <div className="input-container">
                <form onSubmit={handleSendMessage} className="message-form">
                    <div className="input-wrapper">
                        <input
                            type="text"
                            placeholder={connectionStatus === 'connected' 
                                ? "Type /pay <amount> to send sats" 
                                : "Enter Message (will send when connected)"}
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            required
                            className="message-input"
                        />
                        <button
                            type="submit"
                            className={`send-button ${inputMessage.trim() ? 'active' : ''}`}
                            disabled={!inputMessage.trim()}
                        >
                            <span className="send-icon">→</span>
                            {connectionStatus !== 'connected' && (
                                <span style={{fontSize: '10px', marginLeft: '4px'}}>📝</span>
                            )}
                        </button>
                    </div>
                    <div style={{fontSize: '11px', color: '#888', marginTop: '4px', padding: '0 12px'}}>
                        💡 Tip: Type <code>/pay 100</code> to send 100 sats
                    </div>
                </form>
            </div>
        </div>
    );
}