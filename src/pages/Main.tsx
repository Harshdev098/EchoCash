// Updated Main.tsx with global ecash receiving
import Taskbar from '../components/Taskbar';
import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router';
import Header from '../components/Header';
import { useCashuWallet } from '../context/cashu';
import { useFedimintWallet } from '../context/fedimint';
import { ReceiveEcash } from '../services/TransferFund';

export default function Main() {
    const [postBox, setPostBox] = useState<boolean>(false);
    const [audience, setAudience] = useState<'public' | 'all' | 'specific' | null>(null);
    const [message, setMessage] = useState<string>('');
    const { CocoManager, isCashuWalletInitialized } = useCashuWallet()
    const { Fedimintwallet, isFedWalletInitialized } = useFedimintWallet()

    // Global ecash receiver - listens to ALL incoming messages
    useEffect(() => {
        const handleGlobalEcash = async (event: any) => {
            const { from, content } = event.detail;

            try {
                const data = JSON.parse(content);
                
                if (data.type === 'fedimint' || data.type === 'cashu') {
                    console.log('💰 MAIN: Received ecash from:', from);

                    // Check if wallets are initialized
                    if (data.type === 'fedimint' && !isFedWalletInitialized) {
                        console.error('Fedimint wallet not initialized');
                        alert('Cannot receive Fedimint payment - wallet not initialized');
                        return;
                    }
                    if (data.type === 'cashu' && !isCashuWalletInitialized) {
                        console.error('Cashu wallet not initialized');
                        alert('Cannot receive Cashu payment - wallet not initialized');
                        return;
                    }

                    // Automatically receive the ecash
                    const result = await ReceiveEcash(data, Fedimintwallet, CocoManager);

                    if (result.success) {
                        // Show notification
                        alert(`✅ Received ${result.amount} sats via ${result.type} from ${from.slice(0, 12)}...`);
                        
                        // Optional: Play notification sound or show toast
                        console.log(`💰 Successfully received ${result.amount} sats`);
                    }
                }
            } catch (error) {
                // Not an ecash message, ignore
            }
        };

        window.addEventListener('p2p-message', handleGlobalEcash);

        return () => {
            window.removeEventListener('p2p-message', handleGlobalEcash);
        };
    }, [Fedimintwallet, CocoManager, isFedWalletInitialized, isCashuWalletInitialized]);

    return (
        <main className='mainchatContent'>
            {postBox && (
                <div className='postbox'>
                    <div>
                        <h3>Write a Post</h3>
                        <p>Choose where to post your message.</p>
                        <form>
                            <label>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="public"
                                    checked={audience === 'public'}
                                    onChange={() => setAudience('public')}
                                />
                                <span>Public</span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="all"
                                    checked={audience === 'all'}
                                    onChange={() => setAudience('all')}
                                />
                                <span>All Communities</span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="audience"
                                    value="specific"
                                    checked={audience === 'specific'}
                                    onChange={() => setAudience('specific')}
                                />
                                <span>Specific Community</span>
                            </label>
                            <input
                                type="text"
                                placeholder="Enter the message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                required
                            />
                            <div className="postbox-buttons">
                                <button type="submit">Send</button>
                                <button type="button" onClick={() => setPostBox(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <section className='leftsidebars'>
                <Taskbar />
                <Sidebar />
            </section>
            <section className='main-rightsideContent'>
                <Header />
                <Outlet />
                <button className="leaf-button" onClick={() => setPostBox(true)}>
                    <i className="fa-solid fa-leaf"></i>
                </button>
            </section>
        </main>
    );
}