import { openDB } from 'idb'

class MessageEncryption {
    private key: CryptoKey | null = null

    async initialize(password: string = 'echosphere-p2p-secret') {
        const encoder = new TextEncoder()
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        )

        this.key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode('echosphere-salt-2024'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        )
    }

    async encrypt(message: string): Promise<string> {
        if (!this.key) throw new Error('Encryption not initialized')
        const encoder = new TextEncoder()
        const data = encoder.encode(message)
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, data)
        const combined = new Uint8Array(iv.length + encrypted.byteLength)
        combined.set(iv, 0)
        combined.set(new Uint8Array(encrypted), iv.length)
        return btoa(String.fromCharCode(...combined))
    }

    async decrypt(encryptedMessage: string): Promise<string> {
        if (!this.key) throw new Error('Encryption not initialized')
        const combined = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0))
        const iv = combined.slice(0, 12)
        const data = combined.slice(12)
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, data)
        return new TextDecoder().decode(decrypted)
    }
}

export class P2PConnection {
    private ws: WebSocket | null = null
    private persistentUserId: string
    private peers: Map<string, RTCPeerConnection> = new Map()
    private dataChannels: Map<string, RTCDataChannel> = new Map()
    private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map()
    private makingOffer: Map<string, boolean> = new Map()
    private ignoreOffer: Map<string, boolean> = new Map()
    private isSettingRemoteAnswerPending: Map<string, boolean> = new Map()
    private encryption = new MessageEncryption()
    private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
    private signalingServerUrl: string = ''
    
    private onPeerDiscovered?: (peerId: string, displayName: string) => void
    private onMessageReceived?: (from: string, content: string) => void
    private onPeerConnected?: (peerId: string) => void
    private onPeerDisconnected?: (peerId: string) => void

    constructor(
        persistentUserId: string,
        callbacks: {
            onPeerDiscovered?: (peerId: string, displayName: string) => void
            onMessageReceived?: (from: string, content: string) => void
            onPeerConnected?: (peerId: string) => void
            onPeerDisconnected?: (peerId: string) => void
        }
    ) {
        this.persistentUserId = persistentUserId
        this.onPeerDiscovered = callbacks.onPeerDiscovered
        this.onMessageReceived = callbacks.onMessageReceived
        this.onPeerConnected = callbacks.onPeerConnected
        this.onPeerDisconnected = callbacks.onPeerDisconnected
    }

