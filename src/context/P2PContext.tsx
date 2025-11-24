import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type {ReactNode} from 'react'
import { P2PConnection } from '../services/P2PConnection'
import { getPersistentUserId } from '../services/Socket'

interface Peer {
    peerId: string
    displayName: string
    isConnected: boolean
}

interface P2PContextType {
    isConnected: boolean
    peers: Peer[]
    persistentUserId: string
    sendMessage: (toPeerId: string, content: string) => Promise<boolean>
    getConnectedPeers: () => string[]
    isP2PConnected: (peerId: string) => boolean
}

const P2PContext = createContext<P2PContextType | null>(null)

// Global singleton to prevent multiple P2P instances
let globalP2PInstance: P2PConnection | null = null
let globalInitPromise: Promise<P2PConnection> | null = null
let globalUserId: string = ''

export function P2PProvider({ children }: { children: ReactNode }) {
    const [isConnected, setIsConnected] = useState(false)
    const [peers, setPeers] = useState<Peer[]>([])
    const [persistentUserId, setPersistentUserId] = useState<string>('')
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        let localP2P: P2PConnection | null = null

        const initP2P = async () => {
            try {
                // If already initializing, wait for that to complete
                if (globalInitPromise) {
                    console.log('⏳ Waiting for existing P2P initialization...')
                    const p2p = await globalInitPromise
                    if (!mountedRef.current) return
                    
                    localP2P = p2p
                    setPersistentUserId(globalUserId)
                    setIsConnected(true)
                    console.log('✅ Using existing P2P connection')
                    return
                }

                // If already initialized, reuse it
                if (globalP2PInstance) {
                    console.log('♻️ Reusing existing P2P instance')
                    localP2P = globalP2PInstance
                    setPersistentUserId(globalUserId)
                    setIsConnected(true)
                    return
                }

                // Create new initialization promise
                console.log('🚀 Initializing NEW P2P connection...')
                
                globalInitPromise = (async () => {
                    // Get persistent user ID
                    const userId = await getPersistentUserId()
                    globalUserId = userId
                    console.log('👤 User ID:', userId)

                    // Default signaling server URL
                    const serverUrl = window.location.hostname === 'localhost' 
                        ? 'ws://localhost:8080'
                        : `ws://${window.location.hostname}:8080`

                    console.log('🔌 Connecting to:', serverUrl)

                    // Create P2P connection (only once!)
                    const p2p = new P2PConnection(userId, {
                        onPeerDiscovered: (peerId: string, displayName: string) => {
                            console.log('🔍 CONTEXT: Peer discovered:', peerId, displayName)
                            setPeers(prev => {
                                const exists = prev.find(p => p.peerId === peerId)
                                if (exists) {
                                    console.log('⚠️ CONTEXT: Peer already exists')
                                    return prev
                                }
                                console.log('✅ CONTEXT: Adding new peer')
                                return [...prev, { peerId, displayName, isConnected: false }]
                            })
                        },
                        onPeerConnected: (peerId: string) => {
                            console.log('✅ CONTEXT: Peer connected:', peerId)
                            setPeers(prev => prev.map(p => 
                                p.peerId === peerId 
                                    ? { ...p, isConnected: true }
                                    : p
                            ))
                        },
                        onPeerDisconnected: (peerId: string) => {
                            console.log('❌ CONTEXT: Peer disconnected:', peerId)
                            setPeers(prev => prev.map(p => 
                                p.peerId === peerId 
                                    ? { ...p, isConnected: false }
                                    : p
                            ))
                        },
                        onMessageReceived: (from: string, content: string) => {
                            console.log('💬 CONTEXT: Message received from:', from)
                            
                            // Dispatch custom event for components to listen
                            window.dispatchEvent(new CustomEvent('p2p-message', {
                                detail: { from, content, timestamp: Date.now() }
                            }))
                        }
                    })

                    await p2p.connect(serverUrl)
                    globalP2PInstance = p2p
                    console.log('✅ P2P connection established!')
                    return p2p
                })()

                const p2p = await globalInitPromise
                globalInitPromise = null

                if (!mountedRef.current) {
                    console.log('⚠️ Component unmounted, cleaning up...')
                    return
                }
                
                localP2P = p2p
                setPersistentUserId(globalUserId)
                setIsConnected(true)

            } catch (error) {
                console.error('❌ Failed to initialize P2P:', error)
                globalInitPromise = null
                setIsConnected(false)
            }
        }

        initP2P()

        // Cleanup on unmount - but DON'T destroy global instance!
        return () => {
            mountedRef.current = false
            console.log('🧹 Component unmounting (keeping global P2P alive)')
            // Don't disconnect the global instance - other components might use it
        }
    }, []) // Empty dependency array - only run once!

    const sendMessage = useCallback(async (toPeerId: string, content: string): Promise<boolean> => {
        if (!globalP2PInstance) {
            console.error('❌ P2P connection not initialized')
            return false
        }

        try {
            const isP2P = await globalP2PInstance.sendMessage(toPeerId, content)
            return isP2P
        } catch (error) {
            console.error('❌ Error sending message:', error)
            return false
        }
    }, [])

    const getConnectedPeers = useCallback(() => {
        if (!globalP2PInstance) return []
        return globalP2PInstance.getConnectedPeers()
    }, [])

    const isP2PConnected = useCallback((peerId: string) => {
        if (!globalP2PInstance) return false
        return globalP2PInstance.isConnected(peerId)
    }, [])

    const value: P2PContextType = {
        isConnected,
        peers,
        persistentUserId,
        sendMessage,
        getConnectedPeers,
        isP2PConnected
    }

    return (
        <P2PContext.Provider value={value}>
            {children}
        </P2PContext.Provider>
    )
}

// Custom hook to use P2P context
export function useP2P() {
    const context = useContext(P2PContext)
    if (!context) {
        throw new Error('useP2P must be used within P2PProvider')
    }
    return context
}

// Optional: Cleanup function for app-level unmount (e.g., logout)
export function cleanupP2P() {
    if (globalP2PInstance) {
        console.log('🧹 Cleaning up global P2P instance')
        globalP2PInstance.disconnect()
        globalP2PInstance = null
        globalUserId = ''
    }
}