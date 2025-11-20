import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const initialState={
    FedBalance:0,
    cashuBalance:0
}

export const BalanceSlice=createSlice({
    name:"Balance",
    initialState,
    reducers:{
        setFedBalance:(state,action:PayloadAction<number>)=>{
            state.FedBalance=action.payload
        },
        setCashuBalance:(state,action:PayloadAction<number>)=>{
            state.cashuBalance=action.payload
        }
    }
})

export const {setFedBalance,setCashuBalance}=BalanceSlice.actions
export default BalanceSlice.reducer