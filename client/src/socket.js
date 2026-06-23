import { io } from "socket.io-client";

const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_PUBLIC_SITE_URL || "";
const SOCKET_URL = explicitSocketUrl || (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);

export const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"]
});
