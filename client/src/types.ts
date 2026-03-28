export type ShapeType = "rect" | "ellipse" | "line" | "text";
export type Tool = "select" | "rect" | "ellipse" | "line" | "text";

export interface RectProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
}

export interface EllipseProps {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  fill: string;
  stroke: string;
}

export interface LineProps {
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface TextProps {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
}

export type ShapeProps = RectProps | EllipseProps | LineProps | TextProps;

export interface Shape {
  id: string;
  type: ShapeType;
  props: ShapeProps;
  version: number;
  created_by: string | null;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  color?: string;
}

export interface Canvas {
  id: string;
  name: string;
  owner_id: string | null;
  owner_username?: string;
  created_at: string;
  updated_at: string;
  members?: User[];
}

// WebSocket message types (server → client)
export type ServerMessage =
  | { type: "canvas_init"; shapes: Shape[]; users: User[] }
  | { type: "shape_created"; shape: Shape }
  | { type: "shape_updated"; shape_id: string; props: ShapeProps; version: number }
  | { type: "shape_deleted"; shape_id: string }
  | { type: "cursor_moved"; user_id: string; x: number; y: number }
  | { type: "user_joined"; user: User }
  | { type: "user_left"; user_id: string }
  | { type: "error"; code: string; shape_id?: string; current_props?: ShapeProps; current_version?: number };

// WebSocket message types (client → server)
export type ClientMessage =
  | { type: "shape_create"; shape: { id: string; type: ShapeType; props: ShapeProps } }
  | { type: "shape_update"; shape_id: string; props: ShapeProps; base_version: number }
  | { type: "shape_delete"; shape_id: string }
  | { type: "cursor_move"; x: number; y: number };

export interface RemoteCursor {
  x: number;
  y: number;
  username: string;
  color: string;
}
