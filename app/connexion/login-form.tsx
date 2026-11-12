'use client';

import { MailCheck } from 'lucide-react';
import { useFormState } from 'react-dom';
import { buttonClasses } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { requestMagicLink, type LoginState } from './actions';

export function LoginForm({ suite, localMode }: { suite: string; localMode: boolean }) {
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
