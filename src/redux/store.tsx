import {configureStore} from '@reduxjs/toolkit'
import PeerSlice from './PeerSlice'
import ChatList from './ChatList'
import FederationSlice from './Federation'
import BalanceSlice from './Balance'
import ActiveWalletTab from './WalletTab'

export const store=configureStore({
    reducer:{
        Peers:PeerSlice,
        ChatList:ChatList,
        FederationSlice:FederationSlice,
        BalanceSlice:BalanceSlice,
        ActiveWalletTab:ActiveWalletTab,
    }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch