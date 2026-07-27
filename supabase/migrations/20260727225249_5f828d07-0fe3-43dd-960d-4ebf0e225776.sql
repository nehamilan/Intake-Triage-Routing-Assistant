ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'research';

CREATE INDEX IF NOT EXISTS requests_vertical_idx ON public.requests (vertical);