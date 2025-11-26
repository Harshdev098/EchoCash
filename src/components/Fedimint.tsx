import { generateMnemonic, getMnemonic, getWalletInfo, joinFederation, parseBolt11Invoice, type EcashTransaction, type LightningTransaction, type Transactions, type WalletTransaction } from "@fedimint/core-web";
import { useEffect, useState } from "react";
import { useFedimintWallet } from "../context/fedimint";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import AddFund from "./AddFund";
import Transfer from "./Transfer";
import { doneProgress, startProgress } from "../utils/Progress";
import type { Transaction } from "../hooks/wallet.type";

export default function Fedimint() {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [openJoinFedForm, setOpenJoinFedForm] = useState<boolean>(false);
    const [openFundForm, setOpenFundForm] = useState<boolean>(false)
    const [transferForm, setTransferForm] = useState<boolean>(false)
    const { federationConfig, federationId } = useSelector((state: RootState) => state.FederationSlice)
    const { setisFedWalletInitialized, setFedimintWalletStatus, isFedWalletInitialized } = useFedimintWallet();
    const [seedPhrase, setSeedPhrase] = useState<string[] | null>(null)
    const [walletCreationTime, setWalletCreationTime] = useState<number | undefined>(0)
    const [transaction, setTransaction] = useState<Transaction[]>([])
    const { FedBalance,cashuBalance } = useSelector((state: RootState) => state.BalanceSlice)
    const { Fedimintwallet } = useFedimintWallet();

    const JoinFederation = async () => {
        if (inviteCode) {
            try {
                startProgress()
                let mnemonics = await getMnemonic();
                console.log('mnemonic is ', mnemonics);

                if (!mnemonics?.length) {
                    mnemonics = (await generateMnemonic()) as unknown as string[];
                }

                console.log('mnemonic is ', mnemonics);
                const wallet = await joinFederation(inviteCode, false);
                setFedimintWalletStatus("open");
                setisFedWalletInitialized(true);
                localStorage.setItem("FedimintWalletId", wallet.id);
            } catch (err) {
                console.log("An error occured");
            } finally {
                setOpenJoinFedForm(false)
                doneProgress()
            }
        }
    };

    const fetchTXs = async () => {
        const txList: Transactions[] | undefined = await Fedimintwallet?.federation.listTransactions();
        if (!txList) {
            setTransaction([]);
            return;
        }

        const formattedTx = await Promise.all(
            txList.map(async (tx) => {
                let amountMsats, outcome, fee, invoice;
                const timestamp = new Date(tx.timestamp).toLocaleString();
                if (tx.kind === 'ln') {
                    invoice = (tx as LightningTransaction).invoice;
                    outcome = (tx as LightningTransaction).outcome?.toLowerCase() ?? null;
                    amountMsats = (await parseBolt11Invoice(invoice)).amount;
                    fee = (tx as LightningTransaction).fee ?? 0;
                } else if (tx.kind === 'mint') {
                    amountMsats = (tx as EcashTransaction).amountMsats / 1000;
                    outcome = (tx as EcashTransaction).outcome?.toLowerCase() ?? null;
                } else if (tx.kind === 'wallet') {
                    amountMsats = (tx as WalletTransaction).amountSats;
                    outcome = (tx as WalletTransaction).outcome?.toLowerCase() ?? null;
                    fee = (tx as WalletTransaction).fee;
                }
                return {
                    invoice,
                    operationId: tx.operationId,
                    type: tx.type,
                    amountMsats,
                    outcome,
                    timestamp,
                    fee: fee ?? null,
                    kind: tx.kind,
                } as Transaction;
            })
        );

        setTransaction(formattedTx);
    }

    useEffect(() => {
        const initDetails = async () => {
            if (Fedimintwallet) {
                try {
                    startProgress()
                    setWalletCreationTime(getWalletInfo(Fedimintwallet?.id)?.createdAt)
                    const seeds = await getMnemonic()
                    await fetchTXs()
                    setSeedPhrase(seeds)
                }catch(err){
                    console.log("An error occured")
                }finally{
                    doneProgress()
                }
            }
        }
        initDetails();
    }, [Fedimintwallet])

    return (
        <>
            {/* Join Federation Modal – unchanged */}
            {openJoinFedForm && (
                <>
                    <div className="fm-overlay" onClick={() => setOpenJoinFedForm(false)} />
                    <div className="fm-modal">
                        <h3 className="fm-modal-title">Join a Federation</h3>
                        <input
                            type="text"
                            className="fm-input"
                            placeholder="Enter invite code..."
                            value={inviteCode || ""}
                            onChange={(e) => setInviteCode(e.target.value)}
                        />
                        <button className="fm-primary-btn" onClick={JoinFederation}>
                            Join Federation
                        </button>
                    </div>
                </>
            )}

            {openFundForm && <AddFund setOpenFundForm={setOpenFundForm} />}
            {transferForm && <Transfer setTransferForm={setTransferForm} />}

            <div className="fm-container">
                {!isFedWalletInitialized ? (
                    <section className="fm-card fm-welcome-card">
                        <i className="fa-solid fa-wallet fm-welcome-icon"></i>
                        <h2 className="fm-welcome-title">Welcome to Your Fedimint Wallet</h2>
                        <p className="fm-subtext">
                            Join a trusted federation to activate your private, lightning-fast wallet. &nbsp;
                            <Link to="/chat/settings#faq" className="fm-link">Learn more</Link>
                        </p>
                        <button className="fm-primary-btn fm-activate-btn" onClick={() => setOpenJoinFedForm(true)}>
                            <i className="fa-solid fa-plus"></i> Activate Wallet
                        </button>
                    </section>
                ) : (
                    <>
                        {/* Balance Card */}
                        <section className="fm-card fm-balance-card">
                            <div className="fm-balance-header">
                                <span className="fm-balance-label">Total Balance</span>
                                <h2 className="fm-balance-amount">
                                    {FedBalance + cashuBalance} <span className="fm-balance-sats">SAT</span>
                                </h2>
                            </div>
                            <div className="fm-action-buttons">
                                <button className="fm-secondary-btn" onClick={() => setOpenFundForm(true)}>
                                    <i className="fa-solid fa-arrow-down-long"></i> Receive
                                </button>
                                <button className="fm-secondary-btn" onClick={() => setTransferForm(true)}>
                                    <i className="fa-solid fa-paper-plane"></i> Send to Peer
                                </button>
                            </div>
                        </section>

                        {/* Federation Info */}
                        <section className="fm-card fm-federation-card">
                            <h3 className="fm-section-title">
                                <i className="fa-solid fa-shield-halved"></i> Joined Federation
                            </h3>
                            <div className="fm-federation-grid">
                                <div>
                                    <strong>Name:</strong><br />
                                    {federationConfig?.meta.federation_name || 'Unknown'}
                                </div>
                                <div>
                                    <strong>Federation ID:</strong><br />
                                    <code className="fm-code">{federationId?.slice(0, 16)}...</code>
                                </div>
                                <div>
                                    <strong>Guardians:</strong><br />
                                    {Object.keys(federationConfig?.api_endpoints ?? {}).length} online
                                </div>
                            </div>
                        </section>

                        {/* Transaction History */}
                        <section className="fm-card">
                            <div className="fm-section-header">
                                <h3 className="fm-section-title">
                                    <i className="fa-solid fa-history"></i> Recent Transactions
                                </h3>
                                {transaction.length > 0 && (
                                    <span className="fm-tx-count">
                                        {transaction.length} transaction{transaction.length > 1 ? 's' : ''}
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
                                                <th>Operation</th>
                                                <th>Type</th>
                                                <th>Amount</th>
                                                <th className="text-right">Invoice</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transaction.map((tx, idx) => (
                                                <tr key={idx}>
                                                    <td>{idx + 1}</td>
                                                    <td>
                                                        <code className="fm-operation-id">
                                                            {tx.operationId.slice(0, 12)}...
                                                        </code>
                                                    </td>
                                                    <td>
                                                        <span className={`fm-tx-badge fm-tx-${tx.kind}`}>
                                                            {tx.kind === 'ln' ? 'Lightning' : tx.kind === 'mint' ? 'Ecash' : 'Wallet'}
                                                        </span>
                                                    </td>
                                                    <td className="fm-amount">
                                                        {tx.amountMsats?.toLocaleString() || '—'} sats
                                                    </td>
                                                    <td className="text-right fm-mono">
                                                        {tx.invoice ? `${tx.invoice.slice(0, 14)}...` : 'N/A'}
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
