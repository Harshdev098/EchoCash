import React, { useContext, useState } from 'react'
import { useCashuWallet } from '../context/cashu';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { useFedimintWallet } from '../context/fedimint';
import SocketContext from '../context/socket';
import { TransferFunds } from '../services/TransferFund';

interface TransferProps {
    setTransferForm: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Transfer({ setTransferForm }: TransferProps) {
    const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
    const [transferAmount, setTransferAmount] = useState<number>(0)
    const { activeTab } = useSelector((state: RootState) => state.ActiveWalletTab)
    const { CocoManager } = useCashuWallet()
    const { Fedimintwallet } = useFedimintWallet();
    const { socket,persistentUserId } = useContext(SocketContext);

    const TransferToPeer = async () => {
        if (!selectedPeerId || transferAmount <= 0) {
            alert("Enter valid peer and amount");
            return;
        }
        try {
            await TransferFunds(activeTab,Fedimintwallet,CocoManager,socket,persistentUserId,transferAmount,selectedPeerId)
            setTransferForm(false)
        } catch (err) {
            console.log("Error sending ecash:", err);
        }
    }

    return (
        <>
            <div className="fm-overlay" onClick={() => setTransferForm(false)} />

            <div className="fm-modal">
                <h3 className="fm-modal-title">Transact to Peers</h3>

                <input
                    type="text"
                    className="fm-input"
                    placeholder="Enter Peer ID..."
                    value={selectedPeerId || ""}
                    onChange={(e) => setSelectedPeerId(e.target.value)}
                />
                <input
                    type="text"
                    className="fm-input"
                    placeholder="Enter Amount"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(Number(e.target.value))}
                />

                <button className="fm-primary-btn" onClick={TransferToPeer}>
                    <i className="fa-solid fa-location-arrow"></i> Transact
                </button>
            </div>
        </>
    )
}
