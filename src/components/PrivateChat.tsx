import { openDB } from 'idb';
import { useNavigate, useParams } from 'react-router';
import { useState, useEffect, useRef } from 'react';
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
    const syncRequestedRef = useRef(false); // Prevent multiple sync requests

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
                // Request message sync when peer connects
                if (!syncRequestedRef.current) {
                    syncRequestedRef.current = true;
                    setTimeout(() => requestMessageSync(), 1000);
                }
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
                                rawContent = parsed.notes; // ✅ FIXED
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

        loadMessages();
    }, [persistentUserId, targetPersistentId]);

    useEffect(() => {
        const handleP2PMessage = async (event: any) => {
            const { from, content, timestamp } = event.detail;
            const currentChatId = window.location.pathname.split('/').pop();

            if (from === targetPersistentId || from === currentChatId) {
                // Handle system messages (sync requests/responses)
                try {
                    const systemMsg = JSON.parse(content);
                    
                    if (systemMsg._system === 'sync-request') {
                        await handleSyncRequest(from, systemMsg.lastMessageHash);
                        return;
                    }
                    
                    if (systemMsg._system === 'sync-response') {
                        await handleSyncResponse(from, systemMsg.messages);
                        return;
                    }
                } catch {}

                // Regular message handling
                let messageType = 'text';
                let displayContent = content;
                let rawContent = content;

                try {
                    const data = JSON.parse(content);

                    if (data.type === 'fedimint' || data.type === 'cashu') {
                        console.log('💰 Received ecash payment token');
                        messageType = 'ecash-payment';
                        displayContent = `💰 ${data.type === 'fedimint' ? 'Fedimint' : 'Cashu'} Payment Token (Click to copy)`;
                        rawContent = data.notes; // ✅ FIXED
                    }
                } catch {}

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

                await storeMessage(persistentUserId, from, {
                    from: from,
                    content: content,
                    timestamp: timestamp,
                    type: messageType
                });
            }
        };

        window.addEventListener('p2p-message', handleP2PMessage);
        return () => window.removeEventListener('p2p-message', handleP2PMessage);
    }, [persistentUserId, targetPersistentId]);

    // NEW: Request message sync from peer
    const requestMessageSync = async () => {
        if (!persistentUserId || !targetPersistentId) return;

        try {
            const db = await openDB('p2pchats', 2);
            const record = await db.get('chat', [persistentUserId, targetPersistentId]);
            
            // Get hash of last message we have
            const lastMessage = record?.messages?.[record.messages.length - 1];
            const lastMessageHash = lastMessage 
                ? `${lastMessage.timestamp}-${lastMessage.from}`
                : null;

            // Request sync
            const syncRequest = JSON.stringify({
                _system: 'sync-request',
                lastMessageHash: lastMessageHash
            });

            await sendMessage(targetPersistentId, syncRequest);
            console.log('📤 Requested message sync from peer');
        } catch (error) {
            console.error('Error requesting sync:', error);
        }
    };

    // NEW: Handle sync request from peer
    const handleSyncRequest = async (from: string, theirLastHash: string | null) => {
        try {
            const db = await openDB('p2pchats', 2);
            const record = await db.get('chat', [persistentUserId, from]);

            if (!record || !record.messages) {
                // No messages to sync
                return;
            }

            let messagesToSend = [];

            if (!theirLastHash) {
                // They have no messages, send all
                messagesToSend = record.messages;
            } else {
                // Find messages after their last one
                const lastIndex = record.messages.findIndex((msg: any) => 
                    `${msg.timestamp}-${msg.from}` === theirLastHash
                );

                if (lastIndex !== -1 && lastIndex < record.messages.length - 1) {
                    // Send messages after their last one
                    messagesToSend = record.messages.slice(lastIndex + 1);
                }
            }

            if (messagesToSend.length > 0) {
                const syncResponse = JSON.stringify({
                    _system: 'sync-response',
                    messages: messagesToSend
                });

                await sendMessage(from, syncResponse);
                console.log(`📤 Sent ${messagesToSend.length} missing messages to peer`);
            }
        } catch (error) {
            console.error('Error handling sync request:', error);
        }
    };

    // NEW: Handle sync response with missing messages
    const handleSyncResponse = async (from: string, missedMessages: any[]) => {
        if (!missedMessages || missedMessages.length === 0) return;

        console.log(`📥 Received ${missedMessages.length} missing messages`);

        for (const msg of missedMessages) {
            // Store each missing message
            await storeMessage(persistentUserId, from, msg);

            // Add to UI
            const senderName = await getDisplayName(msg.from);
            let displayContent = msg.content;
            let rawContent = msg.content;
            let messageType = msg.type || 'text';

            try {
                const parsed = JSON.parse(msg.content);
                if (parsed.type === 'fedimint' || parsed.type === 'cashu') {
                    messageType = 'ecash-payment';
                    displayContent = `💰 ${parsed.type === 'fedimint' ? 'Fedimint' : 'Cashu'} Payment Token (Click to copy)`;
                    rawContent = parsed.notes;
                }
            } catch {}

            const newMessage = {
                from: senderName,
                content: displayContent,
                timestamp: msg.timestamp,
                type: messageType,
                rawContent: rawContent
            };

            setMessages((prev) => {
                const isDuplicate = prev.some(m =>
                    m.timestamp === newMessage.timestamp &&
                    m.content === newMessage.content
                );
                if (isDuplicate) return prev;
                
                // Insert in correct chronological order
                const updated = [...prev, newMessage];
                return updated.sort((a, b) => a.timestamp - b.timestamp);
            });
        }
    };

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

        const userProfile = await db.get('userProfile', persistentId);
        if (userProfile && userProfile.displayName) {
            return userProfile.displayName;
        }

        const customName = await db.get('p2pnaming', persistentId);
        if (customName?.name) {
            return customName.name;
        }

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
        await db.put('p2pnaming', { peerid: persistentId, name: name.trim() });

        const knownPeer = await db.get('knownPeers', persistentId);
        if (knownPeer) {
            knownPeer.displayName = name.trim();
            await db.put('knownPeers', knownPeer);
        }

        setDisplayName(name.trim());

        const record = await db.get('chat', [persistentUserId, targetPersistentId]);
        if (record && record.messages) {
            const messagesWithNames = await Promise.all(
                record.messages.map(async (msg: any) => {
                    let displayFrom = msg.from;
                    const isUUID = msg.from && msg.from.includes('-') && msg.from.length > 20;

                    if (isUUID) {
                        displayFrom = await getDisplayName(msg.from === persistentUserId ? persistentUserId : msg.from);
                    }

                    let messageType = msg.type || 'text';
                    let displayContent = msg.content;
                    let rawContent = msg.content;

                    try {
                        const parsed = JSON.parse(msg.content);
                        if (parsed.type === 'fedimint' || parsed.type === 'cashu') {
                            messageType = 'ecash-payment';
                            displayContent = `💰 ${parsed.type === 'fedimint' ? 'Fedimint' : 'Cashu'} Payment Token (Click to copy)`;
                            rawContent = parsed.notes; // ✅ FIXED
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
            let activeTab: boolean | undefined;

            try {
                const FedBalance = await Fedimintwallet?.balance.getBalance();
                const fedSats = FedBalance ? FedBalance / 1000 : 0;

                const cashuBalanceObj = await CocoManager?.wallet.getBalances();
                const cashuSats = cashuBalanceObj 
                    ? Object.values(cashuBalanceObj).reduce((sum, v) => sum + v, 0)
                    : 0;

                console.log(`💰 Balances - Fedimint: ${fedSats} sats, Cashu: ${cashuSats} sats`);
                console.log(`💸 Trying to send: ${amount} sats`);

                if (fedSats >= amount && cashuSats >= amount) {
                    activeTab = false;
                    console.log('✅ Using Fedimint (both wallets have enough)');
                } else if (fedSats >= amount) {
                    activeTab = false;
                    console.log('✅ Using Fedimint');
                } else if (cashuSats >= amount) {
                    activeTab = true;
                    console.log('✅ Using Cashu');
                } else {
                    alert(`❌ Insufficient balance!\nFedimint: ${fedSats} sats\nCashu: ${cashuSats} sats\nNeed: ${amount} sats`);
                    return;
                }
            } catch (error) {
                console.error('Error checking balances:', error);
                alert('Failed to check wallet balances');
                return;
            }

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

                const paymentMessage = {
                    from: myName,
                    content: `💸 Sent ${amount} sats via ${activeTab ? 'Cashu' : 'Fedimint'}`,
                    timestamp: Date.now(),
                    type: 'payment-sent'
                };

                setMessages((prev) => [...prev, paymentMessage]);

                await storeMessage(persistentUserId, targetPersistentId, {
                    from: persistentUserId,
                    content: paymentMessage.content,
                    timestamp: paymentMessage.timestamp,
                    type: paymentMessage.type
                });

                setInputMessage('');
                alert(`✅ Sent ${amount} sats via ${activeTab ? 'Cashu' : 'Fedimint'}!`);
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
            const isDuplicate = existing.messages.some((msg: any) =>
                msg.timestamp === newMessage.timestamp &&
                msg.content === newMessage.content
            );
            
            if (!isDuplicate) {
                existing.messages.push(newMessage);
                await db.put('chat', existing);
            }
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
                            style={{ cursor: 'pointer' }}
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
                                            backgroundColor: message.type === 'ecash-payment' ? '#50da6eff' :
                                                message.type === 'payment-sent' ? '#50da6eff' : 'transparent',
                                            padding: message.type === 'ecash-payment' || message.type === 'payment-sent' ? '12px' : undefined,
                                            borderRadius: message.type === 'ecash-payment' || message.type === 'payment-sent' ? '8px' : undefined,
                                            border: message.type === 'ecash-payment' ? '2px solid #4ade80' : undefined
                                        }}
                                    >
                                        {message.content}
                                        {message.type === 'ecash-payment' && (
                                            <div 
                                                style={{ fontSize: '11px', marginTop: '8px', opacity: 0.8 }}
                                                onClick={() => navigator.clipboard.writeText(message.rawContent ?? '')}
                                            >
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
                                <span style={{ fontSize: '10px', marginLeft: '4px' }}>📝</span>
                            )}
                        </button>
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', padding: '0 12px' }}>
                        💡 Tip: Type <code>/pay 100</code> to send 100 sats
                    </div>
                </form>
            </div>
        </div>
    );
}