-- This file runs automatically when the Postgres container starts for the first time.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE canvas_members (
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (canvas_id, user_id)
);

CREATE TABLE shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('rect', 'ellipse', 'line', 'text')),
  props JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX shapes_canvas_id ON shapes(canvas_id);
CREATE INDEX canvas_members_user_id ON canvas_members(user_id);
