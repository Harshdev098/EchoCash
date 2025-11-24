// Updated PeerList.tsx
import { Link } from 'react-router'
import { useState, useEffect, useCallback } from 'react'
import { useP2P } from '../context/P2PContext' // Use the new context!

interface PublicPost {
    from: string
    content: string
    timestamp: number
}

export default function PeerList() {
    const [publicPosts, setPublicPosts] = useState<PublicPost[]>([])
    const [postContent, setPostContent] = useState('')
    const [isPosting, setIsPosting] = useState(false)

    // Use P2P hook instead of socket context
    const { peers, isConnected, persistentUserId, sendMessage } = useP2P()

    // Filter connected peers
    const connectedPeers = peers.filter(p => p.isConnected)
    const peerCount = connectedPeers.length

    const addPublicPost = useCallback((post: PublicPost) => {
        setPublicPosts(prev => {
            // Check if post already exists
            const exists = prev.some(existingPost =>
                existingPost.from === post.from &&
                existingPost.timestamp === post.timestamp &&
                existingPost.content === post.content
            )

            if (exists) {
                return prev
            }

            return [post, ...prev]
        })
    }, [])

    useEffect(() => {
        // Listen for incoming public posts via P2P
        const handleP2PMessage = (event: any) => {
            try {
                const { from, content, timestamp } = event.detail

                // Try to parse as public post
                try {
                    const data = JSON.parse(content)
                    if (data.type === 'public-post') {
                        const newPost: PublicPost = {
                            from: data.from || from,
                            content: data.content,
                            timestamp: data.timestamp || timestamp
                        }
                        console.log('Adding public post:', newPost)
                        addPublicPost(newPost)
                    }
                } catch {
                    // Not a public post, ignore
                }
            } catch (error) {
                console.error('Error handling P2P message:', error)
            }
        }

        window.addEventListener('p2p-message', handleP2PMessage)

        return () => {
            window.removeEventListener('p2p-message', handleP2PMessage)
        }
    }, [addPublicPost])

    const handleCreatePost = async () => {
        if (!postContent.trim()) {
            alert('Please enter some content')
            return
        }

        if (!isConnected) {
            alert('Not connected to P2P network')
            return
        }

        setIsPosting(true)

        try {
            const post: PublicPost = {
                from: persistentUserId,
                content: postContent.trim(),
                timestamp: Date.now()
            }

            const postMessage = JSON.stringify({
                type: 'public-post',
                from: persistentUserId,
                content: post.content,
                timestamp: post.timestamp
            })

            // Send to all connected peers
            const sendPromises = connectedPeers.map(peer => 
                sendMessage(peer.peerId, postMessage)
            )

            await Promise.all(sendPromises)

            // Add to own feed
            addPublicPost(post)

            setPostContent('')
            alert('Post shared with all connected peers!')
        } catch (error) {
            console.error('Error creating post:', error)
            alert('Failed to create post')
        } finally {
            setIsPosting(false)
        }
    }

    return (
        <div className="network-feed-container">
            {/* Connection Status */}
            <div className="connection-status">
                {isConnected ? (
                    <div className="status-badge status-online">
                        <span className="status-dot"></span>
                        Connected to P2P Network
                    </div>
                ) : (
                    <div className="status-badge status-offline">
                        <span className="status-dot"></span>
                        Connecting to P2P Network...
                    </div>
                )}
            </div>

            {/* Peers Section */}
            <div className="peers-section">
                {connectedPeers.length === 0 ? (
                    <div className="no-peers-state">
                        <div className="status-icon">
                            <span className="icon">🔍</span>
                        </div>
                        <h2 className="status-title">No Connected Peers Found!</h2>
                        <p className="status-description">
                            {isConnected 
                                ? 'Waiting for peers to join the network...'
                                : 'Connecting to P2P network...'}
                        </p>
                        {!isConnected && (
                            <div className="connecting-spinner">
                                <i className="fa-solid fa-spinner fa-spin"></i>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="peers-found-state">
                        <div className="peers-header">
                            <div className="peers-count">
                                <span className="count-number">{peerCount}</span>
                                <span className="count-label">connected peer found!</span>
                            </div>
                        </div>
                        <div className="connected-peers">
                            {connectedPeers.map((peer) => (
                                <Link 
                                    key={peer.peerId} 
                                    to={`/chat/p/${peer.peerId}`} 
                                    className="peer-card"
                                >
                                    <div className="peer-avatar">
                                        <span className="avatar-icon">👤</span>
                                    </div>
                                    <div className="peer-info">
                                        <span className="peer-name">{peer.displayName}</span>
                                        <span className="peer-status">
                                            {peer.isConnected ? '✓ P2P Connected' : '⏳ Connecting...'}
                                        </span>
                                    </div>
                                    <div className="peer-action">
                                        <span className="chat-arrow">→</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Post Creation Section */}
            <div className="post-creation-section">
                <div className="creation-header">
                    <h4 className="creation-title">Share with Your Network</h4>
                    <p className="creation-subtitle">
                        Post will be shared with all {peerCount} connected peers
                    </p>
                </div>
            </div>

            {/* Feeds Section */}
            <div className="feeds-section">
                <div className="feeds-header">
                    <h3 className="feeds-title">Network Feed</h3>
                    <div className="feeds-count">
                        {publicPosts.length} {publicPosts.length === 1 ? 'post' : 'posts'}
                    </div>
                </div>

                <div className="feeds-content">
                    {publicPosts.length > 0 ? (
                        <div className="posts-list">
                            {publicPosts.map((post, idx) => (
                                <div key={idx} className="post-card">
                                    <div className="post-header">
                                        <div className="post-author">
                                            <div className="author-avatar">
                                                <span className="avatar-text">
                                                    {post.from.slice(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="author-info">
                                                <span className="author-name">
                                                    {peers.find(p => p.peerId === post.from)?.displayName || 
                                                     `User_${post.from.slice(0, 8)}`}
                                                </span>
                                                <span className="post-time">
                                                    {new Date(post.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="post-menu">
                                            <span className="menu-dots">⋯</span>
                                        </div>
                                    </div>
                                    <div className="post-content">
                                        <p className="post-text">{post.content}</p>
                                    </div>
                                    <div className="post-actions">
                                        <button className="action-button">
                                            <span className="action-icon">💬</span>
                                            <span className="action-text">Reply</span>
                                        </button>
                                        <button className="action-button">
                                            <span className="action-icon">🔄</span>
                                            <span className="action-text">Share</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-feeds-state">
                            <div className="empty-icon">📝</div>
                            <p className="empty-text">No public posts yet.</p>
                            <p className="empty-subtext">
                                {connectedPeers.length > 0 
                                    ? 'Be the first to share something with your network!'
                                    : 'Connect with peers to see their posts'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}