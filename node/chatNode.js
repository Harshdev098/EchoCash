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

    // Subscribe to chat topic for this peer
    const topic = `${node.peerId.toString()}`;
    node.services.pubsub.subscribe(topic);
    node.services.pubsub.addEventListener('message', (evt) => {
        if (evt.detail.topic === topic) {
            const message = new TextDecoder().decode(evt.detail.data);
            const fromPeerId = evt.detail.from.toString();
            console.log(`Received message on topic ${topic} from ${fromPeerId}:`, message);
            onMessage(message, fromPeerId);
        }
    });

    const triggerDiscovery = async () => {
        console.log("Triggering discovery");
        await node.start()
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
        const topic = `${node.peerId.toString()}`;
        try {
            await node.services.pubsub.publish(topic, new TextEncoder().encode(content));
            console.log(`Published message to ${topic}: from ${toPeerId}`, content);
        } catch (err) {
            console.error(`Error publishing message to ${topic}: `, err);
        }
    };

    return { node, getPeers, triggerDiscovery, connectToPeer, sendMessage };
};