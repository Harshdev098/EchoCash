# EchoCash

EchoCash is a decentralized, peer-to-peer communication and payment platform built using WebRTC and WebSockets. It enables people to connect, communicate, and transfer value (sats via Fedimint/Cashu) without relying on centralized servers. Whether you're in a disaster zone, a rural village, a school campus, or just looking to meet nearby people, EchoCash makes spontaneous, offline networking and payments possible.

🚀 Key Features:

- 📶 Decentralized Communication – Direct peer-to-peer messaging over WebRTC with end-to-end encryption
- 💰 Ecash Payments – Send and receive Bitcoin (sats) via Fedimint and Cashu protocols
- 🔐 Private & Secure – AES-GCM encryption for all messages with no central server storing data
- 🆔 Persistent Identity – Strong persistent user IDs that remain consistent across sessions
- 💬 Message History – All chats stored locally in IndexedDB for privacy
- 📝 Offline Messaging – Send messages that auto-deliver when peers reconnect
- 🎨 Custom Names – Assign memorable nicknames to peers instead of UUIDs
- 🔄 Auto-Reconnect – Automatic peer reconnection when connections drop
- 🌐 Local Network Discovery – Find and connect to peers on the same signaling server

🚀 Future Deliverables:

- Community chat rooms with multiple participants
- Connection status dashboard with metrics
- Bluetooth mesh topology for true offline communication
- File and document transfer capabilities
- Progressive Web App (PWA) support

## 🏃‍♀️‍➡️ Running the Application:

- Install the packages `npm install` under the project root folder
- Change the directory `cd node`
- Run `nodemon server.js`
- Open a new terminal within same project root folder
- Run `npm run dev`
- Preview the application at `http://localhost:5173/chat/`
