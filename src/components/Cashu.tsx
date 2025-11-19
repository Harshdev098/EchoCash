import { useState } from "react";
import { Link } from "react-router";
import AddFund from "./AddFund";
import Transfer from "./Transfer";
import { useCashuWallet } from "../context/cashu";
import { doneProgress, startProgress } from "../utils/Progress";

export default function Cashu() {
    const [mintURL, setMintURL] = useState<string | null>(null);
    const [openJoinFedForm, setOpenJoinFedForm] = useState<boolean>(false);
    const [openFundForm, setOpenFundForm] = useState<boolean>(false)
    const [transferForm, setTransferForm] = useState<boolean>(false)
    const { CocoManager,isCashuWalletInitialized,setisCashuWalletInitialized } = useCashuWallet()

    const TrustMint=async()=>{
        try{
            startProgress()
            if(!mintURL) throw new Error("should enter the mint url")
            console.log("calling trust mint")
            const mintInfo= await CocoManager?.mint.addMint(mintURL)
            console.log("mint info is ",mintInfo)
            localStorage.setItem('trustedMint',mintInfo?.mint.mintUrl ?? '')
            setisCashuWalletInitialized(true)
        }catch(err){
            console.log("an error occured ",err)
        }finally{
            setOpenJoinFedForm(false)
            doneProgress()
        }
    }


    return (
        <>
            {openJoinFedForm && (
                <>
                    <div className="fm-overlay" onClick={() => setOpenJoinFedForm(false)} />

                    <div className="fm-modal">
                        <h3 className="fm-modal-title">Add a Mint</h3>

                        <input
                            type="text"
                            className="fm-input"
                            placeholder="Enter mint url..."
                            value={mintURL || ""}
                            onChange={(e) => setMintURL(e.target.value)}
                        />

                        <button className="fm-primary-btn" onClick={()=>TrustMint()}>
                            Add Mint
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
                {!isCashuWalletInitialized ? (
                    <>
                        <section className="fm-card fm-center">
                            <p className="fm-subtext">
                                Activate your wallet by adding a mint &nbsp;
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
                            <h2 className="fm-balance">0 sat</h2>
                            <div className="fm-btns">
                                <button className="fm-secondary-btn" onClick={() => setOpenFundForm(true)}><i className="fa-solid fa-arrow-down-long"></i> Add Funds</button>
                                <button className="fm-secondary-btn" onClick={() => setTransferForm(true)}><i className="fa-solid fa-location-arrow"></i> Transt to Peers</button>
                            </div>
                        </section>

                        {/* <section className="fm-card fm-center">
                            <h4 className="fm-balance">Joined Federation</h4>
                            <p>Federation name: {federationConfig?.meta.federation_name}</p>
                            <p>Federation ID: {federationId}</p>
                            <p>Number of guardians: { } </p>
                        </section> */}

                        <section className="fm-card">
                            <h4 className="fm-section-title">Your Transactions</h4>

                            <ul className="fm-tx-list">
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                                <li>sdfsdklfsdlkfsd</li>
                            </ul>
                        </section>
                    </>
                )}

            </div>
        </>
    );
}
