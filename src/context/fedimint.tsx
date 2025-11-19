import React, { createContext, useCallback, useEffect, useContext, useState } from "react";
import {
    listClients,
    openWallet,
    Wallet,
} from "@fedimint/core-web";
import type { FederationConfig } from "../hooks/Federation.type";
import { setFederationDetails } from "../redux/Federation";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../redux/store";
import webloader from '../assets/loader.webp'

type FedimintContextType = {
    Fedimintwallet: Wallet | null;
    isFedWalletInitialized: boolean;
    fedimintWalletStatus: "open" | "closed" | "opening";
    setisFedWalletInitialized: React.Dispatch<React.SetStateAction<boolean>>;
    setFedimintWalletStatus: React.Dispatch<
        React.SetStateAction<"open" | "closed" | "opening">
    >;
};

const FedimintContext = createContext<FedimintContextType | undefined>(
    undefined
);

export const FedimintProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [Fedimintwallet, setFedimintWallet] = useState<Wallet | null>(null);
    const [isFedWalletInitialized, setisFedWalletInitialized] =
        useState<boolean>(false);
    const [fedimintWalletStatus, setFedimintWalletStatus] = useState<
        "open" | "closed" | "opening"
    >("closed");
    const dispatch = useDispatch<AppDispatch>()
    const [loader,setLoader]=useState(false)

    const InitailizeFedWallet = useCallback(async () => {
        const walletId = localStorage.getItem("FedimintWalletId");
        const clients = listClients();
        const targetWalletId =
            walletId ?? (clients.length > 0 ? clients[0].id : null);
        console.log(
            "target wallet id is ",
            targetWalletId,
            "and local storage is ",
            walletId,
            clients
        );

        if (targetWalletId) {
            console.log("Opening wallet with id:", targetWalletId);
            setFedimintWalletStatus("opening");
            try {
                const wallet = await openWallet(targetWalletId);
                setisFedWalletInitialized(true);
                setFedimintWallet(wallet);
                setFedimintWalletStatus("open");
                localStorage.setItem('FedimintWalletId', wallet.id)
                console.log("wallet opened is ", wallet);
            } catch (err) {
                console.log("an error occured", err)
            }
        }
    }, []);

    const FederationDetails = useCallback(async () => {
        const result = await Fedimintwallet?.federation.getConfig() as FederationConfig
        console.log("result of get config is ", result)
        dispatch(setFederationDetails({ federationConfig: result, federationId: Fedimintwallet?.federationId ?? null }))
    }, [Fedimintwallet, dispatch])

    // run on mount
    useEffect(() => {
        const init = async () => {
            setLoader(true)
            await InitailizeFedWallet();
            if(fedimintWalletStatus==='open'){
                await FederationDetails();
            }
            setLoader(false)
        };
        init();
    }, [InitailizeFedWallet,isFedWalletInitialized]);

    if (loader) {
        return (
            <div className="web-loader" style={{ backgroundColor: '#e4eef3' }}>
                <img src={webloader} alt="loading" />
            </div>
        );
    }

    return (
        <FedimintContext.Provider
            value={{
                Fedimintwallet,
                isFedWalletInitialized,
                fedimintWalletStatus,
                setisFedWalletInitialized,
                setFedimintWalletStatus,
            }}
        >
            {children}
        </FedimintContext.Provider>
    );
};

export const useFedimintWallet = () => {
    const context = useContext(FedimintContext);
    if (!context) {
        throw new Error("useFedimintWallet must be used within FedimintProvider");
    }
    return context;
};

export default FedimintContext;
