'use client';

import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { buttonClasses } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { requestMagicLink, signInWithPassword, signUpWithPassword, type LoginState } from './actions';

type Mode = 'inscription' | 'connexion' | 'lien';

const TABS: Array<{ id: Exclude<Mode, 'lien'>; label: string }> = [
  { id: 'inscription', label: 'Créer mon compte' },
  { id: 'connexion', label: 'Me connecter' },
];

/** Inscription et connexion par e-mail et mot de passe ; le lien magique reste possible. */
export function LoginForm({ suite, localMode, initialMode = 'inscription' }: { suite: string; localMode: boolean; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  return (
    <div className="space-y-4">
      {mode !== 'lien' ? (
        <div role="tablist" aria-label="Inscription ou connexion" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={cn(
                'h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan',
                mode === tab.id ? 'bg-raised text-fg shadow' : 'text-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      {mode === 'inscription' ? <PasswordForm key="inscription" kind="inscription" suite={suite} /> : null}
      {mode === 'connexion' ? <PasswordForm key="connexion" kind="connexion" suite={suite} /> : null}
      {mode === 'lien' ? <MagicLinkForm suite={suite} localMode={localMode} /> : null}
      <button
        type="button"
        onClick={() => setMode(mode === 'lien' ? 'inscription' : 'lien')}
        className="w-full text-center text-sm font-semibold text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        {mode === 'lien' ? 'Utiliser un mot de passe' : 'Mot de passe oublié ou pas envie d’en créer un ? Reçois un lien de connexion'}
      </button>
    </div>
  );
}

function PasswordForm({ kind, suite }: { kind: 'inscription' | 'connexion'; suite: string }) {
  const [state, action] = useFormState<LoginState, FormData>(kind === 'inscription' ? signUpWithPassword : signInWithPassword, { status: 'idle' });
  if (state.status === 'confirm') {
    return (
      <Callout tone="gain" icon={<MailCheck className="h-5 w-5 text-gain" aria-hidden="true" />} title="Compte créé">
        Ouvre ta boîte mail <strong>{state.email}</strong> et clique sur le lien de confirmation. Pense à regarder dans les
        indésirables.
      </Callout>
    );
  }
  const error = state.status === 'error' ? state.message : null;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="suite" value={suite} />
      <Field label="Ton adresse e-mail" htmlFor={`${kind}-email`}>
        <Input
          id={`${kind}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="prenom@gmail.com"
          defaultValue={state.email}
          required
        />
      </Field>
      <Field
        label="Ton mot de passe"
        htmlFor={`${kind}-password`}
        error={error}
        hint={kind === 'inscription' ? '8 caractères au moins.' : undefined}
      >
        <Input
          id={`${kind}-password`}
          name="password"
          type="password"
          autoComplete={kind === 'inscription' ? 'new-password' : 'current-password'}
          minLength={kind === 'inscription' ? 8 : undefined}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${kind}-password-erreur` : undefined}
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingLabel={kind === 'inscription' ? 'Création du compte…' : 'Connexion…'}>
        {kind === 'inscription' ? 'Créer mon compte' : 'Me connecter'}
      </SubmitButton>
    </form>
  );
}

function MagicLinkForm({ suite, localMode }: { suite: string; localMode: boolean }) {
  const [state, action] = useFormState<LoginState, FormData>(requestMagicLink, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <div className="space-y-4" aria-live="polite">
        <Callout tone="gain" icon={<MailCheck className="h-5 w-5 text-gain" aria-hidden="true" />} title="Lien magique envoyé">
          {state.localLink ? (
            <>Mode local : aucun e-mail ne part. Ton lien pour <strong>{state.email}</strong> est juste en dessous.</>
          ) : (
            <>
              Ouvre ta boîte mail <strong>{state.email}</strong> et clique sur le lien. Il reste valable une heure. Pense à
              regarder dans les indésirables.
            </>
          )}
        </Callout>
        {state.localLink ? (
          <a href={state.localLink} className={buttonClasses('primary', 'lg', 'w-full')} data-testid="lien-magique-local">
            Ouvrir mon lien magique
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="suite" value={suite} />
      <Field
        label="Ton adresse e-mail"
        htmlFor="email"
        error={state.status === 'error' ? state.message : null}
        hint={localMode ? 'Mode local : le lien s’affichera ici, sans e-mail.' : 'Pas de mot de passe : on t’envoie un lien de connexion.'}
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="prenom@gmail.com"
          defaultValue={state.email}
          required
          aria-invalid={state.status === 'error'}
          aria-describedby={state.status === 'error' ? 'email-erreur' : 'email-aide'}
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingLabel="Envoi du lien…">
        Recevoir mon lien magique
      </SubmitButton>
    </form>
  );
}
