
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_text text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_category text NOT NULL,
  ai_priority text NOT NULL,
  ai_route text NOT NULL,
  ai_confidence numeric NOT NULL,
  ai_reason text NOT NULL,
  ai_parse_failed boolean NOT NULL DEFAULT false,
  final_category text NOT NULL,
  final_priority text NOT NULL,
  final_route text NOT NULL,
  status text NOT NULL,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  was_overridden boolean NOT NULL DEFAULT false,
  reviewer_note text,
  current_revision int NOT NULL DEFAULT 1
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO anon, authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- Demo app has no auth; the queue is fully open. Tighten if auth is added.
CREATE POLICY "Anyone can read requests"   ON public.requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert requests" ON public.requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update requests" ON public.requests FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX requests_created_at_idx ON public.requests (created_at DESC);
CREATE INDEX requests_status_idx     ON public.requests (status);
CREATE INDEX requests_final_route_idx ON public.requests (final_route);
CREATE INDEX requests_final_priority_idx ON public.requests (final_priority);


CREATE TABLE public.request_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  revision int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewer text NOT NULL,
  category text NOT NULL,
  priority text NOT NULL,
  route text NOT NULL,
  status text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  guardrail_acknowledged boolean NOT NULL DEFAULT false,
  UNIQUE (request_id, revision)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_revisions TO anon, authenticated;
GRANT ALL ON public.request_revisions TO service_role;
ALTER TABLE public.request_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read revisions"   ON public.request_revisions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert revisions" ON public.request_revisions FOR INSERT WITH CHECK (true);

CREATE INDEX request_revisions_request_id_idx ON public.request_revisions (request_id, revision);
