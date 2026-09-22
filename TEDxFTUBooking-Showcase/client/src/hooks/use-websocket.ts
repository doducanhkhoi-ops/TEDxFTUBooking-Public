import { useEffect, useRef, useState } from 'react';

type WebSocketMessage = {
  type: 'EVENT_UPDATED' | 'SEAT_BOOKED' | 'SEAT_CANCELLED' | 'SEAT_UPDATED' | 'SEATS_RESET';
  [key: string]: any;
};

type UseWebSocketOptions = {
  onConnect?: () => void;
  onDisconnect?: () => void;
};

const MIN_DELAY = 3000;
const MAX_DELAY = 30000;

export function useWebSocket(
  onMessage: (message: WebSocketMessage) => void,
  options?: UseWebSocketOptions
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectDelayRef = useRef(MIN_DELAY);
  const onConnectRef = useRef(options?.onConnect);
  const onDisconnectRef = useRef(options?.onDisconnect);
  const onMessageRef = useRef(onMessage);

  useEffect(() => { onConnectRef.current = options?.onConnect; }, [options?.onConnect]);
  useEffect(() => { onDisconnectRef.current = options?.onDisconnect; }, [options?.onDisconnect]);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = () => {
    // Don't open a new socket if one is already open or connecting
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        reconnectDelayRef.current = MIN_DELAY; // reset backoff on success
        setIsConnected(true);
        onConnectRef.current?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessageRef.current(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        onDisconnectRef.current?.();

        // Exponential backoff: 3s → 6s → 12s → 24s → 30s (max)
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, MAX_DELAY);

        reconnectTimeoutRef.current = setTimeout(() => {
          // Skip reconnect if the tab is hidden — will reconnect on visibility
          if (!document.hidden) connect();
        }, delay);
      };

      wsRef.current.onerror = () => {
        // onclose fires after onerror; let the backoff logic there handle it
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  useEffect(() => {
    connect();

    // Reconnect immediately when the tab becomes visible again
    const handleVisibility = () => {
      if (!document.hidden) {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          reconnectDelayRef.current = MIN_DELAY; // reset backoff for manual reconnect
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { isConnected };
}
