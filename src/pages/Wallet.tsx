import "../style/Wallet.css";
import Cashu from "../components/Cashu";
import Fedimint from "../components/Fedimint";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../redux/store";
import { setActiveWalletTab } from "../redux/WalletTab";

export default function Wallet() {
  const dispatch=useDispatch<AppDispatch>()
  const {activeTab}=useSelector((state:RootState)=>state.ActiveWalletTab)

  return (
    <>
      <main className="main-wallet-section">
        <header className="wallet-header">
          <button className={activeTab ? "cashuBtn" : ""} onClick={()=>dispatch(setActiveWalletTab(true))}>Cashu</button>
          <button className={activeTab ? "" : "FedimintBtn"} onClick={()=>dispatch(setActiveWalletTab(false))}>Fedimint</button>
        </header>
        {activeTab ? <Cashu /> : <Fedimint />}
      </main>
    </>
  );
}
