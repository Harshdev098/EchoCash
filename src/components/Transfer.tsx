// Updated Transfer.tsx
import React, { useState } from 'react'
import { useCashuWallet } from '../context/cashu'
import { useSelector } from 'react-redux'
import type { RootState } from '../redux/store'
import { useFedimintWallet } from '../context/fedimint'
import { useP2P } from '../context/P2PContext'
import { TransferFunds } from '../services/TransferFund'

interface TransferProps {
    setTransferForm: React.Dispatch<React.SetStateAction<boolean>>
}

export default function Transfer({ setTransferForm }: TransferProps) {
    const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
    const [transferAmount, setTransferAmount] = useState<number>(0)
    const { activeTab } = useSelector((state: RootState) => state.ActiveWalletTab)
    const { CocoManager, isCashuWalletInitialized } = useCashuWallet()
    const { Fedimintwallet, isFedWalletInitialized } = useFedimintWallet()
    
    // Use P2P hook to get peers and send functionality
    const { peers, persistentUserId, sendMessage, isP2PConnected } = useP2P()

    const TransferToPeer = async () => {
        if (!selectedPeerId || transferAmount <= 0) {
            alert("Enter valid peer and amount")
            return
        }

        // Check if wallet is initialized
        if (!activeTab && !isFedWalletInitialized) {
            alert("Fedimint wallet not initialized")
            return
        }
        if (activeTab && !isCashuWalletInitialized) {
            alert("Cashu wallet not initialized")
            return
        }

        // Check if peer is connected
        const isConnected = isP2PConnected(selectedPeerId)
        if (!isConnected) {
            alert("Peer is not connected. Please wait for P2P connection to establish.")
            return
        }

        try {
            await TransferFunds(
                activeTab,
                Fedimintwallet,
                CocoManager,
                sendMessage,
                persistentUserId,
                transferAmount,
                selectedPeerId
            )
            setTransferForm(false)
            alert("Transaction sent successfully!")
        } catch (err) {
            console.error("Error sending ecash:", err)
            alert("Failed to send transaction: " + (err as Error).message)
        }
    }

    return (
        <>
            <div className="fm-overlay" onClick={() => setTransferForm(false)} />
            <div className="fm-modal">
                <h3 className="fm-modal-title">Transact to Peers</h3>
                
                {/* Peer Selection Dropdown */}
                <div className="fm-select-wrapper">
                    <label className="fm-label">Select Peer:</label>
                    <select
                        className="fm-input"
                        value={selectedPeerId || ""}
                        onChange={(e) => setSelectedPeerId(e.target.value)}
                    >
                        <option value="">-- Select a peer --</option>
                        {peers.map((peer) => (
                            <option key={peer.peerId} value={peer.peerId}>
                                {peer.displayName} {peer.isConnected ? "✓ Connected" : "⏳ Connecting..."}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Manual Peer ID Input (fallback) */}
                <div className="fm-input-wrapper">
                    <label className="fm-label">Or enter Peer ID manually:</label>
                    <input
                        type="text"
                        className="fm-input"
                        placeholder="Enter Peer ID..."
                        value={selectedPeerId || ""}
                        onChange={(e) => setSelectedPeerId(e.target.value)}
                    />
                </div>

                {/* Amount Input */}
                <div className="fm-input-wrapper">
                    <label className="fm-label">Amount (sats):</label>
                    <input
                        type="number"
                        className="fm-input"
                        placeholder="Enter Amount"
                        value={transferAmount || ""}
                        onChange={(e) => setTransferAmount(Number(e.target.value))}
                        min="1"
                    />
                </div>

                {/* Connection Status */}
                {selectedPeerId && (
                    <div className="fm-status">
                        {isP2PConnected(selectedPeerId) ? (
                            <span className="status-connected">✓ Peer connected via P2P</span>
                        ) : (
                            <span className="status-connecting">⏳ Waiting for P2P connection...</span>
                        )}
                    </div>
                )}

                {/* Wallet Type Display */}
                <div className="fm-wallet-type">
                    <span>Using: {activeTab ? "Cashu" : "Fedimint"} Wallet</span>
                </div>

                <button 
                    className="fm-primary-btn" 
                    onClick={TransferToPeer}
                    disabled={!!(!selectedPeerId || transferAmount <= 0 || (selectedPeerId && !isP2PConnected(selectedPeerId)))}
                >
                    <i className="fa-solid fa-location-arrow"></i> 
                    {selectedPeerId && !isP2PConnected(selectedPeerId) ? "Waiting for connection..." : "Send Transaction"}
                </button>
            </div>
        </>
    )
}