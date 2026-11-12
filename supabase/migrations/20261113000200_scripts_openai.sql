-- =====================================================================
-- Tracktout — le générateur de scripts peut aussi utiliser OpenAI.
-- Rejouable : la contrainte est remplacée à chaque passage.
-- =====================================================================
alter table public.scripts drop constraint if exists scripts_source_check;
alter table public.scripts
  add constraint scripts_source_check check (source in ('claude', 'openai', 'simulation'));
