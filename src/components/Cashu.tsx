import { useEffect, useState } from "react";
import { Link } from "react-router";
import AddFund from "./AddFund";
import Transfer from "./Transfer";
import { useCashuWallet } from "../context/cashu";
import { doneProgress, startProgress } from "../utils/Progress";
import type { HistoryEntry, MintHistoryEntry } from "coco-cashu-core";

export default function Cashu() {
    const [mintURL, setMintURL] = useState<string | null>(null);
    const [openJoinFedForm, setOpenJoinFedForm] = useState<boolean>(false);
    const [openFundForm, setOpenFundForm] = useState<boolean>(false);
    const [transferForm, setTransferForm] = useState<boolean>(false);
    const { CocoManager, isCashuWalletInitialized, setisCashuWalletInitialized } = useCashuWallet();
    const [mintInfo, setMintInfo] = useState<{ url: string; name?: string; pubkey?: string } | null>(null);
    const [transaction, setTransaction] = useState<HistoryEntry[]>([]);

    const TrustMint = async () => {
        try {
            startProgress();
            if (!mintURL) throw new Error("Mint URL required");
            const info = await CocoManager?.mint.addMint(mintURL, { trusted: true });
            const mintInfo=await CocoManager?.mint.getMintInfo(mintURL)
            setMintInfo({ url: mintURL, name: mintInfo?.name, pubkey: mintInfo?.pubkey });
            localStorage.setItem('trustedMint', info?.mint.mintUrl ?? '');
            setisCashuWalletInitialized(true);
        } catch (err) {
            console.error("Failed to add mint:", err);
        } finally {
            setOpenJoinFedForm(false);
            doneProgress();
        }
    };

    useEffect(() => {
        const init = async () => {
            const mint = localStorage.getItem('trustedMint');
            if (mint && CocoManager) {
                const info = await CocoManager.mint.getMintInfo(mint);
                console.log("the mint info is ",info)
                setMintInfo({ url: mint, name: info?.name, pubkey: info?.pubkey });
                const tx = await CocoManager.history.getPaginatedHistory();
                setTransaction(tx || []);
            }
        };
        init();
    }, [CocoManager]);

    return (
        <>
            {openJoinFedForm && (
                <>
                    <div className="fm-overlay" onClick={() => setOpenJoinFedForm(false)} />
                    <div className="fm-modal">
                        <h3 className="fm-modal-title">Add Trusted Mint</h3>
                        <input
                            type="text"
                            className="fm-input"
                            placeholder="Enter the mint URL"
                            value={mintURL || ""}
                            onChange={(e) => setMintURL(e.target.value)}
                        />
                        <button className="fm-primary-btn" onClick={TrustMint}>
                            Add Mint
                        </button>
                    </div>
                </>
            )}

            {openFundForm && <AddFund setOpenFundForm={setOpenFundForm} />}
            {transferForm && <Transfer setTransferForm={setTransferForm} />}

            <div className="fm-container">
                {!isCashuWalletInitialized ? (
                    <section className="fm-card fm-welcome-card">
                        <i className="fa-solid fa-coins fm-welcome-icon fm-cashu-icon"></i>
                        <h2 className="fm-welcome-title">Cashu Ecash Wallet</h2>
                        <p className="fm-subtext">
                            Add a trusted mint to start using private, instant, and fee-less ecash.
                            &nbsp;<Link to="/chat/settings#faq" className="fm-link">Learn more</Link>
                        </p>
                        <button className="fm-primary-btn fm-activate-btn" onClick={() => setOpenJoinFedForm(true)}>
                            <i className="fa-solid fa-plus"></i> Add Mint & Activate
                        </button>
                    </section>
                ) : (
                    <>
                        {/* Balance Card */}
                        <section className="fm-card fm-balance-card fm-cashu-balance">
                            <div className="fm-balance-header">
                                <span className="fm-balance-label">Cashu Balance</span>
                                <h2 className="fm-balance-amount fm-cashu-gradient">
                                    0 <span className="fm-balance-sats">SAT</span>
                                </h2>
                            </div>
                            <div className="fm-action-buttons">
                                <button className="fm-secondary-btn" onClick={() => setOpenFundForm(true)}>
                                    <i className="fa-solid fa-arrow-down-long"></i> Receive
                                </button>
                                <button className="fm-secondary-btn" onClick={() => setTransferForm(true)}>
                                    <i className="fa-solid fa-paper-plane"></i> Send Token
                                </button>
                            </div>
                        </section>

                        {/* Mint Info */}
                        <section className="fm-card fm-federation-card">
                            <h3 className="fm-section-title">
                                <i className="fa-solid fa-vault fm-cashu-icon"></i> Trusted Mint
                            </h3>
                            <div className="fm-federation-grid">
                                <div>
                                    <strong>Name:</strong><br />
                                    {mintInfo?.name || 'Unknown'}
                                </div>
                                <div>
                                    <strong>URL:</strong><br />
                                    <code className="fm-code">{mintInfo?.url?.replace('https://', '').slice(0, 28)}...</code>
                                </div>
                                <div>
                                    <strong>Pubkey:</strong><br />
                                    <code className="fm-code">{mintInfo?.pubkey?.slice(0, 16)}...</code>
                                </div>
                            </div>
                        </section>

                        {/* Transactions */}
                        <section className="fm-card">
                            <div className="fm-section-header">
                                <h3 className="fm-section-title">
                                    <i className="fa-solid fa-history"></i> Transaction History
                                </h3>
                                {transaction.length > 0 && (
                                    <span className="fm-tx-count">
                                        {transaction.length} {transaction.length === 1 ? 'entry' : 'entries'}
                                    </span>
                                )}
                            </div>

                            {transaction.length === 0 ? (
                                <div className="fm-empty-state">
                                    <i className="fa-solid fa-receipt"></i>
                                    <p>No transactions yet</p>
                                </div>
                            ) : (
                                <div className="fm-table-wrapper">
                                    <table className="fm-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Type</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                                <th className="text-right">Quote</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transaction.map((tx, idx) => (
                                                <tr key={idx}>
                                                    <td>{idx + 1}</td>
                                                    <td>
                                                        <span className={`fm-tx-badge fm-cashu-${tx.type}`}>
                                                            {tx.type === 'mint' ? 'Mint' : tx.type === 'melt' ? 'Melt' : tx.type}
                                                        </span>
                                                    </td>
                                                    <td className="fm-amount">{tx.amount} sats</td>
                                                    <td>
                                                        <span>
                                                            {(tx as MintHistoryEntry).state}
                                                        </span>
                                                    </td>
                                                    <td className="text-right fm-mono">
                                                        {(tx as MintHistoryEntry).quoteId.slice(0,18)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </>
    );
}