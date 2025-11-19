import { generateMnemonic, getMnemonic, getWalletInfo, joinFederation } from "@fedimint/core-web";
import { useEffect, useState } from "react";
import { useFedimintWallet } from "../context/fedimint";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import AddFund from "./AddFund";
import Transfer from "./Transfer";
import { doneProgress, startProgress } from "../utils/Progress";

export default function Fedimint() {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [openJoinFedForm, setOpenJoinFedForm] = useState<boolean>(false);
    const [openFundForm, setOpenFundForm] = useState<boolean>(false)
    const [transferForm, setTransferForm] = useState<boolean>(false)
    const { federationConfig, federationId } = useSelector((state: RootState) => state.FederationSlice)
    const { setisFedWalletInitialized, setFedimintWalletStatus, isFedWalletInitialized } = useFedimintWallet();
    const [seedPhrase, setSeedPhrase] = useState<string[] | null>(null)
    const [walletCreationTime, setWalletCreationTime] = useState<number | undefined>(0)
    const {balance}=useSelector((state:RootState)=>state.BalanceSlice)
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
            }finally{
                setOpenJoinFedForm(false)
                doneProgress()
            }
        }
    };

    useEffect(() => {
        const initDetails = async () => {
            if (Fedimintwallet) {
                setWalletCreationTime(getWalletInfo(Fedimintwallet?.id)?.createdAt)
                const seeds = await getMnemonic()
                setSeedPhrase(seeds)
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
                {/* Activate Wallet */}
                {!isFedWalletInitialized ? (
                    <>
                        <section className="fm-card fm-center">
                            <p className="fm-subtext">
                                Activate your wallet by joining a federation &nbsp;
                                <Link to={'/chat/settings#faq'} className="fm-link">Learn more</Link>.
                            </p>

                            <button className="fm-primary-btn" onClick={() => setOpenJoinFedForm(true)}>
                                ➕ Activate Wallet
                            </button>
                        </section>
                    </>
                ) : (
                    <>
                        <section className="fm-card fm-center">
                            <h2 className="fm-balance">{balance} SAT</h2>
                            <div className="fm-btns">
                                <button className="fm-secondary-btn" onClick={() => setOpenFundForm(true)}><i className="fa-solid fa-arrow-down-long"></i> Add Funds</button>
                                <button className="fm-secondary-btn" onClick={() => setTransferForm(true)}><i className="fa-solid fa-location-arrow"></i> Transt to Peers</button>
                            </div>
                        </section>

                        <section className="fm-card fm-center">
                            <h4 className="fm-balance">Joined Federation</h4>
                            <p>Federation name: {federationConfig?.meta.federation_name}</p>
                            <p>Federation ID: {federationId}</p>
                            <p>Number of guardians: { } </p>
                        </section>

                        <section className="fm-card">
                            <h4 className="fm-section-title">Your Transactions</h4>

                            <ul className="fm-tx-list">
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                            </ul>
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
