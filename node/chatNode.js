import { createNode } from "./config.js";

export const createChatNode = async (onPeerUpdate, onMessage) => {
    const node = await createNode();
    await node.start();

    node.getMultiaddrs().forEach((addr) => {
        console.log("Node listening on:", addr.toString());
    });

    const peers = new Set();

    node.addEventListener('peer:discovery', (evt) => {
        const peerId = evt.detail.id.toString();
        console.log('Discovered peer:', peerId, 'with multiaddrs:', evt.detail.multiaddrs.map(addr => addr.toString()));
        
        if (!peers.has(peerId)) {
            peers.add(peerId);
            onPeerUpdate(Array.from(peers));
        }
    });

    // Subscribe to THIS node's own topic to receive messages
    const myTopic = `chat-${node.peerId.toString()}`;
    node.services.pubsub.subscribe(myTopic);
    console.log(`Subscribed to own topic: ${myTopic}`);

    node.services.pubsub.addEventListener('message', (evt) => {
        console.log(`Received message on topic: ${evt.detail.topic}`);
        
        // Only process messages on this node's topic
        if (evt.detail.topic === myTopic) {
            const message = new TextDecoder().decode(evt.detail.data);
            const fromPeerId = evt.detail.from.toString();
            console.log(`Received message from ${fromPeerId}:`, message);
            onMessage(message, fromPeerId);
        }
    });

    const triggerDiscovery = async () => {
        console.log("Triggering discovery");
        // Discovery is already running via mdns and bootstrap
        // Just return the current peers
        return Array.from(peers);
    };

    const getPeers = () => Array.from(peers);

    const connectToPeer = async (multiaddr) => {
        try {
            await node.dial(multiaddr);
            console.log(`Connected to peer via ${multiaddr}`);
        } catch (err) {
            console.error(`Failed to connect to ${multiaddr}:`, err);
        }
    };

    const sendMessage = async (toPeerId, content) => {
        // Publish to the RECIPIENT's topic, not your own
        const topic = `chat-${toPeerId}`;
        
        try {
            // Check if the peer is connected
            const connections = node.getConnections(toPeerId);
            
            if (connections.length === 0) {
                console.log(`Peer ${toPeerId} not connected, attempting to dial...`);
                
                // Try to find the peer in the peerstore
                const peerInfo = await node.peerStore.get(toPeerId).catch(() => null);
                
                if (peerInfo && peerInfo.addresses.length > 0) {
                    // Try to connect to the peer
                    await node.dial(toPeerId);
                    console.log(`Successfully connected to ${toPeerId}`);
                } else {
                    throw new Error(`Peer ${toPeerId} not found in peerstore`);
                }
            }

            // Wait a bit for the connection to stabilize
            await new Promise(resolve => setTimeout(resolve, 100));

            // Publish the message to the recipient's topic
            await node.services.pubsub.publish(
                topic, 
                new TextEncoder().encode(content)
            );
            
            console.log(`Published message to topic ${topic}:`, content);
        } catch (err) {
            console.error(`Error publishing message to ${topic}:`, err.message);
            throw err;
        }
    };

    return { node, getPeers, triggerDiscovery, connectToPeer, sendMessage };
};