import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Manager } from 'coco-cashu-core';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { IndexedDbRepositories } from "coco-cashu-indexeddb";


type CashuContextType = {
    CocoManager: Manager | null
    isCashuWalletInitialized: boolean;
    setisCashuWalletInitialized: React.Dispatch<React.SetStateAction<boolean>>;
};

const CashuContext = createContext<CashuContextType | undefined>(undefined)

export const CashuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [CocoManager, setCocoManager] = useState<Manager | null>(null)
    const [isCashuWalletInitialized, setisCashuWalletInitialized] = useState<boolean>(false)

    async function seedGetter(): Promise<Uint8Array> {
        let mnemonic = localStorage.getItem("coco-mnemonic");

        if (!mnemonic) {
            mnemonic = bip39.generateMnemonic(wordlist);
            localStorage.setItem("coco-mnemonic", mnemonic);
        }

        return new TextEncoder().encode(mnemonic);
    }


    const InitailizeCashuWallet = useCallback(async () => {
        console.log("initailzing coco cashu")
        const repo = new IndexedDbRepositories({ name: 'coco-echosphere' });
        await repo.init();
        const manager = new Manager(repo, seedGetter)
        setCocoManager(manager)
        let mintFromLocal = localStorage.getItem('trustedMint')
        if (mintFromLocal) {
            manager.mint.addMint(mintFromLocal)
            setisCashuWalletInitialized(true)
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            await InitailizeCashuWallet();
        };
        init();
    }, [InitailizeCashuWallet]);

    useEffect(() => {
        if (!CocoManager) return;

        (async () => {
            await CocoManager.enableMintQuoteWatcher();
            await CocoManager.enableMintQuoteProcessor();
            await CocoManager.enableProofStateWatcher();
        })();
    }, [CocoManager, isCashuWalletInitialized]);


    return (
        <CashuContext.Provider value={{ isCashuWalletInitialized, setisCashuWalletInitialized, CocoManager }}>
            {children}
        </CashuContext.Provider>
    )
}

export const useCashuWallet = () => {
    const context = useContext(CashuContext)
    if (!context) {
        throw new Error("useFedimintWallet must be used within FedimintProvider");
    }
    return context;
}
export default CashuContext;