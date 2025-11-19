import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const initialState={
    balance:0
}

export const BalanceSlice=createSlice({
    name:"Balance",
    initialState,
    reducers:{
        setBalance:(state,action:PayloadAction<number>)=>{
            state.balance=action.payload
        }
    }
})

export const {setBalance}=BalanceSlice.actions
export default BalanceSlice.reducer