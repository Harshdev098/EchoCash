import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { FederationConfig } from "../hooks/Federation.type";

interface FederationDetails{
    federationId:string | null,
    federationConfig: FederationConfig | null
}

const initialState: FederationDetails = {
    federationId:null,
    federationConfig:null
}

export const FederationSlice = createSlice({
    name: "Federation",
    initialState,
    reducers: {
        setFederationDetails: (state,action:PayloadAction<FederationDetails>) => {
            state.federationConfig=action.payload.federationConfig
            state.federationId=action.payload.federationId
        }
    }
})

export const { setFederationDetails } = FederationSlice.actions
export default FederationSlice.reducer