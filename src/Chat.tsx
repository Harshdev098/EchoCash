import { Routes, Route } from "react-router"
import Main from "./pages/Main"
import PrivateChat from "./components/PrivateChat"
import Chatting from "./components/Chatting"
import PeerList from "./components/PeerList"
import Wallet from "./pages/Wallet"

export default function Chat() {
    return (
        <>
            <Routes>
                <Route element={<Main />}>
                    <Route index element={<PeerList />} />
                    <Route path="/wallet" element={<Wallet />} />
                    <Route path="/p/:chatId/*" element={<PrivateChat />} />
                    <Route path="/c/:cID/*" element={<Chatting />} />
                </Route>
            </Routes>
        </>
    )
}
