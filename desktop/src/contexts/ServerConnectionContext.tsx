import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

interface ConnectionInfo {
  isOnline: boolean;
  serverUrl: string;
  responseTime: number | null;
  databaseOnline: boolean;
  lastChecked: Date | null;
}

interface ServerConnectionContextType {
  isOnline: boolean;
  isInitialCheck: boolean;
  connectionInfo: ConnectionInfo;
  reconnect: () => void;
}

const ServerConnectionContext = createContext<ServerConnectionContextType | null>(null);

function getApiUrl(): string {
  if (window.appConfig?.serverUrl) return window.appConfig.serverUrl;
  return import.meta.env.VITE_API_URL || "http://localhost:3001";
}

const POLL_INTERVAL = 60_000;

export function ServerConnectionProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInitialCheck, setIsInitialCheck] = useState(true);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    isOnline: true,
    serverUrl: getApiUrl(),
    responseTime: null,
    databaseOnline: false,
    lastChecked: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    const startTime = Date.now();
    const serverUrl = getApiUrl();
    try {
      const res = await fetch(`${serverUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const responseTime = Date.now() - startTime;
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json().catch(() => ({}));
      setIsOnline(true);
      setConnectionInfo({
        isOnline: true,
        serverUrl,
        responseTime,
        databaseOnline: data?.database === "connected" || data?.db === "ok" || true,
        lastChecked: new Date(),
      });
    } catch {
      setIsOnline(false);
      setConnectionInfo({
        isOnline: false,
        serverUrl,
        responseTime: null,
        databaseOnline: false,
        lastChecked: new Date(),
      });
    } finally {
      setIsInitialCheck(false);
    }
  }, []);

  const reconnect = useCallback(() => {
    check();
  }, [check]);

  useEffect(() => {
    check();
    const onFocus = () => void check();
    const onOnline = () => void check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  return (
    <ServerConnectionContext.Provider
      value={{ isOnline, isInitialCheck, connectionInfo, reconnect }}
    >
      {children}
    </ServerConnectionContext.Provider>
  );
}

export function useServerConnection() {
  const ctx = useContext(ServerConnectionContext);
  if (!ctx) throw new Error("useServerConnection must be used within ServerConnectionProvider");
  return ctx;
}
