import NDK, {
    NDKEvent,
    NDKPrivateKeySigner,
} from '@nostr-dev-kit/ndk';
import { getMnemonic } from '@fedimint/core-web';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import * as bip39 from '@scure/bip39';
import * as bip32 from '@scure/bip32';


export function deriveNostrSecretKey(mnemonic: string): string {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.HDKey.fromMasterSeed(seed);
    const child = root.derive("m/44'/1237'/0'/0/0");

    if (!child.privateKey) {
        throw new Error('Failed to derive private key');
    }

    return bytesToHex(child.privateKey);
}

export const handleNWCConnection = async (ndk: NDK, relay: string | null, appName: string) => {
    if (!appName) {
        console.error('App name is required');
        return null;
    }
    const mnemonic = await getMnemonic();
    if (!mnemonic || mnemonic.length === 0) {
        throw new Error('Mnemonic is empty');
    }

    const mnemonicStr = mnemonic.join(' ');
    const walletNostrSecretKey = deriveNostrSecretKey(mnemonicStr);
    const walletNostrPubKey = getPublicKey(hexToBytes(walletNostrSecretKey));

    const clientRelayKeys: Record<string, { clientPubKey: string; relay: string | null }> = {};

    const effectiveRelay = relay || 'wss://relay.getalby.com/v1';

    console.log(`Generating new client keys for app: ${appName}`);
    const clientSecretKey = bytesToHex(generateSecretKey());
    const clientPubKey = getPublicKey(hexToBytes(clientSecretKey));

    const nwcUrl = `nostr+walletconnect://${walletNostrPubKey}?relay=${effectiveRelay}&secret=${clientSecretKey}`;
    clientRelayKeys[appName] = { clientPubKey, relay };
    localStorage.setItem('ClientRelayKeys', JSON.stringify(clientRelayKeys));

    console.log(`Generated NWC URL for ${appName}:`, nwcUrl);

    // Publish wallet service info event
    ndk.signer = new NDKPrivateKeySigner(walletNostrSecretKey);
    const infoEvent = new NDKEvent(ndk);

    infoEvent.kind = 13194;
    infoEvent.pubkey = walletNostrPubKey;
    infoEvent.created_at = Math.floor(Date.now() / 1000);
    infoEvent.content = JSON.stringify({
        methods: [
            'get_info',
            'pay_invoice',
            'make_invoice',
            'get_balance',
            'list_transactions',
            'lookup_invoice',
            'notifications',
            'payment_sent',
            'payment_received',
        ],
    });
    infoEvent.tags = [
        ['p', walletNostrPubKey],
        ['d', 'Fedimint Wallet'],
    ];

    infoEvent
        .sign()
        .then(() => {
            infoEvent
                .publish()
                .then(() => {
                    console.log(`Published wallet service info event for ${appName}`);
                })
                .catch((err:string) =>
                    console.error(`Error publishing service info event for ${appName}:`, err)
                );
        })
        .catch((err:string) => console.error(`Error signing service info event for ${appName}:`, err));

    return { nwcUrl, clientPubKey, walletNostrSecretKey, walletNostrPubKey };
};