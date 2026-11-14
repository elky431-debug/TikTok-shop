import type { Metadata } from 'next';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { PushToggle } from '@/components/pwa/push-toggle';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { groupNotifications, NOTIFICATION_LABELS } from '@/lib/notification-center';
import { listNotifications } from '@/lib/notify';
import { cn, formatRelative, plural } from '@/lib/utils';
import { vapidPublicKey } from '@/lib/webpush/config';
import { listPushSubscriptions } from '@/lib/webpush/subscriptions';
import { markAllReadAction, openNotificationAction, sendTestPushAction } from './actions';

export const metadata: Metadata = { title: 'Notifications' };

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=lues': { tone: 'gain', text: 'Tout est marqué comme lu.' },
  'ok=test': { tone: 'gain', text: 'Notification de test envoyée : elle arrive sur tes appareils dans quelques secondes.' },
  'erreur=push-inactif': { tone: 'rose', text: 'Les notifications push ne sont pas encore activées sur ce site.' },
  'erreur=aucun-appareil': { tone: 'rose', text: 'Active d’abord les notifications sur cet appareil.' },
  'erreur=test': { tone: 'rose', text: 'Aucun appareil n’a accepté la notification. Désactive puis réactive les notifications, et réessaie.' },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/notifications');
  const [records, devices] = await Promise.all([listNotifications(profile.id), listPushSubscriptions(profile.id)]);
  const unread = records.filter((r) => !r.data.read).length;
  const onlyUnread = searchParams.filtre === 'non-lues';
  const shown = onlyUnread ? records.filter((r) => !r.data.read) : records;
  const groups = groupNotifications(shown);
  const publicKey = vapidPublicKey();
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);

  return (
    <div>
      <PageHeader eyebrow="Compte"
        title="Notifications"
        description={unread ? `${plural(unread, 'notification non lue', 'notifications non lues')}.` : 'Tu es à jour.'}
        actions={
          unread ? (
            <form action={markAllReadAction}>
              <SubmitButton variant="outline" size="sm" pendingLabel="Enregistrement…">
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                Tout marquer comme lu
              </SubmitButton>
            </form>
          ) : null
        }
      />
      {message ? <Callout tone={message.tone} className="mb-6" title={message.text} /> : null}

      {/* Grand écran : la liste à gauche, les réglages de l'appareil à droite. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card className="xl:order-2">
        <h2 className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-cyan-ink" aria-hidden="true" /> Sur cet appareil
        </h2>
        <p className="mt-1 text-sm text-muted">
          Reçois tes récaps et tes alertes même appli fermée. Tu choisis lesquels dans les{' '}
          <Link href="/app/recap#reglages" className="font-semibold text-fg underline underline-offset-2">
            réglages du récap
          </Link>
          .
        </p>
        <PushToggle publicKey={publicKey} className="mt-4" />
        {devices.length ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-semibold">Appareils abonnés</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {devices.map((d) => (
                <li key={d.id}>
                  {d.data.device} · depuis {formatRelative(d.created_at)}
                </li>
              ))}
            </ul>
            {publicKey ? (
              <form action={sendTestPushAction} className="mt-3">
                <SubmitButton variant="ghost" size="sm" pendingLabel="Envoi…">
                  M’envoyer une notification de test
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="min-w-0 xl:order-1">
      <nav aria-label="Filtrer les notifications" className="mb-4 flex gap-2">
        {[
          { href: '/app/notifications', label: 'Toutes', active: !onlyUnread },
          { href: '/app/notifications?filtre=non-lues', label: `Non lues${unread ? ` (${unread})` : ''}`, active: onlyUnread },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors',
              tab.active ? 'bg-fg text-bg' : 'border border-line text-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <EmptyState title={onlyUnread ? 'Aucune notification non lue' : 'Pas encore de notification'}>
          {onlyUnread
            ? 'Tout est lu. Les nouvelles alertes et rappels apparaîtront ici.'
            : 'Tes alertes de produits, les baisses de tes produits suivis, tes rappels de publication et tes récaps arriveront ici.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{group.label}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-raised">
                {group.items.map((record) => (
                  <li key={record.id}>
                    <form action={openNotificationAction}>
                      <input type="hidden" name="id" value={record.id} />
                      <button
                        type="submit"
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface focus-visible:bg-surface',
                          !record.data.read && 'bg-cyan-ink/[0.03]',
                        )}
                      >
                        <span
                          className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', record.data.read ? 'bg-transparent' : 'bg-cyan')}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={record.data.type === 'baisse' ? 'rose' : record.data.type === 'alerte' ? 'cyan' : 'neutral'}>
                              {NOTIFICATION_LABELS[record.data.type] ?? 'Info'}
                            </Badge>
                            <span className="text-xs text-muted">{formatRelative(record.created_at)}</span>
                            {!record.data.read ? <span className="sr-only">Non lue</span> : null}
                          </span>
                          <span className={cn('mt-1 block leading-snug', record.data.read ? 'font-medium' : 'font-semibold')}>
                            {record.data.title}
                          </span>
                          {record.data.body ? <span className="mt-0.5 block whitespace-pre-line text-sm text-muted">{record.data.body}</span> : null}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
