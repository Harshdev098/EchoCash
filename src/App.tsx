// src/App.tsx
import './style/App.css';
import { BrowserRouter, Routes, Route } from 'react-router';
import { useEffect, useState, useRef } from 'react';
import { initialize, isInitialized } from '@fedimint/core-web';
import Home from './pages/Home';
import Chat from './Chat';
import { P2PProvider } from './context/P2PContext';
import { FedimintProvider } from './context/fedimint';
import { CashuProvider } from './context/cashu';
import 'nprogress/nprogress.css';

const globalAppState = {
    isInitialized: false,
    initPromise: null as Promise<void> | null,
};

function AppInitializer({ children }: { children: React.ReactNode }) {
    const [ready, setReady] = useState(globalAppState.isInitialized);
    const initRef = useRef(false);

    useEffect(() => {
        if (globalAppState.isInitialized) {
            setReady(true);
            return;
        }

        if (globalAppState.initPromise) {
            globalAppState.initPromise.then(() => setReady(true));
            return;
        }

        if (initRef.current) return;
        initRef.current = true;

        const run = async () => {
            try {
                // Initialize Fedimint SDK only once
                if (!isInitialized()) {
                    await initialize();
                }
                globalAppState.isInitialized = true;
                setReady(true);
            } catch (err) {
                console.error('Initialization failed:', err);
                globalAppState.isInitialized = true;
                setReady(true);
            } finally {
                globalAppState.initPromise = null;
            }
        };

        globalAppState.initPromise = run();
    }, []);

    // Loader
    if (!ready) {
        return (
            <div className="web-loader">
                <p>Loading</p>
            </div>
        );
    }

    return <>{children}</>;
}

function App() {
    return (
        <BrowserRouter>
            <P2PProvider>
                <FedimintProvider>
                    <CashuProvider>
                        <AppInitializer>
                            <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="/chat/*" element={<Chat />} />
                            </Routes>
                        </AppInitializer>
                    </CashuProvider>
                </FedimintProvider>
            </P2PProvider>
        </BrowserRouter>
    );
}

export default App;