import { setFedBalance } from '../../redux/Balance';
import type { AppDispatch } from '../../redux/store';
import { Wallet } from '@fedimint/core-web';

export const subscribeBalance = async (wallet: Wallet, dispatch: AppDispatch) => {
    const unsubscribeBalance = wallet.balance.subscribeBalance((mSats) => {
        dispatch(setFedBalance(mSats/1000));
        setTimeout(() => {
            unsubscribeBalance?.();
        }, 15000);
    });
};