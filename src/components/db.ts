// utils/db.ts
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

let dbPromise: Promise<IDBPDatabase<any>>;

export const getDB = () => {
    if (!dbPromise) {
        dbPromise = openDB('p2pchats', 1, {
            upgrade(db) {
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
        });
    }
    return dbPromise;
};
