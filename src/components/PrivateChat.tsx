import { openDB } from 'idb';
import { useNavigate, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../redux/store';
import { setName } from '../redux/PeerSlice';
import { useState, useEffect } from 'react';
import { useContext } from 'react';
import SocketContext from '../context/socket';
import { v4 as uuidv4 } from 'uuid';

export default function PrivateChat() {
    const dispatch = useDispatch<AppDispatch>();
    const navigate=useNavigate()
    const { chatId } = useParams(); // This could be either peer ID or persistent user ID
    console.log("chatId ", chatId);

    const [enteredName, setEnteredName] = useState('');
    const [messages, setMessages] = useState<{ from: string; content: string; timestamp: number }[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [persistentUserId, setPersistentUserId] = useState<string>('');
    const [targetPersistentId, setTargetPersistentId] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');

    const { socket } = useContext(SocketContext);
    // const userId = useSelector((state: RootState) => state.Peers.UserId);

    const getPersistentUserId = async (): Promise<string> => {
        const db = await openDB('p2pchats', 1);
        let userProfile = await db.get('userProfile', 'main');

        if (!userProfile) {
            const newUserId = uuidv4();
            userProfile = {
                id: 'main',
                persistentUserId: newUserId,
                displayName: `User_${newUserId.slice(0, 8)}`,
                createdAt: Date.now()
            };
            await db.put('userProfile', userProfile);
        }

        return userProfile.persistentUserId;
    };

    const resolvePersistentUserId = async (id: string): Promise<string> => {
        if (!id) return '';

        const db = await openDB('p2pchats', 1);

        // checking if this is already a persistent user ID
        const userProfile = await db.get('userProfile', id);
        if (userProfile) {
            return id;
        }

        // If not, checking if it's a peer ID that maps to a persistent user ID
        const mapping = await db.get('peerMapping', id);
        if (mapping) {
            return mapping.persistentUserId;
        }

        // If no mapping exists, treat it as a legacy peer ID
        return id;
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

    const saveDisplayName = async (persistentId: string, name: string) => {
        if (!name.trim()) return;

        const db = await openDB('p2pchats', 1);
        await db.put('p2pnaming', { peerid: persistentId, name: name.trim() });

        dispatch(setName({ peerId: persistentId, name: name.trim() }));
        setDisplayName(name.trim());
    };

    useEffect(() => {
        const initialize = async () => {
            const myPersistentId = await getPersistentUserId();
            setPersistentUserId(myPersistentId);

            if (chatId) {
                const targetId = await resolvePersistentUserId(chatId);
                setTargetPersistentId(targetId);

                const name = await getDisplayName(targetId);
                setDisplayName(name);
                setEnteredName(name);
            }
        };

        initialize();
    }, [chatId]);

    useEffect(() => {
        async function loadName() {
            if (!targetPersistentId) return;

            const db = await openDB('p2pchats', 1);
            const stored = await db.get('p2pnaming', targetPersistentId);
            if (stored?.name) {
                dispatch(setName({ peerId: targetPersistentId, name: stored.name }));
                setDisplayName(stored.name);
                setEnteredName(stored.name);
            }
        }
        loadName();
    }, [targetPersistentId, dispatch]);

    useEffect(() => {
        if (!socket) return;

        const handleMessage = async (event: MessageEvent) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'message' &&
                (msg.from === chatId || msg.from === targetPersistentId)) {

                const senderName = await getDisplayName(msg.from);
                const newMessage = {
                    from: senderName,
                    content: msg.content,
                    timestamp: msg.timestamp || Date.now()
                };

                setMessages((prev) => [...prev, newMessage]);

                if (persistentUserId && targetPersistentId) {
                    await storeMessage(persistentUserId, targetPersistentId, newMessage);
                }
            }
        };

        const handleOpen = async () => {
            if (!persistentUserId || !targetPersistentId) return;

            const db = await openDB('p2pchats', 1);
            const key = [persistentUserId, targetPersistentId];
            const pending = await db.get('pendingMessages', key);

            if (pending && pending.messages.length > 0) {
                pending.messages.forEach(async (msg: { content: string; timestamp: number }) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(
                            JSON.stringify({
                                type: 'message',
                                to: targetPersistentId,
                                from: persistentUserId,
                                content: msg.content,
                            })
                        );

                        const myName = await getDisplayName(persistentUserId);
                        const newMessage = {
                            from: myName,
                            content: msg.content,
                            timestamp: msg.timestamp
                        };
                        setMessages((prev) => [...prev, newMessage]);
                        storeMessage(persistentUserId, targetPersistentId, newMessage);
                    }
                });
                await db.delete('pendingMessages', key);
            }
        };

        socket.addEventListener('message', handleMessage);
        socket.addEventListener('open', handleOpen);

        return () => {
            socket.removeEventListener('message', handleMessage);
            socket.removeEventListener('open', handleOpen);
        };
    }, [socket, chatId, persistentUserId, targetPersistentId]);

    useEffect(() => {
        const loadMessages = async () => {
            if (!persistentUserId || !targetPersistentId) return;

            const db = await openDB('p2pchats', 1);
            const record = await db.get('chat', [persistentUserId, targetPersistentId]);

            const existing = await db.get('prevChat', persistentUserId);
            if (existing) {
                const updatedPeers = [...new Set([...existing.peers, targetPersistentId])];
                await db.put('prevChat', { userID: persistentUserId, peers: updatedPeers });
            } else {
                await db.put('prevChat', { userID: persistentUserId, peers: [targetPersistentId] });
            }

            if (record && record.messages) {
                const messagesWithNames = await Promise.all(
                    record.messages.map(async (msg: any) => {
                        // If message is from 'me', use current user's name
                        if (msg.from === 'me' || msg.from === persistentUserId) {
                            const myName = await getDisplayName(persistentUserId);
                            return { ...msg, from: myName };
                        }
                        // Otherwise, get the display name for the sender
                        const senderName = await getDisplayName(msg.from);
                        return { ...msg, from: senderName };
                    })
                );
                setMessages(messagesWithNames);
            }
        };

        loadMessages();
    }, [persistentUserId, targetPersistentId]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputMessage || !targetPersistentId || !persistentUserId) return;

        const myName = await getDisplayName(persistentUserId);

        // If socket is not available or not open, store as pending
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            const db = await openDB('p2pchats', 1);
            const key = [persistentUserId, targetPersistentId];
            const existing = await db.get('pendingMessages', key);

            const newPending = { content: inputMessage, timestamp: Date.now() };
            if (existing) {
                existing.messages.push(newPending);
                await db.put('pendingMessages', existing);
            } else {
                await db.put('pendingMessages', {
                    from: persistentUserId,
                    to: targetPersistentId,
                    messages: [newPending],
                });
            }

            const newMessage = {
                from: myName,
                content: inputMessage,
                timestamp: Date.now()
            };
            setMessages((prev) => [...prev, newMessage]);
            await storeMessage(persistentUserId, targetPersistentId, newMessage);
            setInputMessage('');
            return;
        }

        const message = {
            type: 'message',
            to: targetPersistentId,
            from: persistentUserId,
            content: inputMessage,
        };
        socket.send(JSON.stringify(message));

        const newMessage = {
            from: myName,
            content: inputMessage,
            timestamp: Date.now()
        };
        setMessages((prev) => [...prev, newMessage]);
        await storeMessage(persistentUserId, targetPersistentId, newMessage);
        setInputMessage('');
    };

    const handleNameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!enteredName.trim() || !targetPersistentId) return;

        await saveDisplayName(targetPersistentId, enteredName);
    };

    async function storeMessage(
        fromUserId: string,
        toUserId: string,
        message: { from: string; content: string; timestamp: number }
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
                    <span className="community-id">ID: {targetPersistentId.slice(0, 12)}...</span>
                </div>
                <div className="online-indicator">
                    <div className="online-dot"></div>
                    <span className="online-text">Online</span>
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
                            <p className="empty-subtext">Start a conversation!</p>
                        </div>
                    ) : (
                        <ul className="messages-list">
                            {messages.map((message, id) => (
                                <li key={id} className="message">
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
                            placeholder="Enter Message"
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
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}