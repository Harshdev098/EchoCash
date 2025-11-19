// Updated server.js
import { WebSocketServer } from "ws";
import { createChatNode } from "./chatNode.js";

const wss = new WebSocketServer({ port: 8080 });
let chatNode;
let clients = new Set();
const peerSocketMap = new Map(); // Maps peer ID to socket
const persistentUserMap = new Map(); // Maps persistent user ID to current peer ID
const peerToPersistentMap = new Map(); // Maps peer ID to persistent user ID

async function init() {
    chatNode = await createChatNode(
        (peers) => {
            clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    console.log("peers are ", peers);
                    client.send(JSON.stringify({ type: 'peers', data: peers }));
                }
            });
        },
        (message, fromPeerId) => {
            console.log(`Forwarding gossip message from ${fromPeerId} to client`);
            const targetSocket = peerSocketMap.get(fromPeerId);
            if (targetSocket && targetSocket.readyState === targetSocket.OPEN) {
                // Get persistent user ID for the sender
                const persistentUserId = peerToPersistentMap.get(fromPeerId);
                targetSocket.send(JSON.stringify({
                    type: 'message',
                    from: persistentUserId || fromPeerId, // Use persistent ID if available
                    content: message,
                }));
            } else {
                console.log(`No WS client found for peer ${fromPeerId}`);
            }
        }
    );
}

init().then(() => {
    console.log("ws server started");
}).catch((err) => {
    console.log("an error occurred while starting ws", err);
});

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    if (chatNode) {
        ws.send(JSON.stringify({ type: 'peers', data: chatNode.getPeers() }));
        ws.send(JSON.stringify({ type: 'peerId', data: chatNode.node.peerId.toString() }));
    }

    ws.on('message', async (msg) => {
        console.log("message received");
        const message = JSON.parse(msg);
        
        if (message.type === 'search-peers') {
            console.log('Manual peer discovery triggered');
            await chatNode.triggerDiscovery();
            
        } else if (message.type === 'message') {
            console.log("message received", message);
            const { to, content, from } = message;
            
            // Get the current peer ID for the target persistent user
            const targetPeerId = persistentUserMap.get(to) || to;
            
            await chatNode.sendMessage(targetPeerId, content);
            const targetSocket = peerSocketMap.get(targetPeerId);
            if (targetSocket && targetSocket.readyState === targetSocket.OPEN) {
                targetSocket.send(JSON.stringify({
                    type: 'message',
                    from: from || ws.persistentUserId,
                    content: content,
                }));
            } else {
                console.log(`Peer ${targetPeerId} not found or not connected`);
            }
            
        } else if (message.type === 'register') {
            const { peerId, persistentUserId } = message;
            
            // Map peer ID to socket
            peerSocketMap.set(peerId, ws);
            ws.peerId = peerId;
            
            // If persistent user ID is provided, create the mapping
            if (persistentUserId) {
                persistentUserMap.set(persistentUserId, peerId);
                peerToPersistentMap.set(peerId, persistentUserId);
                ws.persistentUserId = persistentUserId;
                
                console.log(`Registered peerId ${peerId} with persistent ID ${persistentUserId}`);
            } else {
                console.log(`Registered peerId ${peerId} without persistent ID`);
            }
            
        } else if (message.type === 'public-post') {
            const { content, from, timestamp } = message;
            
            // Broadcast to all connected clients
            for (const [, client] of peerSocketMap) {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({
                        type: 'public-post',
                        from: from,
                        content: content,
                        timestamp: timestamp || Date.now()
                    }));
                }
            }
            
        } else if (message.type === 'get-peer-info') {
            // Helper endpoint to get peer information
            const { peerId } = message;
            const persistentId = peerToPersistentMap.get(peerId);
            
            ws.send(JSON.stringify({
                type: 'peer-info',
                peerId: peerId,
                persistentUserId: persistentId,
                isOnline: peerSocketMap.has(peerId)
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        
        if (ws.peerId) {
            peerSocketMap.delete(ws.peerId);
            
            // Clean up persistent user mapping
            if (ws.persistentUserId) {
                // Only remove if this was the current peer for this persistent user
                if (persistentUserMap.get(ws.persistentUserId) === ws.peerId) {
                    persistentUserMap.delete(ws.persistentUserId);
                }
                peerToPersistentMap.delete(ws.peerId);
                
                console.log(`Unregistered peerId ${ws.peerId} and persistent ID ${ws.persistentUserId}`);
            } else {
                console.log(`Unregistered peerId ${ws.peerId}`);
            }
        }

        clients.delete(ws);
    });
});

setInterval(() => {
    for (const [persistentId, peerId] of persistentUserMap.entries()) {
        if (!peerSocketMap.has(peerId)) {
            console.log(`Cleaning up stale mapping for persistent ID ${persistentId}`);
            persistentUserMap.delete(persistentId);
        }
    }
    
    for (const [peerId, persistentId] of peerToPersistentMap.entries()) {
        if (!peerSocketMap.has(peerId)) {
            console.log(`Cleaning up stale reverse mapping for peer ID ${peerId}`);
            peerToPersistentMap.delete(peerId);
        }
    }
}, 60000); 