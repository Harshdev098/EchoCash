import { createContext, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../components/db';
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../redux/store";
import { setPeerid, setUserId } from "../redux/PeerSlice";

const SocketContext = createContext<{
  socket: WebSocket | null;
  setSocket: React.Dispatch<React.SetStateAction<WebSocket | null>>;
  persistentUserId: string;
}>({
  socket: null,
  setSocket: () => {},
  persistentUserId: '',
});

export const SoecketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [persistentUserId, setPersistentUserId] = useState('');
  const dispatch = useDispatch<AppDispatch>();

  const getPersistentUserId = async (): Promise<string> => {
    const db = await getDB();
    let userProfile = await db.get('userProfile', 'main');

    if (!userProfile) {
      const newUserId = uuidv4();
      userProfile = {
        id: 'main',
        persistentUserId: newUserId,
        displayName: `User_${newUserId.slice(0, 8)}`,
        createdAt: Date.now(),
      };
      await db.put('userProfile', userProfile);
    }
    setPersistentUserId(userProfile.persistentUserId);
    return userProfile.persistentUserId;
  };

  useEffect(() => {
    let socket: WebSocket | null = null;

    const socketInit = async () => {
      const userId = await getPersistentUserId();
      if (location.pathname.startsWith('/chat')) {
        socket = new WebSocket('ws://localhost:8080');
        console.log("Socket created:", socket);

        socket.onopen = () => {
          console.log('WebSocket connection opened');
        };

        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          console.log('Received message:', message);
          if (message.type === 'peers') {
            dispatch(setPeerid(message.data));
          } else if (message.type === 'peerId') {
            dispatch(setUserId(message.data));
            socket?.send(
              JSON.stringify({
                type: 'register',
                peerId: message.data,
                persistentUserId: userId,
              })
            );
          }
        };

        socket.onclose = () => {
          console.log('WebSocket connection closed');
          setSocket(null);
        };

        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        setSocket(socket);
      }
    };

    socketInit();

    // Cleanup on unmount or location change
    return () => {
      if (socket) {
        socket.close();
        console.log('WebSocket connection closed on cleanup');
      }
    };
  }, [location, dispatch]);

  return (
    <SocketContext.Provider value={{ socket, setSocket, persistentUserId }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;