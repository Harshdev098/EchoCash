import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { yamux } from '@chainsafe/libp2p-yamux'
import { mdns } from '@libp2p/mdns'
import { identify } from '@libp2p/identify'
import { bootstrap } from '@libp2p/bootstrap'

export async function createNode() {
    const bootstrapMultiaddrs = [
        '/dnsaddr/bootstrap.libp2p.io/ipfs/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    ]
    const node = await createLibp2p({
        addresses: {
            listen: ['/ip4/0.0.0.0/tcp/0']
        },
        transports: [tcp()],
        streamMuxers: [yamux(), mplex()],
        connectionEncrypters: [noise()],
        peerDiscovery: [
            mdns({
                interval: 1000
            }),
            bootstrap({
                list:bootstrapMultiaddrs
            })
        ],
        services: {
            pubsub: gossipsub(),
            identify: identify()
        }
    })
    return node
}