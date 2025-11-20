import { setPeerid, setUserId } from "../redux/PeerSlice";
import type { AppDispatch } from "../redux/store";
import React from "react";
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../components/db';


export const getPersistentUserId = async (): Promise<string> => {
    const db = await getDB();
    let userProfile = await db.get('userProfile', 'main');

    if (!userProfile) {
        const newUserId = uuidv4();
        userProfile = {
            id: 'main',
            persistentUserId: newUserId,
            displayName: `User_${newUserId.slice(0, 8)}`,
            createdAt: Date.now(),
        };
        await db.put('userProfile', userProfile);
    }
    return userProfile.persistentUserId;
};

export const CreateSocket = (socket: WebSocket | null, userId: string, dispatch: AppDispatch, setSocket: React.Dispatch<React.SetStateAction<WebSocket | null>>) => {
    socket = new WebSocket('ws://localhost:8080');
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