    async connect(signalingServerUrl: string, displayName?: string) {
        this.signalingServerUrl = signalingServerUrl
        await this.encryption.initialize()
        console.log('🔐 Encryption initialized')

        return new Promise((resolve, reject) => {
            console.log('🔌 Connecting to signaling server:', signalingServerUrl)
            this.ws = new WebSocket(signalingServerUrl)

            this.ws.onopen = () => {
                console.log('✅ Connected to signaling server')
                
                this.ws?.send(JSON.stringify({
                    type: 'register',
                    persistentUserId: this.persistentUserId,
                    displayName: displayName || `User_${this.persistentUserId.slice(0, 8)}`
                }))

                resolve(true)
            }

            this.ws.onmessage = (event) => {
                try {
                    this.handleSignalingMessage(JSON.parse(event.data))
                } catch (error) {
                    console.error('Error handling signaling message:', error)
                }
            }

            this.ws.onerror = (error) => {
                console.error('❌ Signaling server error:', error)
                reject(error)
            }

            this.ws.onclose = () => {
                console.log('🔌 Disconnected from signaling server')
                // Auto-reconnect to signaling server
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect to signaling server...')
                    this.connect(signalingServerUrl, displayName)
                }, 3000)
            }
        })
    }

    private handleSignalingMessage(message: any) {
        console.log('📩 Received signaling message:', message.type)

        switch (message.type) {
            case 'peer-list':
                message.peers.forEach((peer: any) => {
                    console.log('🔍 Discovered peer:', peer.peerId, peer.displayName)
                    this.onPeerDiscovered?.(peer.peerId, peer.displayName)
                    this.savePeerToDatabase(peer.peerId, peer.displayName)
                    setTimeout(() => this.initiateConnection(peer.peerId), 100)
                })
                break

            case 'peer-joined':
                console.log('👋 New peer joined:', message.peerId, message.displayName)
                this.onPeerDiscovered?.(message.peerId, message.displayName)
                this.savePeerToDatabase(message.peerId, message.displayName)
                setTimeout(() => this.initiateConnection(message.peerId), 100)
                break

            case 'peer-left':
                console.log('👋 Peer left:', message.peerId)
                this.closePeerConnection(message.peerId)
                this.onPeerDisconnected?.(message.peerId)
                break

            case 'offer':
                this.handleOffer(message.from, message.data)
                break

            case 'answer':
                this.handleAnswer(message.from, message.data)
                break

            case 'ice-candidate':
                this.handleIceCandidate(message.from, message.data)
                break

            case 'message':
                this.handleEncryptedMessage(message.from, message.content)
                break

            case 'error':
                console.error('❌ Server error:', message.message)
                break
        }
    }

    private async savePeerToDatabase(peerId: string, displayName: string) {
        try {
            const db = await openDB('p2pchats', 1)

            await db.put('knownPeers', {
                peerId: peerId, // Use persistent ID
                displayName: displayName,
                lastSeen: Date.now()
            })
            
            // Update prevChat for sidebar
            const prevChat = await db.get('prevChat', this.persistentUserId)
            if (prevChat) {
                if (!prevChat.peers.includes(peerId)) {
                    prevChat.peers.push(peerId)
                    await db.put('prevChat', prevChat)
                }
            } else {
                await db.put('prevChat', {
                    userID: this.persistentUserId,
                    peers: [peerId]
                })
            }
            
            console.log('💾 Saved peer to database:', peerId)
        } catch (error) {
            console.error('Error saving peer:', error)
        }
    }

    private async initiateConnection(peerId: string) {
        if (this.peers.has(peerId)) {
            console.log('⚠️ Already have connection with', peerId)
            return
        }

        const polite = this.persistentUserId < peerId
        console.log(`🚀 Initiating connection with ${peerId} (${polite ? 'polite' : 'impolite'})`)
        
        const pc = this.createPeerConnection(peerId, polite)
        
        const channel = pc.createDataChannel('chat', {
            ordered: true,
            maxRetransmits: 3
        })
        this.setupDataChannel(peerId, channel)

        try {
            await this.makeOffer(peerId, pc)
        } catch (error) {
            console.error('❌ Error creating offer for', peerId, error)
        }
    }

    private async makeOffer(peerId: string, pc: RTCPeerConnection) {
        try {
            this.makingOffer.set(peerId, true)
            await pc.setLocalDescription()
            console.log('📤 Sending offer to', peerId)
            this.ws?.send(JSON.stringify({
                type: 'offer',
                to: peerId,
                data: pc.localDescription
            }))
        } finally {
            this.makingOffer.set(peerId, false)
        }
    }

    private async handleOffer(from: string, offer: RTCSessionDescriptionInit) {
        console.log('📥 Handling offer from', from)

        let pc = this.peers.get(from)
        const polite = this.persistentUserId < from
        
        if (!pc) {
            console.log('🆕 Creating new peer connection for', from)
            pc = this.createPeerConnection(from, polite)

            pc.ondatachannel = (event) => {
                console.log('📨 Received data channel from', from)
                this.setupDataChannel(from, event.channel)
            }
        }

        const offerCollision = 
            (offer.type === 'offer') &&
            (this.makingOffer.get(from) || pc.signalingState !== 'stable')

        this.ignoreOffer.set(from, !polite && offerCollision)
        
        if (this.ignoreOffer.get(from)) {
            console.log('🚫 Ignoring offer from', from, '(collision)')
            return
        }

        try {
            await pc.setRemoteDescription(offer)
            console.log('✅ Set remote description for', from)

            const pending = this.pendingCandidates.get(from) || []
            for (const candidate of pending) {
                await pc.addIceCandidate(candidate)
            }
            this.pendingCandidates.delete(from)

            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            this.ws?.send(JSON.stringify({
                type: 'answer',
                to: from,
                data: pc.localDescription
            }))
        } catch (error) {
            console.error('❌ Error handling offer from', from, error)
        }
    }

    private async handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
        const pc = this.peers.get(from)
        if (!pc) {
            console.error('❌ No peer connection found for', from)
            return
        }

        try {
            this.isSettingRemoteAnswerPending.set(from, true)
            await pc.setRemoteDescription(answer)
            console.log('✅ Set remote description (answer) for', from)

            const pending = this.pendingCandidates.get(from) || []
            for (const candidate of pending) {
                await pc.addIceCandidate(candidate)
            }
            this.pendingCandidates.delete(from)
        } catch (error) {
            console.error('❌ Error setting remote description for', from, error)
        } finally {
            this.isSettingRemoteAnswerPending.set(from, false)
        }
    }

    private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
        const pc = this.peers.get(from)
        
        if (!pc || !pc.remoteDescription || this.isSettingRemoteAnswerPending.get(from)) {
            console.log('⏳ Queuing ICE candidate for', from)
            const pending = this.pendingCandidates.get(from) || []
            pending.push(candidate)
            this.pendingCandidates.set(from, pending)
            return
        }

        try {
            await pc.addIceCandidate(candidate)
            console.log('✅ Added ICE candidate for', from)
        } catch (error) {
            console.error('❌ Error adding ICE candidate for', from, error)
        }
    }

    private createPeerConnection(peerId: string, polite: boolean): RTCPeerConnection {
        console.log('🔧 Creating peer connection for', peerId)

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceTransportPolicy: 'all'
        })

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws?.send(JSON.stringify({
                    type: 'ice-candidate',
                    to: peerId,
                    data: event.candidate
                }))
            }
        }

        pc.oniceconnectionstatechange = () => {
            console.log(`🔌 ICE state with ${peerId}:`, pc.iceConnectionState)
            
            if (pc.iceConnectionState === 'failed') {
                console.log('🔄 ICE failed, restarting...')
                pc.restartIce()
                // Schedule reconnection attempt
                this.scheduleReconnect(peerId)
            } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                console.log('✅ ICE connected with', peerId)
                // Clear any scheduled reconnects
                this.clearReconnect(peerId)
            }
        }

        pc.onconnectionstatechange = () => {
            console.log(`🔗 Connection state with ${peerId}:`, pc.connectionState)
            
            if (pc.connectionState === 'connected') {
                console.log('✅ P2P connection established with', peerId)
                this.onPeerConnected?.(peerId)
                this.clearReconnect(peerId)
            } else if (pc.connectionState === 'disconnected') {
                console.log('⚠️ P2P disconnected with', peerId)
                this.scheduleReconnect(peerId)
            } else if (pc.connectionState === 'failed') {
                console.log('❌ P2P failed with', peerId)
                this.scheduleReconnect(peerId)
            }
        }

        this.peers.set(peerId, pc)
        return pc
    }

    private scheduleReconnect(peerId: string) {
        // Clear existing timeout
        this.clearReconnect(peerId)
        
        console.log(`🔄 Scheduling reconnect for ${peerId} in 5 seconds...`)
        
        const timeout = setTimeout(() => {
            console.log(`🔄 Attempting to reconnect to ${peerId}...`)
            
            // Close old connection
            this.closePeerConnection(peerId)
            
            // Try to reconnect
            this.initiateConnection(peerId)
        }, 5000)
        
        this.reconnectTimeouts.set(peerId, timeout)
    }

    private clearReconnect(peerId: string) {
        const timeout = this.reconnectTimeouts.get(peerId)
        if (timeout) {
            clearTimeout(timeout)
            this.reconnectTimeouts.delete(peerId)
            console.log(`✅ Cleared reconnect timeout for ${peerId}`)
        }
    }

    private setupDataChannel(peerId: string, channel: RTCDataChannel) {
        console.log('📡 Setting up data channel with', peerId)

        channel.onopen = () => {
            console.log('✅ Data channel opened with', peerId)
            this.onPeerConnected?.(peerId)
        }

        channel.onmessage = async (event) => {
            console.log('💬 Received encrypted message from', peerId)
            await this.handleEncryptedMessage(peerId, event.data)
        }

        channel.onerror = (error) => {
            console.error('❌ Data channel error with', peerId, error)
        }

        channel.onclose = () => {
            console.log('🔌 Data channel closed with', peerId)
            this.dataChannels.delete(peerId)
            this.onPeerDisconnected?.(peerId)
            this.scheduleReconnect(peerId)
        }

        this.dataChannels.set(peerId, channel)
    }

    private async handleEncryptedMessage(from: string, encryptedContent: string) {
        try {
            const decrypted = await this.encryption.decrypt(encryptedContent)
            console.log('🔓 Decrypted message from', from)
            this.onMessageReceived?.(from, decrypted)
        } catch (error) {
            // Fallback to unencrypted
            this.onMessageReceived?.(from, encryptedContent)
        }
    }

    async sendMessage(toPeerId: string, content: string): Promise<boolean> {
        const channel = this.dataChannels.get(toPeerId)
        
        if (channel && channel.readyState === 'open') {
            try {
                const encrypted = await this.encryption.encrypt(content)
                channel.send(encrypted)
                console.log('✅ Sent encrypted P2P message to', toPeerId)
                return true
            } catch (error) {
                console.error('❌ Encryption error:', error)
                channel.send(content)
                return true
            }
        } else {
            console.log('⚠️ P2P channel not open, using server relay')
            
            try {
                const encrypted = await this.encryption.encrypt(content)
                this.ws?.send(JSON.stringify({
                    type: 'message',
                    to: toPeerId,
                    content: encrypted
                }))
            } catch (error) {
                this.ws?.send(JSON.stringify({
                    type: 'message',
                    to: toPeerId,
                    content: content
                }))
            }
            return false
        }
    }

    private closePeerConnection(peerId: string) {
        console.log('🔌 Closing connection with', peerId)

        const channel = this.dataChannels.get(peerId)
        if (channel) {
            channel.close()
            this.dataChannels.delete(peerId)
        }

        const pc = this.peers.get(peerId)
        if (pc) {
            pc.close()
            this.peers.delete(peerId)
        }

        this.pendingCandidates.delete(peerId)
        this.makingOffer.delete(peerId)
        this.ignoreOffer.delete(peerId)
        this.isSettingRemoteAnswerPending.delete(peerId)
    }

    getConnectedPeers(): string[] {
        return Array.from(this.dataChannels.keys()).filter(
            peerId => this.dataChannels.get(peerId)?.readyState === 'open'
        )
    }

    isConnected(peerId: string): boolean {
        const channel = this.dataChannels.get(peerId)
        return channel?.readyState === 'open'
    }

    private cleanup() {
        console.log('🧹 Cleaning up all connections')
        
        // Clear all reconnect timeouts
        this.reconnectTimeouts.forEach(timeout => clearTimeout(timeout))
        this.reconnectTimeouts.clear()
        
        this.peers.forEach((pc, peerId) => {
            this.closePeerConnection(peerId)
        })
        this.peers.clear()
        this.dataChannels.clear()
        this.pendingCandidates.clear()
    }

    disconnect() {
        this.cleanup()
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
    }
}