import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { useFedimintWallet } from '../context/fedimint';
import { setBalance } from '../redux/Balance';
import { useEffect } from 'react';

export default function Header() {
  const {Fedimintwallet}=useFedimintWallet()
  const dispatch=useDispatch<AppDispatch>()
  const {balance}=useSelector((state:RootState)=>state.BalanceSlice)

  const WalletBalance=async()=>{
      try{
          const msat=await Fedimintwallet?.balance.getBalance()
          msat && dispatch(setBalance(msat/1000))
      }catch(err){
          console.log("an error occured")
      }
  }

  useEffect(()=>{
    WalletBalance()
  },[Fedimintwallet])

  return (
    <header style={{padding:'8px',textAlign:'center',fontSize:'18px'}}>
        Balance: {balance} SAT
    </header>
  )
}
