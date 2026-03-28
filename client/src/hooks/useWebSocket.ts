import { useCallback, useEffect, useRef } from "react";
import type { CanvasAction } from "../store/canvasReducer";
import type { ClientMessage, ServerMessage } from "../types";

interface UseWebSocketOptions {
  canvasId: string;
  token: string;
  dispatch: React.Dispatch<CanvasAction>;
  onOpen?: () => void;
}

export function useWebSocket({ canvasId, token, dispatch, onOpen }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/${canvasId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      onOpen?.();
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "canvas_init":
          dispatch({ type: "INIT", shapes: msg.shapes, users: msg.users });
          break;
        case "shape_created":
          dispatch({ type: "SHAPE_CREATED", shape: msg.shape });
          break;
        case "shape_updated":
          dispatch({ type: "SHAPE_UPDATED", shape_id: msg.shape_id, props: msg.props, version: msg.version });
          break;
        case "shape_deleted":
          dispatch({ type: "SHAPE_DELETED", shape_id: msg.shape_id });
          break;
        case "cursor_moved":
          dispatch({ type: "CURSOR_MOVED", user_id: msg.user_id, x: msg.x, y: msg.y });
          break;
        case "user_joined":
          dispatch({ type: "USER_JOINED", user: msg.user });
          break;
        case "user_left":
          dispatch({ type: "USER_LEFT", user_id: msg.user_id });
          break;
        case "error":
          if (msg.code === "version_conflict" && msg.shape_id && msg.current_props !== undefined && msg.current_version !== undefined) {
            // Server rejected our update — apply the server's current state
            dispatch({
              type: "SHAPE_UPDATED",
              shape_id: msg.shape_id,
              props: msg.current_props,
              version: msg.current_version,
            });
          }
          break;
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(() => connect(), 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [canvasId, token, dispatch, onOpen]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
