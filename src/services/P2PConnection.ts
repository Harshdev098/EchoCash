// Fixed P2PConnection.ts - Handles glare and connection issues
export class P2PConnection {
    private ws: WebSocket | null = null
    private persistentUserId: string
    private peers: Map<string, RTCPeerConnection> = new Map()
    private dataChannels: Map<string, RTCDataChannel> = new Map()
    private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map()
    private makingOffer: Map<string, boolean> = new Map()
    private ignoreOffer: Map<string, boolean> = new Map()
    private isSettingRemoteAnswerPending: Map<string, boolean> = new Map()
    
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
                this.cleanup()
            }
        })
    }

    private handleSignalingMessage(message: any) {
        console.log('📩 Received signaling message:', message.type, message)

        switch (message.type) {
            case 'peer-list':
                console.log('👥 Received peer list:', message.peers)
                message.peers.forEach((peer: any) => {
                    console.log('🔍 Discovered peer:', peer.peerId, peer.displayName)
                    this.onPeerDiscovered?.(peer.peerId, peer.displayName)
                    setTimeout(() => this.initiateConnection(peer.peerId), 100)
                })
                break

            case 'peer-joined':
                console.log('👋 New peer joined:', message.peerId, message.displayName)
                this.onPeerDiscovered?.(message.peerId, message.displayName)
                setTimeout(() => this.initiateConnection(message.peerId), 100)
                break

            case 'peer-left':
                console.log('👋 Peer left:', message.peerId)
                this.closePeerConnection(message.peerId)
                this.onPeerDisconnected?.(message.peerId)
                break

            case 'offer':
                console.log('📞 Received offer from:', message.from)
                this.handleOffer(message.from, message.data)
                break

            case 'answer':
                console.log('✅ Received answer from:', message.from)
                this.handleAnswer(message.from, message.data)
                break

            case 'ice-candidate':
                console.log('🧊 Received ICE candidate from:', message.from)
                this.handleIceCandidate(message.from, message.data)
                break

            case 'message':
                console.log('💬 Received relayed message from:', message.from)
                this.onMessageReceived?.(message.from, message.content)
                break

            case 'error':
                console.error('❌ Server error:', message.message)
                break
        }
    }

    private async initiateConnection(peerId: string) {
        if (this.peers.has(peerId)) {
            console.log('⚠️ Already have connection with', peerId)
            return
        }

        // Use polite peer strategy: lower ID is polite
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
            console.log('🆕 Creating new peer connection for', from, `(${polite ? 'polite' : 'impolite'})`)
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
            console.log('🚫 Ignoring offer from', from, '(impolite, collision)')
            return
        }

        try {
            await pc.setRemoteDescription(offer)
            console.log('✅ Set remote description for', from)

            // Process pending ICE candidates
            const pending = this.pendingCandidates.get(from) || []
            for (const candidate of pending) {
                await pc.addIceCandidate(candidate)
            }
            this.pendingCandidates.delete(from)

            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            console.log('📤 Sending answer to', from)
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
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        })

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 Sending ICE candidate to', peerId, event.candidate.type)
                this.ws?.send(JSON.stringify({
                    type: 'ice-candidate',
                    to: peerId,
                    data: event.candidate
                }))
            } else {
                console.log('🏁 All ICE candidates sent for', peerId)
            }
        }

        pc.oniceconnectionstatechange = () => {
            console.log(`🔌 ICE connection state with ${peerId}:`, pc.iceConnectionState)
            
            if (pc.iceConnectionState === 'failed') {
                console.log('🔄 ICE failed, restarting...')
                pc.restartIce()
            }
        }

        pc.onconnectionstatechange = () => {
            console.log(`🔗 Connection state with ${peerId}:`, pc.connectionState)
            
            if (pc.connectionState === 'connected') {
                console.log('✅ P2P connection established with', peerId)
                this.onPeerConnected?.(peerId)
            } else if (pc.connectionState === 'disconnected') {
                console.log('⚠️ P2P connection disconnected with', peerId)
                // Don't immediately close - might reconnect
                setTimeout(() => {
                    if (pc.connectionState === 'disconnected') {
                        this.onPeerDisconnected?.(peerId)
                    }
                }, 5000)
            } else if (pc.connectionState === 'failed') {
                console.log('❌ P2P connection failed with', peerId)
                this.closePeerConnection(peerId)
                this.onPeerDisconnected?.(peerId)
            }
        }

        pc.onicegatheringstatechange = () => {
            console.log(`🧊 ICE gathering state with ${peerId}:`, pc.iceGatheringState)
        }

        this.peers.set(peerId, pc)
        return pc
    }

    private setupDataChannel(peerId: string, channel: RTCDataChannel) {
        console.log('📡 Setting up data channel with', peerId, 'state:', channel.readyState)

        channel.onopen = () => {
            console.log('✅ Data channel opened with', peerId)
            this.onPeerConnected?.(peerId)
        }

        channel.onmessage = (event) => {
            console.log('💬 Received P2P message from', peerId)
            this.onMessageReceived?.(peerId, event.data)
        }

        channel.onerror = (error) => {
            console.error('❌ Data channel error with', peerId, error)
        }

        channel.onclose = () => {
            console.log('🔌 Data channel closed with', peerId)
            this.dataChannels.delete(peerId)
        }

        this.dataChannels.set(peerId, channel)
    }

    async sendMessage(toPeerId: string, content: string): Promise<boolean> {
        const channel = this.dataChannels.get(toPeerId)
        
        if (channel && channel.readyState === 'open') {
            channel.send(content)
            console.log('✅ Sent P2P message to', toPeerId)
            return true
        } else {
            console.log('⚠️ P2P channel not open, using server relay for', toPeerId)
            this.ws?.send(JSON.stringify({
                type: 'message',
                to: toPeerId,
                content: content
            }))
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