import type { CreateInvoiceResponse, InvoicePaymentResponse } from '../../hooks/wallet.type.ts';
import { Wallet } from '@fedimint/core-web';
import type { AppDispatch } from '../../redux/store';
import { setPayStatus } from '../../redux/Lightning.tsx';
import { subscribeBalance } from './BalanceService.ts';
import type { LnInternalPayState, LnPayState, LnReceiveState } from '@fedimint/core-web';

export const CreateInvoice = async (
    wallet: Wallet,
    amount: number,
    description: string,
    expiryTime: number
): Promise<CreateInvoiceResponse> => {
    try {
        console.log('expiry time is ', expiryTime * 60);
        const result = await wallet?.lightning.createInvoice(amount, description, expiryTime * 60);
        console.log('result', result);
        if (result) {
            return {
                operationId: result.operation_id,
                invoice: result.invoice,
            };
        } else {
            throw new Error('Response not recieved');
        }
    } catch (err) {
        console.log(`an error occured ${err}`);
        throw new Error(`${err}`);
    }
};

export const PayInvoice = async (
    wallet: Wallet,
    invoice: string
): Promise<InvoicePaymentResponse> => {
    try {
        const { fee, payment_type } = await wallet.lightning.payInvoice(invoice);
        console.log('Invoice pay response:', fee, payment_type);
        let payType,
            id = '';
        if ('lightning' in payment_type) {
            id = payment_type.lightning;
            payType = 'lightning';
        } else {
            id = payment_type.internal;
            payType = 'internal';
            console.log('internal payment ', payment_type.internal);
        }
        return { id, fee, payType };
    } catch (err) {
        console.error('PayInvoice error:', err);
        throw new Error(`Payment failed ${err}`);
    }
};

export const subscribeLnPay = (
    wallet: Wallet,
    paymentId: string,
    dispatch: AppDispatch
): (() => void) => {
    const unsubscribe = wallet.lightning.subscribeLnPay(
        paymentId,
        (state: LnPayState) => {
            if (state === 'created') {
                dispatch(setPayStatus(state));
            } else if (state === 'canceled') {
                dispatch(setPayStatus(state));
            } else if (typeof state === 'object') {
                if ('success' in state) {
                    subscribeBalance(wallet, dispatch);
                    dispatch(setPayStatus('success'));
                } else if ('funded' in state) {
                    dispatch(setPayStatus('funded'));
                } else if ('waiting_for_refund' in state) {
                    dispatch(setPayStatus('waiting_for_refund'));
                } else if ('refunded' in state) {
                    dispatch(setPayStatus('refunded'));
                } else if ('unexpected_error' in state) {
                    dispatch(setPayStatus('unexpected_error'));
                }
            }
        },
        (error: string) => {
            console.error('Error in Lightning subscribeLnPay:', error);
            throw new Error('An error occurred fetching state!');
        }
    );

    return unsubscribe;
};

export const subscribeInternalPay = (
    wallet: Wallet,
    operationId: string,
    dispatch: AppDispatch
) => {
    const unsubscribe = wallet.lightning.subscribeInternalPayment(
        operationId,
        (state: LnInternalPayState) => {
            if (typeof state === 'object' && 'preimage' in state) {
                dispatch(setPayStatus('funded'));
            } else if (typeof state === 'object' && 'funding_failed' in state) {
                dispatch(setPayStatus('funded'));
            } else if (typeof state === 'object' && 'refund_success' in state) {
                dispatch(setPayStatus('funded'));
            }
        },
        (error: string) => {
            throw new Error(`An error occured fetching state! ${error}`);
        }
    );
    return unsubscribe;
};

export const subscribeLnReceive = (wallet: Wallet, operationId: string, dispatch: AppDispatch) => {
    const unsubscribe = wallet.lightning.subscribeLnReceive(
        operationId,
        async (state: LnReceiveState) => {
            if (state === 'funded') {
                subscribeBalance(wallet, dispatch);
            } else if (typeof state === 'object' && 'canceled' in state) {
            }
        },
        (error: string) => {
            console.error('Error in subscription:', error);
            throw new Error('An error occured! Payment cancelled');
        }
    );
    return unsubscribe;
};
