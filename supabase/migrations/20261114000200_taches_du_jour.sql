-- Session 4 · Discord sans serveur : tâches à ne faire qu'une fois par jour (salons « produits du jour »,
-- synchronisation des rôles), réservées par une ligne unique (tâche, jour). Lisible seulement côté serveur.

create table if not exists public.daily_tasks (
  task text not null,
  day date not null,
  claimed_at timestamptz not null default now(),
  primary key (task, day)
);

alter table public.daily_tasks enable row level security;
revoke all on public.daily_tasks from anon, authenticated;
