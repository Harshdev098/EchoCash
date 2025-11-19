import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const initialState = {
    activeTab: true // true -> cashu, false -> fedimint
}

export const ActiveWalletTab = createSlice({
    name: "ActiveWalletTab",
    initialState,
    reducers: {
        setActiveWalletTab: (state, action: PayloadAction<boolean>) => {
            state.activeTab = action.payload
        }
    }
})


export const { setActiveWalletTab } = ActiveWalletTab.actions
export default ActiveWalletTab.reducer;