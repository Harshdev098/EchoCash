import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { openDB } from "idb";

interface Peer {
    peerCount: number,
    peerId: string[],
    UserId: string,
    name: { peerId: string, name: string }[],
}
const initialState: Peer = {
    peerCount: 0,
    peerId: [''],
    UserId: '',
    name: []
}

export const PeerSlice = createSlice({
    name: 'Peer',
    initialState,
    reducers: {
        setPeerid: (state, action: PayloadAction<string[]>) => {
            console.log('setPeerid reducer called with payload:', action.payload);
            state.peerId = action.payload;
            state.peerCount = action.payload.length;
            console.log('Updated peerCount:', state.peerCount);
        },
        setUserId: (state, action: PayloadAction<string>) => {
            state.UserId = action.payload
        },
        setName: (state, action: PayloadAction<{ peerId: string, name: string }>) => {
            const { peerId, name } = action.payload;
            const existing = state.name.find((item) => item.peerId === peerId);
            if (existing) {
                existing.name = name;
            } else {
                state.name.push({ peerId, name });
            }
        }
    }
})

export const { setPeerid, setUserId, setName } = PeerSlice.actions;
export default PeerSlice.reducer;