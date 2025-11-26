import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

let dbPromise: Promise<IDBPDatabase<any>>;

export const getDB = () => {
    if (!dbPromise) {
        dbPromise = openDB('p2pchats', 2, { // Increment version to 2
            upgrade(db, oldVersion) {
                // Version 1 stores
                if (oldVersion < 1) {
                    if (!db.objectStoreNames.contains('userProfile')) {
                        db.createObjectStore('userProfile', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('peerMapping')) {
                        db.createObjectStore('peerMapping', { keyPath: 'peerId' });
                    }
                    if (!db.objectStoreNames.contains('p2pnaming')) {
                        db.createObjectStore('p2pnaming', { keyPath: 'peerid' });
                    }
                    if (!db.objectStoreNames.contains('prevChat')) {
                        db.createObjectStore('prevChat', { keyPath: 'userID' });
                    }
                    if (!db.objectStoreNames.contains('chat')) {
                        db.createObjectStore('chat', { keyPath: ['userID', 'peerID'] });
                    }
                    if (!db.objectStoreNames.contains('community')) {
                        db.createObjectStore('community', { keyPath: 'cID' });
                    }
                    if (!db.objectStoreNames.contains('pendingMessages')) {
                        db.createObjectStore('pendingMessages', { keyPath: ['from', 'to'] });
                    }
                }
                
                // Version 2: Add knownPeers store
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains('knownPeers')) {
                        db.createObjectStore('knownPeers', { keyPath: 'peerId' });
                        console.log('✅ Created knownPeers object store');
                    }
                }
            }
        });
    }
    return dbPromise;
};