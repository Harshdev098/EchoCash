import { useEffect, useState } from 'react';
import { openDB } from 'idb';
import { Link, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from './db';
import { useP2P } from '../context/P2PContext';

interface PreviousPeer {
    peerId: string
    displayName: string
    isOnline: boolean
}

export default function Sidebar() {
    const [previousPeers, setPreviousPeers] = useState<PreviousPeer[]>([]);
    const [joinedCommunities, setJoinedCommunities] = useState<{ cID: string; cName: string }[]>([]);
    const [activeCommunities, setActiveCommunities] = useState<{ cID: string; cName: string }[]>([]);
    const [persistentUserId, setPersistentUserId] = useState<string>('');
    const [isOpen, setIsOpen] = useState<boolean>(true)
    
    const { peers: onlinePeers } = useP2P()
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

    const handleCreateCommunity = async () => {
        const cName = prompt("Enter the name of community");
        if (cName && persistentUserId) {
            const db = await openDB('p2pchats', 2);
            const cID = `${Date.now()}`;

            const community = {
                cID,
                cName,
                joinedPeers: [persistentUserId]
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

        const db = await openDB('p2pchats', 2);
        const community = await db.get('community', code);

        if (!community) {
            alert('Community not found');
            return;
        }

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

        try {
            const db = await openDB('p2pchats', 2);
            
            // Get all known peers
            const knownPeers = await db.getAll('knownPeers');
            
            // Check which ones are online
            const peersWithStatus: PreviousPeer[] = knownPeers.map(peer => ({
                peerId: peer.peerId,
                displayName: peer.displayName,
                isOnline: onlinePeers.some(p => p.peerId === peer.peerId && p.isConnected)
            }));
            
            // Sort by online first, then alphabetically
            peersWithStatus.sort((a, b) => {
                if (a.isOnline && !b.isOnline) return -1;
                if (!a.isOnline && b.isOnline) return 1;
                return a.displayName.localeCompare(b.displayName);
            });
            
            setPreviousPeers(peersWithStatus);
            console.log('📋 Loaded previous peers:', peersWithStatus.length);
        } catch (error) {
            console.error('Error fetching previous chats:', error);
        }
    };

    const fetchUserCommunities = async () => {
        if (!persistentUserId) return;

        try {
            const db = await openDB('p2pchats', 2);
            const tx = db.transaction('community', 'readonly');
            const store = tx.objectStore('community');
            const allCommunities = await store.getAll();

            const joined = [];
            const active = [];

            for (const comm of allCommunities) {
                if (comm.joinedPeers && comm.joinedPeers.includes(persistentUserId)) {
                    joined.push({ cID: comm.cID, cName: comm.cName });

                    // Check if any community members are online
                    const onlineCount = comm.joinedPeers.filter((pId: string) => 
                        onlinePeers.some(p => p.peerId === pId && p.isConnected)
                    ).length;

                    if (onlineCount >= 2) {
                        active.push({ cID: comm.cID, cName: comm.cName });
                    }
                }
            }

            setJoinedCommunities(joined);
            setActiveCommunities(active);
        } catch (error) {
            console.error('Error fetching communities:', error);
        }
    };

    useEffect(() => {
        const initializePersistentId = async () => {
            const persistentId = await getPersistentUserId();
            setPersistentUserId(persistentId);
        };

        initializePersistentId();
    }, []);

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
    }, []);

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
                    <p className='user-label'>Your Persistent ID</p>
                    <div className='user-id' title={persistentUserId}>
                        {persistentUserId.slice(0, 20)}...
                    </div>
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
                    <p className='sidebar-title'>
                        Previous Chats 💬
                        {previousPeers.length > 0 && (
                            <span className="peer-count-badge">{previousPeers.length}</span>
                        )}
                    </p>
                    <ul className='sidebar-list'>
                        {previousPeers.length > 0 ? previousPeers.map((peer, key) => (
                            <li key={key} className={peer.isOnline ? 'peer-online' : ''}>
                                <Link to={`/chat/p/${peer.peerId}`}>
                                    {peer.isOnline && <span className="online-dot">●</span>}
                                    {peer.displayName}
                                </Link>
                            </li>
                        )) : (
                            <li className="empty">No previous chat found</li>
                        )}
                    </ul>
                </div>
            </div>
        </>
    );
}