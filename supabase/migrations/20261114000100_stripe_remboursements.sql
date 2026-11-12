-- Session 4 · Stripe : un remboursement annule la commission de parrainage (au prorata du montant remboursé).
-- Rejouable : « if not exists », contrainte supprimée puis recréée.

alter table public.commissions add column if not exists canceled_cents integer not null default 0;

alter table public.commissions drop constraint if exists commissions_status_check;
alter table public.commissions
  add constraint commissions_status_check check (status in ('due', 'paid', 'annulee'));

alter table public.commissions drop constraint if exists commissions_canceled_cents_check;
alter table public.commissions
  add constraint commissions_canceled_cents_check check (canceled_cents >= 0);

comment on column public.commissions.amount_cents is
  'Commission restante, en centimes (montant d''origine moins la part annulée par des remboursements).';
comment on column public.commissions.canceled_cents is
  'Part de la commission annulée par des remboursements, en centimes (cumulée).';
