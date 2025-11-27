// services/Socket.ts - COMPLETE FIX
import { setPeerid, setUserId } from "../redux/PeerSlice";
import type { AppDispatch } from "../redux/store";
import React from "react";
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../components/db';

/**
 * FIXED: Gets or creates a TRULY persistent user ID
 * Same ID will be returned across ALL sessions in the same browser
 */
export const getPersistentUserId = async (): Promise<string> => {
    const db = await getDB();
    
    // Get ALL user profiles to find existing one
    const allProfiles = await db.getAll('userProfile');
    
    if (allProfiles.length > 0) {
        // Found existing profile - REUSE IT!
        const existingProfile = allProfiles[0];
        console.log('✅ REUSING existing persistent ID:', existingProfile.persistentUserId || existingProfile.id);
        return existingProfile.persistentUserId || existingProfile.id;
    }
    
    // No profile exists - create NEW one (only happens FIRST TIME EVER)
    const newUserId = uuidv4();
    const newProfile = {
        id: newUserId, // Use UUID as primary key
        persistentUserId: newUserId,
        displayName: `User_${newUserId.slice(0, 8)}`,
        createdAt: Date.now(),
    };
    
    await db.put('userProfile', newProfile);
    console.log('🆕 CREATED new persistent ID (first time):', newUserId);
    
    return newUserId;
};

export const CreateSocket = (socket: WebSocket | null, userId: string, dispatch: AppDispatch, setSocket: React.Dispatch<React.SetStateAction<WebSocket | null>>) => {
    socket = new WebSocket('https://echocash-2.onrender.com');
    console.log("Socket created:", socket);

    socket.onopen = () => {
        console.log('WebSocket connection opened');
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        if (message.type === 'peers') {
            dispatch(setPeerid(message.data));
        } else if (message.type === 'peerId') {
            dispatch(setUserId(message.data));
            socket?.send(
                JSON.stringify({
                    type: 'register',
                    peerId: message.data,
                    persistentUserId: userId,
                })
            );
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
        setSocket(null);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    return socket;
}