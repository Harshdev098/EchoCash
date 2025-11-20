import { createContext, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../redux/store";
import { CreateSocket, getPersistentUserId } from "../services/Socket";

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


  useEffect(() => {
    let socket: WebSocket | null = null;

    const socketInit = async () => {
      const userId = await getPersistentUserId();
      setPersistentUserId(userId)
      if (location.pathname.startsWith('/chat')) {
        socket=CreateSocket(socket,userId,dispatch,setSocket)
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