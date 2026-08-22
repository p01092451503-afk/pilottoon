ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS group_name text;

ALTER TABLE public.character_images
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reference';

CREATE INDEX IF NOT EXISTS characters_tags_idx ON public.characters USING gin (tags);