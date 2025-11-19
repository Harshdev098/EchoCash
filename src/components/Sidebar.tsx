import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { openDB } from 'idb';
import { Link, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from './db';

export default function Sidebar() {
    const userId = useSelector((state: RootState) => state.Peers.UserId);
    const [previousPeers, setPreviousPeers] = useState<string[]>([]);
    const [joinedCommunities, setJoinedCommunities] = useState<{ cID: string; cName: string }[]>([]);
    const [activeCommunities, setActiveCommunities] = useState<{ cID: string; cName: string }[]>([]);
    const [persistentUserId, setPersistentUserId] = useState<string>('');
    const [isOpen, setIsOpen] = useState<boolean>(true)
    const onlinePeers = useSelector((state: RootState) => state.Peers.peerId);
    const navigate = useNavigate()

    // Get or create persistent user ID
    const getPersistentUserId = async (): Promise<string> => {
        const db = await getDB();
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

    // Map current peer ID to persistent user ID
    const mapPeerIdToUser = async (peerId: string, persistentUserId: string) => {
        const db = await openDB('p2pchats', 1);
        await db.put('peerMapping', {
            peerId,
            persistentUserId,
            timestamp: Date.now()
        });
    };

    // Get persistent user ID from peer ID
    const getPersistentUserIdFromPeer = async (peerId: string): Promise<string | null> => {
        const db = await openDB('p2pchats', 1);
        const mapping = await db.get('peerMapping', peerId);
        return mapping?.persistentUserId || null;
    };

    const handleCreateCommunity = async () => {
        const cName = prompt("Enter the name of community");
        if (cName && persistentUserId) {
            const db = await openDB('p2pchats', 1);
            const cID = `${Date.now()}`;

            const community = {
                cID,
                cName,
                joinedPeers: [persistentUserId] // Use persistent ID
            };

            await db.put('community', community);
            alert(`Community "${cName}" created successfully!`);
            setJoinedCommunities((prev) => [...prev, { cID, cName }])
            navigate(`/chat/c/${cID}`)
        }
    };

    const handleJoinCommunity = async () => {
        const code = prompt('Enter the community code (cID):');
        if (!code || !persistentUserId) return;

        const db = await openDB('p2pchats', 1);
        const community = await db.get('community', code);

        if (!community.joinedPeers.includes(persistentUserId)) {
            community.joinedPeers.push(persistentUserId);
            await db.put('community', community);
            let cName = community.cName
            let cID = community.cID
            alert(`You have joined the community "${cName}"`);
            setJoinedCommunities((prev) => [...prev, { cName, cID }])
            navigate(`/chat/c/${code}`)
        } else {
            alert(`You are already a member of "${community.cName}"`);
        }
    };

    const fetchPreviousChats = async () => {
        if (!persistentUserId) return;

        const db = await openDB('p2pchats', 1);
        const prevChat = await db.get('prevChat', persistentUserId);

        if (prevChat && prevChat.peers) {
            // Convert peer IDs to display names
            await Promise.all(
                prevChat.peers.map(async (peerId: string) => {
                    const persistentId = await getPersistentUserIdFromPeer(peerId);
                    return persistentId ? `${persistentId.slice(0, 8)}...` : `${peerId.slice(0, 8)}...`;
                })
            );
            setPreviousPeers(prevChat.peers);
        }
    };

    const fetchUserCommunities = async () => {
        if (!persistentUserId) return;

        const db = await openDB('p2pchats', 1);
        const tx = db.transaction('community', 'readonly');
        const store = tx.objectStore('community');
        const allCommunities = await store.getAll();

        const joined = [];
        const active = [];

        for (const comm of allCommunities) {
            if (comm.joinedPeers.includes(persistentUserId)) {
                joined.push({ cID: comm.cID, cName: comm.cName });

                // Check if any of the community members are currently online
                const onlineMembers = await Promise.all(
                    comm.joinedPeers.map(async (persistentId: string) => {
                        // Get current peer IDs for this persistent user
                        const db = await openDB('p2pchats', 1);
                        const tx = db.transaction('peerMapping', 'readonly');
                        const mappings = await tx.store.getAll();
                        return mappings.some(m =>
                            m.persistentUserId === persistentId &&
                            onlinePeers.includes(m.peerId)
                        );
                    })
                );

                if (onlineMembers.filter(Boolean).length >= 2) {
                    active.push({ cID: comm.cID, cName: comm.cName });
                }
            }
        }

        setJoinedCommunities(joined);
        setActiveCommunities(active);
    };

    useEffect(() => {
        const initializePersistentId = async () => {
            const persistentId = await getPersistentUserId();
            setPersistentUserId(persistentId);

            // Map current peer ID to persistent user ID
            if (userId) {
                await mapPeerIdToUser(userId, persistentId);
            }
        };

        initializePersistentId();
    }, [userId]);

    useEffect(() => {
        if (persistentUserId) {
            fetchUserCommunities();
            fetchPreviousChats();
        }
    }, [persistentUserId, onlinePeers]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 830) {
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }
        };

        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [window.innerWidth]);

    return (
        <>
            {!isOpen && (
                <button
                    className="hamburger-toggle"
                    onClick={() => setIsOpen(true)}
                >
                    <i className="fa-solid fa-bars"></i>
                </button>
            )}

            <div className={`sidebar ${!isOpen ? 'sidebar-closed' : ''}`}>
                {isOpen && (
                    <button
                        className="sidebar-close-btn"
                        onClick={() => setIsOpen(false)}
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                )}

                <div className='user-info-card'>
                    <p className='user-label'>Your ID</p>
                    <div className='user-id'>{persistentUserId}</div>
                </div>
                <div className='action-btn'>
                    <button onClick={handleCreateCommunity}>
                        <i className="fa-solid fa-plus"></i> Build Community
                    </button>
                    <p>Make community in your local network</p>
                    <button onClick={handleJoinCommunity}>
                        <i className="fa-solid fa-plus"></i> Join Community
                    </button>
                </div>
                <div className='section'>
                    <p className='sidebar-title'>
                        Active Communities
                        <i className="fa-solid fa-info" title="More than 1 active peers make a community active"></i>
                    </p>
                    <ul className='sidebar-list'>
                        {activeCommunities.length > 0 ? activeCommunities.map((c, key) => (
                            <li key={key}><Link to={`/chat/c/${c.cID}`}>{c.cName}</Link></li>
                        )) : (
                            <li className="empty">No active community found</li>
                        )}
                    </ul>
                </div>
                <div className='section'>
                    <p className='sidebar-title'>Joined Communities</p>
                    <ul className='sidebar-list'>
                        {joinedCommunities.length > 0 ? joinedCommunities.map((c, key) => (
                            <li key={key}><Link to={`/chat/c/${c.cID}`}>{c.cName}</Link></li>
                        )) : (
                            <li className="empty">No community found</li>
                        )}
                    </ul>
                </div>
                <div className='section'>
                    <p className='sidebar-title'>Previous Chats</p>
                    <ul className='sidebar-list'>
                        {previousPeers.length > 0 ? previousPeers.map((peerId, key) => (
                            <li key={key}><Link to={`/chat/p/${peerId}`}>{peerId.slice(0, 20)}...</Link></li>
                        )) : (
                            <li className="empty">No previous chat found</li>
                        )}
                    </ul>
                </div>
            </div>
        </>
    );
}