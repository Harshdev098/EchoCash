import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

interface listItem {
    listItem: string[]
}

const initialState: listItem = {
    listItem: (() => {
        const stored = localStorage.getItem('chatList');
        try {
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    })()
}

export const ChatList = createSlice({
    name: "ChatList",
    initialState: initialState,
    reducers: {
        setListItem: (state, action: PayloadAction<string[]>) => {
            state.listItem = action.payload
        }
    }
})

export const { setListItem }=ChatList.actions
export default ChatList.reducer;