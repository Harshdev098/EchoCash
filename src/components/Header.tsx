import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { useFedimintWallet } from '../context/fedimint';
import { setFedBalance, setCashuBalance } from '../redux/Balance';
import { useEffect } from 'react';
import { useCashuWallet } from '../context/cashu';

export default function Header() {
  const { Fedimintwallet } = useFedimintWallet()
  const dispatch = useDispatch<AppDispatch>()
  const { FedBalance, cashuBalance } = useSelector((state: RootState) => state.BalanceSlice)
  const { CocoManager } = useCashuWallet()

  const WalletBalance = async () => {
    try {
      const msat = await Fedimintwallet?.balance.getBalance()
      msat && dispatch(setFedBalance(msat / 1000))
      const cashuBalanceObj = await CocoManager?.wallet.getBalances();

      if (cashuBalanceObj) {
        const totalCashuBalance = Object.values(cashuBalanceObj).reduce(
          (sum, v) => sum + v,
          0
        );
        dispatch(setCashuBalance(totalCashuBalance));
      }

      console.log("the balance is ", FedBalance, cashuBalance)
    } catch (err) {
      console.log("an error occured")
    }
  }

  useEffect(() => {
    WalletBalance()
  }, [Fedimintwallet])

  return (
    <header style={{ padding: '8px', textAlign: 'center', fontSize: '18px' }}>
      Balance: {FedBalance + cashuBalance} SAT
    </header>
  )
}
