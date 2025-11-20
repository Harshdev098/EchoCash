import Taskbar from '../components/Taskbar';
import Sidebar from '../components/Sidebar';
import { useEffect, useState, useContext } from 'react';
import { openDB } from 'idb';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import SocketContext from '../context/socket';
import { Outlet } from 'react-router';
import Header from '../components/Header';
import { useCashuWallet } from '../context/cashu';
import { useFedimintWallet } from '../context/fedimint';


export default function Main() {
    const [postBox, setPostBox] = useState<boolean>(false);
    const [audience, setAudience] = useState<'public' | 'all' | 'specific' | null>(null);
    const [message, setMessage] = useState<string>('');
    const onlinePeers = useSelector((state: RootState) => state.Peers.peerId);
    const { socket, persistentUserId } = useContext(SocketContext);
    const {CocoManager}=useCashuWallet()
    const {Fedimintwallet}=useFedimintWallet()


    useEffect(() => {
        const deliverPendingMessages = async () => {
            const db = await openDB('p2pchats', 1);

            // Use persistent user ID for pending messages
            for (const peer of onlinePeers) {
                const key = [persistentUserId, peer];
                const pending = await db.get('pendingMessages', key);
                if (pending && pending.messages.length > 0) {
                    for (const msg of pending.messages) {
                        socket?.send(JSON.stringify({
                            type: 'message',
                            to: peer,
                            content: msg.content,
                            from: persistentUserId
                        }));
                    }
                    await db.delete('pendingMessages', key);
                }
            }
        };

        if (persistentUserId && onlinePeers.length > 0) {
            deliverPendingMessages();
        }
    }, [onlinePeers, persistentUserId]);

    const handlePostSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('audience', audience, message, persistentUserId)

        if (!audience || !message.trim() || !persistentUserId) {
            alert('Please select audience and enter a message.');
            return;
        }

        const db = await openDB('p2pchats', 1);
        const timestamp = Date.now();

        // Create the post object
        const newPost = {
            from: persistentUserId,
            content: message,
            timestamp: timestamp
        };

        // Immediately add to local feed
        if (typeof window !== 'undefined' && (window as any).addPublicPostToFeed) {
            (window as any).addPublicPostToFeed(newPost);
        }

        // If there are connected peers, send the message to all
        if (onlinePeers && onlinePeers.length > 0) {
            console.log('peer is connected sending message')
            socket?.send(JSON.stringify({
                type: 'public-post',
                from: persistentUserId,
                content: message,
                timestamp: timestamp
            }));
        } else {
            // If no connected peers, save to pendingMessages for all previous known peers
            const prevChat = await db.get('prevChat', persistentUserId);
            const previousPeers: string[] = prevChat?.peers || [];
            console.log('no peer found storing it for further events', previousPeers)

            for (const peer of previousPeers) {
                const key = [persistentUserId, peer];
                const existing = await db.get('pendingMessages', key);
                const newMsg = {
                    content: `[Public Post]: ${message}`,
                    timestamp: timestamp
                };

                if (existing) {
                    existing.messages.push(newMsg);
                    await db.put('pendingMessages', existing);
                } else {
                    await db.put('pendingMessages', {
                        from: persistentUserId,
                        to: peer,
                        messages: [newMsg]
                    });
                }
            }
        }

        setMessage('');
        setAudience(null);
        setPostBox(false);
    };

    useEffect(() => {
        if (!socket) return;
        
        socket.onmessage = async (event: MessageEvent) => {
            const data = JSON.parse(event.data);

            if (data.type === "ecash-send") {
                const { notes, type, amount } = data.content;

                if (type === 'cashu') {
                    await CocoManager?.wallet.receive(notes);

                    socket.send(JSON.stringify({
                        type: "ecash-ack",
                        to: data.from,
                        from: persistentUserId,
                        content: "redeemed"
                    }));

                    alert(`Received ${amount} sats`);
                } else {
                    await Fedimintwallet?.mint.redeemEcash(notes);

                    socket.send(JSON.stringify({
                        type: "ecash-ack",
                        to: data.from,
                        from: persistentUserId,
                        content: "redeemed"
                    }));

                    alert(`Received ${amount} sats`);
                }
            }
        };

        return () => {
            if (socket) socket.onmessage = null;
        };
    }, [socket, Fedimintwallet, CocoManager, persistentUserId])

    return (
        <main className='mainchatContent'>
            {postBox && (
                <div className='postbox'>
                    <div>
                        <h3>Write a Post</h3>
                        <p>Choose where to post your message.</p>
                        <form onSubmit={handlePostSubmit}>
                            <label>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="public"
                                    checked={audience === 'public'}
                                    onChange={() => setAudience('public')}
                                />
                                <span>Public</span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="all"
                                    checked={audience === 'all'}
                                    onChange={() => setAudience('all')}
                                />
                                <span>All Communities</span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="specific"
                                    checked={audience === 'specific'}
                                    onChange={() => setAudience('specific')}
                                />
                                <span>Specific Community</span>
                            </label>
                            <input
                                type="text"
                                placeholder="Enter the message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                required
                            />
                            <div className="postbox-buttons">
                                <button type="submit">Send</button>
                                <button type="button" onClick={() => setPostBox(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <section className='leftsidebars'>
                <Taskbar />
                <Sidebar />
            </section>
            <section className='main-rightsideContent'>
                <Header />
                <Outlet />
                <button className="leaf-button" onClick={() => setPostBox(true)}>
                    <i className="fa-solid fa-leaf"></i>
                </button>
            </section>
        </main>
    );
}
