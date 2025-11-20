import { useState } from "react";
import { useFedimintWallet } from "../context/fedimint";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../redux/store";
import { useCashuWallet } from "../context/cashu";
import { doneProgress, startProgress } from "../utils/Progress";
import { CreateInvoice, subscribeLnReceive } from "../services/fedimint/LightningService";

interface AddFundProps {
    setOpenFundForm: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function AddFund({ setOpenFundForm }: AddFundProps) {
    const dispatch=useDispatch<AppDispatch>()
    const [ecashNotes, setEcashNotes] = useState<string | null>(null);
    const [invoice, setInvoice] = useState<string | null>(null);
    const [fundMode, setFundMode] = useState<boolean>(true); // true -> ecash, false -> ln
    const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
    const [description, setDescription] = useState<string>("This is an invoice");
    const { Fedimintwallet } = useFedimintWallet();
    const { CocoManager } = useCashuWallet()
    const { activeTab } = useSelector((state: RootState) => state.ActiveWalletTab)

    const DepositFunds = async () => {
        try {
            startProgress()
            if (!Fedimintwallet) throw new Error("Wallet not initialized");
            if (fundMode) { // ecash
                if (!ecashNotes) throw new Error("Please enter ecash notes");

                if (!activeTab) { // fedimint
                    const result = await Fedimintwallet?.mint.redeemEcash(ecashNotes);
                    console.log("Fedimint ecash redeem result", result);
                } else { // cashu
                    const result = await CocoManager?.wallet.receive(ecashNotes);
                    console.log("Cashu ecash receive result", result);
                }
            } else { // ln
                if (!invoiceAmount || !description)
                    throw new Error("Amount and description required");

                if (!activeTab) { // for fedimint
                    console.log("the amount and description is ", invoiceAmount * 1000, description)
                    const result = await CreateInvoice(Fedimintwallet, invoiceAmount * 1000, description, 5 * 60 * 60);
                    console.log("Fedimint invoice result", result);
                    setInvoice(result?.invoice ?? null);
                    const unsubscribe = subscribeLnReceive(Fedimintwallet, result.operationId, dispatch);
                    setTimeout(
                        () => {
                            console.log("subscription closed")
                            unsubscribe?.();
                        },
                        60 * 1000
                    );
                } else { // cashu
                    const mintURL = localStorage.getItem("trustedMint");
                    if (!mintURL) throw new Error("No Cashu mint selected");
                    console.log("the mint URL is ",mintURL)
                    await CocoManager?.mint.addMint(mintURL,{trusted:true})
                    const quote = await CocoManager?.quotes.createMintQuote(
                        mintURL,
                        invoiceAmount
                    );

                    console.log("Cashu mint quote", quote);

                    setInvoice(quote?.request ?? '');
                    console.log("Waiting for invoice to be paid...");

                    const paid = await CocoManager?.subscription.awaitMintQuotePaid(
                        mintURL,
                        quote?.quote ?? ''
                    );

                    console.log("Quote paid:", paid);

                    // Now mint tokens (redeem)
                    const minted = await CocoManager?.quotes.redeemMintQuote(
                        mintURL,
                        quote?.quote ?? ''
                    );

                    console.log("Cashu minted tokens", minted);

                }
            }
        } catch (err) {
            console.log("An error occurred:", err);
        } finally {
            doneProgress()
        }
    };


    return (
        <>
            <div className="fund-overlay" onClick={() => setOpenFundForm(false)} />

            <div className="fund-modal">
                <div className="fund-mode-switch">
                    <button
                        className={fundMode ? "fund-switch-btn active" : "fund-switch-btn"}
                        onClick={() => setFundMode(true)}
                    >
                        Ecash
                    </button>

                    <button
                        className={!fundMode ? "fund-switch-btn active" : "fund-switch-btn"}
                        onClick={() => setFundMode(false)}
                    >
                        Lightning
                    </button>
                </div>

                <h3 className="fund-modal-title">Deposit your Funds</h3>

                {/* ========== ECASH MODE ========== */}
                {fundMode && (
                    <>
                        <input
                            type="text"
                            className="fund-input"
                            placeholder="Paste ecash notes..."
                            value={ecashNotes || ""}
                            onChange={(e) => setEcashNotes(e.target.value)}
                        />

                        <button className="fund-primary-btn" onClick={DepositFunds}>
                            Redeem Ecash
                        </button>
                    </>
                )}

                {/* ========== LIGHTNING MODE ========== */}
                {!fundMode && (
                    <>
                        <input
                            type="number"
                            className="fund-input"
                            placeholder="Amount (sats)"
                            value={invoiceAmount}
                            onChange={(e) => setInvoiceAmount(Number(e.target.value))}
                        />

                        <input
                            type="text"
                            className="fund-input"
                            placeholder="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />

                        <button className="fund-primary-btn" onClick={DepositFunds}>
                            Generate Invoice
                        </button>

                        {invoice && (
                            <div className="fund-invoice-box">
                                <p className="fund-invoice-label">Generated Invoice:</p>
                                <code className="fund-invoice-text">{invoice}</code>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
