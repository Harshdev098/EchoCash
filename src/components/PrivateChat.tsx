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
    const [messages, setMessages] = useState<{ from: string; content: string; timestamp: number; type?: string; rawContent?: string }[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [targetPersistentId, setTargetPersistentId] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

    const { persistentUserId, sendMessage, isP2PConnected, isConnected } = useP2P();
    const { Fedimintwallet, isFedWalletInitialized } = useFedimintWallet()
    const { CocoManager, isCashuWalletInitialized } = useCashuWallet()

    useEffect(() => {
        if (chatId) {
            setTargetPersistentId(chatId);
            loadDisplayName(chatId);
        }
    }, [chatId]);

    useEffect(() => {
        if (isConnected && targetPersistentId) {
            const connected = isP2PConnected(targetPersistentId);
            setConnectionStatus(connected ? 'connected' : 'connecting');
            
            if (connected && persistentUserId) {
                sendPendingMessages();
            }
        } else {
            setConnectionStatus('disconnected');
        }
    }, [isConnected, targetPersistentId, isP2PConnected, persistentUserId]);

    useEffect(() => {
        const loadMessages = async () => {
            if (!persistentUserId || !targetPersistentId) return;

            const db = await openDB('p2pchats', 2);
            const record = await db.get('chat', [persistentUserId, targetPersistentId]);

            if (record && record.messages) {
                const messagesWithNames = await Promise.all(
                    record.messages.map(async (msg: any) => {
                        let displayFrom = msg.from;
                        
                        // Check if msg.from is a UUID (contains hyphens and is long)
                        const isUUID = msg.from && msg.from.includes('-') && msg.from.length > 20;
                        
                        if (isUUID) {
                            // It's a persistent ID, resolve to display name
                            if (msg.from === persistentUserId) {
                                displayFrom = await getDisplayName(persistentUserId);
                            } else {
                                displayFrom = await getDisplayName(msg.from);
                            }
                        }
                        // else: already a display name, keep it as is
                        
                        // Check if message is ecash payment
                        let messageType = msg.type || 'text';
                        let displayContent = msg.content;
                        let rawContent = msg.content;
                        
                        try {
                            const parsed = JSON.parse(msg.content);
                            if (parsed.type === 'fedimint' || parsed.type === 'cashu') {
                                messageType = 'ecash-payment';
                                displayContent = `💰 ${parsed.type === 'fedimint' ? 'Fedimint' : 'Cashu'} Payment Token (Click to copy)`;
                                rawContent = parsed.token;
                            }
                        } catch {
                            // Not JSON, regular message
                        }

                        return { 
                            ...msg, 
                            from: displayFrom,
                            type: messageType,
                            content: displayContent,
                            rawContent: rawContent
                        };
                    })
                );
                setMessages(messagesWithNames);
            }
        };

        loadMessages();
    }, [persistentUserId, targetPersistentId]);

    useEffect(() => {
        const handleP2PMessage = async (event: any) => {
            const { from, content, timestamp } = event.detail;
            const currentChatId = window.location.pathname.split('/').pop();
            
            if (from === targetPersistentId || from === currentChatId) {
                // Check if it's an ecash payment
                let messageType = 'text';
                let displayContent = content;
                let rawContent = content;
                
                try {
                    const data = JSON.parse(content);
                    
                    if (data.type === 'fedimint' || data.type === 'cashu') {
                        console.log('💰 Received ecash payment token');
                        messageType = 'ecash-payment';
                        displayContent = `💰 ${data.type === 'fedimint' ? 'Fedimint' : 'Cashu'} Payment Token (Click to copy)`;
                        rawContent = data.token;
                        
                        // Main.tsx will handle auto-redeem if wallet is initialized
                        // But we still show it in chat for manual copy if needed
                    }
                } catch {
                    // Not JSON, regular message
                }
                
                const senderName = await getDisplayName(from);
                const newMessage = {
                    from: senderName,
                    content: displayContent,
                    timestamp: timestamp,
                    type: messageType,
                    rawContent: rawContent
                };

                setMessages((prev) => {
                    const isDuplicate = prev.some(msg => 
                        msg.timestamp === newMessage.timestamp && 
                        msg.rawContent === newMessage.rawContent &&
                        msg.from === newMessage.from
                    );
                    if (isDuplicate) return prev;
                    return [...prev, newMessage];
                });
                
                // Store with original sender ID and original content
                await storeMessage(persistentUserId, from, {
                    from: from,
                    content: content, // Store original content (JSON for ecash)
                    timestamp: timestamp,
                    type: messageType
                });
            }
        };

        window.addEventListener('p2p-message', handleP2PMessage);
        return () => window.removeEventListener('p2p-message', handleP2PMessage);
    }, [persistentUserId, targetPersistentId]);

    const sendPendingMessages = async () => {
        if (!persistentUserId || !targetPersistentId) return;

        try {
            const db = await openDB('p2pchats', 2);
            const key = [persistentUserId, targetPersistentId];
            const pending = await db.get('pendingMessages', key);

            if (pending && pending.messages && pending.messages.length > 0) {
                console.log(`📤 Sending ${pending.messages.length} pending messages`);

                for (const msg of pending.messages) {
                    await sendMessage(targetPersistentId, msg.content);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                await db.delete('pendingMessages', key);
                console.log('✅ All pending messages sent');
            }
        } catch (error) {
            console.error('Error sending pending messages:', error);
        }
    };

    const getDisplayName = async (persistentId: string): Promise<string> => {
        const db = await openDB('p2pchats', 2);
        
        // Check userProfile first
        const userProfile = await db.get('userProfile', persistentId);
        if (userProfile && userProfile.displayName) {
            return userProfile.displayName;
        }

        // Check p2pnaming (custom names)
        const customName = await db.get('p2pnaming', persistentId);
        if (customName?.name) {
            return customName.name;
        }

        // Check knownPeers (from server registration)
        const knownPeer = await db.get('knownPeers', persistentId);
        if (knownPeer?.displayName) {
            return knownPeer.displayName;
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

        const db = await openDB('p2pchats', 2);
        
        // Save to p2pnaming (custom names have priority)
        await db.put('p2pnaming', { peerid: persistentId, name: name.trim() });
        
        // Also update knownPeers if exists
        const knownPeer = await db.get('knownPeers', persistentId);
        if (knownPeer) {
            knownPeer.displayName = name.trim();
            await db.put('knownPeers', knownPeer);
        }

        setDisplayName(name.trim());
        
        // Reload messages to update display names
        const record = await db.get('chat', [persistentUserId, targetPersistentId]);
        if (record && record.messages) {
            const messagesWithNames = await Promise.all(
                record.messages.map(async (msg: any) => {
                    let displayFrom = msg.from;
                    const isUUID = msg.from && msg.from.includes('-') && msg.from.length > 20;
                    
                    if (isUUID) {
                        if (msg.from === persistentUserId) {
                            displayFrom = await getDisplayName(persistentUserId);
                        } else {
                            displayFrom = await getDisplayName(msg.from);
                        }
                    }
                    
                    let messageType = msg.type || 'text';
                    let displayContent = msg.content;
                    let rawContent = msg.content;
                    
                    try {
                        const parsed = JSON.parse(msg.content);
                        if (parsed.type === 'fedimint' || parsed.type === 'cashu') {
                            messageType = 'ecash-payment';
                            displayContent = `💰 ${parsed.type === 'fedimint' ? 'Fedimint' : 'Cashu'} Payment Token (Click to copy)`;
                            rawContent = parsed.token;
                        }
                    } catch {}

                    return { 
                        ...msg, 
                        from: displayFrom,
                        type: messageType,
                        content: displayContent,
                        rawContent: rawContent
                    };
                })
            );
            setMessages(messagesWithNames);
        }
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

            if (connectionStatus !== 'connected') {
                alert('Cannot send payment - peer is not connected');
                return;
            }

            try {
                const { TransferFunds } = await import('../services/TransferFund');
                const paymentData = await TransferFunds(
                    activeTab,
                    Fedimintwallet,
                    CocoManager,
                    sendMessage,
                    persistentUserId,
                    amount,
                    targetPersistentId
                );

                const paymentMessage = {
                    from: myName,
                    content: `💸 Sent ${amount} sats`,
                    timestamp: Date.now(),
                    type: 'payment-sent'
                };

                setMessages((prev) => [...prev, paymentMessage]);
                
                // Store with persistent ID
                await storeMessage(persistentUserId, targetPersistentId, {
                    from: persistentUserId,
                    content: paymentMessage.content,
                    timestamp: paymentMessage.timestamp,
                    type: paymentMessage.type
                });
                
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
            type: 'text',
            rawContent: trimmedMessage
        };

        if (connectionStatus === 'connected') {
            const sent = await sendMessage(targetPersistentId, trimmedMessage);
            if (!sent) {
                console.log('⚠️ Failed to send via P2P, stored as pending');
                await storePendingMessage(trimmedMessage);
            }
        } else {
            console.log('📝 Storing message as pending');
            await storePendingMessage(trimmedMessage);
        }

        setMessages((prev) => [...prev, newMessage]);
        
        // Store with persistent ID
        await storeMessage(persistentUserId, targetPersistentId, {
            from: persistentUserId,
            content: trimmedMessage,
            timestamp: newMessage.timestamp,
            type: 'text'
        });
        
        setInputMessage('');
    };

    const storePendingMessage = async (content: string) => {
        const db = await openDB('p2pchats', 2);
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
        const db = await openDB('p2pchats', 2);
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

    const handleCopyToken = (rawContent: string) => {
        navigator.clipboard.writeText(rawContent);
        alert('💰 Payment token copied! Paste it in your wallet to redeem.');
    };

    const getConnectionColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'bg-green-500';
            case 'connecting': return 'bg-yellow-500';
            case 'disconnected': return 'bg-red-500';
        }
    };

    const getConnectionText = () => {
        switch (connectionStatus) {
            case 'connected': return 'P2P Connected 🔐';
            case 'connecting': return 'Connecting...';
            case 'disconnected': return 'Offline';
        }
    };

    const getMessageStyle = (messageType?: string) => {
        if (messageType === 'ecash-received' || messageType === 'ecash-payment') {
            return 'message-ecash-payment';
        }
        if (messageType === 'payment-sent') {
            return 'message-payment-sent';
        }
        return '';
    };

    return (
        <div className="chatting-container">
            <div className="top-bar">
                <button
                    onClick={() => navigate('/chat')}
                    className="back-button"
                    title="Back to sidebar"
                >
                    <i className="fa-solid fa-arrow-left-long"></i>
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
                                    <div 
                                        className="message-content"
                                        onClick={() => {
                                            if (message.type === 'ecash-payment' && message.rawContent) {
                                                handleCopyToken(message.rawContent);
                                            }
                                        }}
                                        style={{
                                            cursor: message.type === 'ecash-payment' ? 'pointer' : 'default',
                                            backgroundColor: message.type === 'ecash-payment' ? '#2a5934' : 
                                                           message.type === 'payment-sent' ? '#3d5a47' : 'transparent',
                                            padding: message.type === 'ecash-payment' || message.type === 'payment-sent' ? '12px' : undefined,
                                            borderRadius: message.type === 'ecash-payment' || message.type === 'payment-sent' ? '8px' : undefined,
                                            border: message.type === 'ecash-payment' ? '2px solid #4ade80' : undefined
                                        }}
                                    >
                                        {message.content}
                                        {message.type === 'ecash-payment' && (
                                            <div style={{fontSize: '11px', marginTop: '8px', opacity: 0.8}}>
                                                💡 Click to copy token or wait for auto-redeem
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="input-container">
                <form onSubmit={handleSendMessage} className="message-form">
                    <div className="input-wrapper">
                        <input
                            type="text"
                            placeholder={connectionStatus === 'connected' 
                                ? "Type /pay <amount> to send sats 🔐" 
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