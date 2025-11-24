// node/signaling-server.js
// Lightweight signaling server for WebRTC peer discovery
// One person runs this on their device, others connect to it

import { WebSocketServer } from 'ws';
import { networkInterfaces } from 'os';

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

const peers = new Map(); // persistentId -> { ws, peerInfo }

wss.on('connection', (ws, req) => {
    console.log('New peer connected from:', req.socket.remoteAddress);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(ws, message);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        if (ws.persistentId) {
            console.log('Peer disconnected:', ws.persistentId);
            peers.delete(ws.persistentId);
            
            // Notify all other peers
            broadcast({
                type: 'peer-left',
                peerId: ws.persistentId
            }, ws.persistentId);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function handleMessage(ws, message) {
    switch (message.type) {
        case 'register':
            handleRegister(ws, message);
            break;
        
        case 'offer':
        case 'answer':
        case 'ice-candidate':
            // Forward WebRTC signaling to specific peer
            forwardSignaling(ws, message);
            break;
        
        case 'message':
            // Relay message (fallback if WebRTC not connected)
            relayMessage(ws, message);
            break;
        
        case 'public-post':
            // Broadcast public post to all peers
            broadcastPublicPost(ws, message);
            break;
        
        case 'get-peers':
            sendPeerList(ws);
            break;
        
        default:
            console.log('Unknown message type:', message.type);
    }
}

function handleRegister(ws, message) {
    const { persistentUserId, displayName } = message;
    
    // Check if this user is already registered
    const existingPeer = peers.get(persistentUserId);
    
    if (existingPeer) {
        console.log(`⚠️ User ${persistentUserId} already registered, closing OLD connection`);
        
        // Close the OLD socket, not the new one
        if (existingPeer.ws !== ws && existingPeer.ws.readyState === existingPeer.ws.OPEN) {
            try {
                existingPeer.ws.close();
            } catch (err) {
                console.error('Error closing old connection:', err);
            }
        }
    }
    
    ws.persistentId = persistentUserId;
    peers.set(persistentUserId, {
        ws,
        displayName: displayName || `User_${persistentUserId.slice(0, 8)}`,
        connectedAt: Date.now()
    });
    
    console.log(`✅ Peer registered: ${persistentUserId} (${peers.get(persistentUserId).displayName})`);
    
    // Send current peer list
    sendPeerList(ws);
    
    // Only notify others if this is a genuinely new peer (not reconnection)
    if (!existingPeer) {
        broadcast({
            type: 'peer-joined',
            peerId: persistentUserId,
            displayName: peers.get(persistentUserId).displayName
        }, persistentUserId);
    }
}

function forwardSignaling(senderWs, message) {
    const { to, type, data } = message;
    const targetPeer = peers.get(to);
    
    if (targetPeer && targetPeer.ws.readyState === targetPeer.ws.OPEN) {
        targetPeer.ws.send(JSON.stringify({
            type: type,
            from: senderWs.persistentId,
            data: data
        }));
        console.log(`Forwarded ${type} from ${senderWs.persistentId} to ${to}`);
    } else {
        senderWs.send(JSON.stringify({
            type: 'error',
            message: 'Target peer not connected'
        }));
    }
}

function relayMessage(senderWs, message) {
    const { to, content } = message;
    const targetPeer = peers.get(to);
    
    if (targetPeer && targetPeer.ws.readyState === targetPeer.ws.OPEN) {
        targetPeer.ws.send(JSON.stringify({
            type: 'message',
            from: senderWs.persistentId,
            content: content,
            timestamp: Date.now()
        }));
    } else {
        senderWs.send(JSON.stringify({
            type: 'message-failed',
            to: to,
            reason: 'Peer offline'
        }));
    }
}

function sendPeerList(ws) {
    const peerList = Array.from(peers.entries())
        .filter(([id]) => id !== ws.persistentId)
        .map(([id, info]) => ({
            peerId: id,
            displayName: info.displayName
        }));
    
    ws.send(JSON.stringify({
        type: 'peer-list',
        peers: peerList
    }));
}

function broadcastPublicPost(senderWs, message) {
    const { content } = message;
    
    // Broadcast to all peers
    broadcast({
        type: 'public-post',
        from: senderWs.persistentId,
        content: content,
        timestamp: Date.now()
    });
    
    console.log(`Public post from ${senderWs.persistentId} broadcasted to all peers`);
}

function broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    peers.forEach((peerInfo, peerId) => {
        if (peerId !== excludeId && peerInfo.ws.readyState === peerInfo.ws.OPEN) {
            peerInfo.ws.send(data);
        }
    });
}

// Display server info
console.log('\n🌐 Signaling Server Started!');
console.log('\nConnect from other devices using:');

const nets = networkInterfaces();
Object.values(nets).forEach(netArray => {
    netArray?.forEach(net => {
        if (net.family === 'IPv4' && !net.internal) {
            console.log(`  ws://${net.address}:${PORT}`);
        }
    });
});

console.log('\n📱 Share this URL with others to connect!\n');