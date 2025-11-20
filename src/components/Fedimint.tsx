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

                        <div className="fm-divider" />

                        <h4 className="fm-random-title">Suggested Federations</h4>

                        <ul className="fm-fed-list">
                            <li className="fm-fed-item">🌿 MintHub Test Federation</li>
                            <li className="fm-fed-item">🍃 GreenLeaf Community Mint</li>
                            <li className="fm-fed-item">🌱 Fedi village (Open)</li>
                        </ul>
                    </div>
                </>
            )}

            {openFundForm ? <AddFund setOpenFundForm={setOpenFundForm} /> : null}
            {transferForm ? <Transfer setTransferForm={setTransferForm} /> : null}

            <div className="fm-container">
                {!isFedWalletInitialized ? (
                    <>
                        <section className="fm-card fm-center">
                            <p className="fm-subtext">
                                Activate your wallet by joining a federation &nbsp;
                                <Link to={'/chat/settings#faq'} className="fm-link">Learn more</Link>.
                            </p>

                            <button className="fm-primary-btn" onClick={() => setOpenJoinFedForm(true)}>
                                <i className="fa-solid fa-plus"></i> Activate Wallet
                            </button>
                        </section>
                    </>
                ) : (
                    <>
                        <section className="fm-card fm-center">
                            <h2 className="fm-balance">{FedBalance+cashuBalance} SAT</h2>
                            <div className="fm-btns">
                                <button className="fm-secondary-btn" onClick={() => setOpenFundForm(true)}><i className="fa-solid fa-arrow-down-long"></i> Add Funds</button>
                                <button className="fm-secondary-btn" onClick={() => setTransferForm(true)}><i className="fa-solid fa-location-arrow"></i> Transt to Peers</button>
                            </div>
                        </section>

                        <section className="fm-card fm-center">
                            <h4 className="fm-balance">Joined Federation</h4>
                            <p>Federation name: {federationConfig?.meta.federation_name}</p>
                            <p>Federation ID: {federationId}</p>
                            <p>Number of guardians: {Object.keys(federationConfig?.api_endpoints ?? {}).length} </p>
                        </section>

                        <section className="fm-card">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Sno</th>
                                        <th>Operation ID</th>
                                        <th>Type</th>
                                        <th>Amount</th>
                                        <th>Invoice</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transaction.map((tx, idx) => (
                                        <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            <td>{tx.operationId.slice(0,18)}...</td>
                                            <td>{tx.type}</td>
                                            <td>{tx.amountMsats} sats</td>
                                            <td>{tx.invoice?.slice(0,18).concat("...") ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>

                        <section>
                            <h3>Your wallet details</h3>
                            <p>Creation time: {walletCreationTime}</p>
                            <p>seed phrases: {seedPhrase}</p>
                        </section>
                    </>
                )}

            </div>
        </>
    );
}
