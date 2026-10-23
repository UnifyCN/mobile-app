alter table public.user_tasks
  add column if not exists dismissed_at timestamptz;

comment on column public.user_tasks.dismissed_at is
  'When set, the Sanity task is hidden from this user checklist and excluded from progress.';
