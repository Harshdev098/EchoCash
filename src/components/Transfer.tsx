import React, { useState } from 'react'

interface TransferProps {
    setTransferForm: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Transfer({ setTransferForm }: TransferProps) {
    const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
    const [transferAmount, setTransferAmount] = useState<number>(0)

    const TransferToPeer = () => {

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
