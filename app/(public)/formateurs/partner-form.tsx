'use client';

import { CheckCircle2 } from 'lucide-react';
import { useFormState } from 'react-dom';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout } from '@/components/ui/surface';
import { submitPartnerRequest, type PartnerState } from './actions';

export function PartnerForm() {
  const [state, action] = useFormState<PartnerState, FormData>(submitPartnerRequest, { status: 'idle' });

  if (state.status === 'ok') {
    return (
      <Callout tone="gain" icon={<CheckCircle2 className="h-5 w-5 text-gain" aria-hidden="true" />} title="Demande envoyée">
        Merci ! On te répond par e-mail avec ton code formateur et ton lien.
      </Callout>
    );
  }

  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === 'error' ? (
        <Callout tone="rose" title="Demande non envoyée">
          {state.message}
        </Callout>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ton nom" htmlFor="nom">
          <Input id="nom" name="nom" autoComplete="name" required defaultValue={f.name} />
        </Field>
        <Field label="Ton e-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={f.email} />
        </Field>
      </div>
      <Field label="Nom de ta formation" htmlFor="formation">
        <Input id="formation" name="formation" required defaultValue={f.training_name} />
      </Field>
      <Field label="Nombre d’élèves (environ)" htmlFor="audience">
        <Select id="audience" name="audience" defaultValue={f.audience_size ?? ''}>
          <option value="">Je préfère ne pas dire</option>
          <option value="moins de 50">Moins de 50</option>
          <option value="50 à 200">50 à 200</option>
          <option value="200 à 1 000">200 à 1 000</option>
          <option value="plus de 1 000">Plus de 1 000</option>
        </Select>
      </Field>
      <Field label="Un mot sur ta formation (facultatif)" htmlFor="message">
        <Textarea id="message" name="message" maxLength={2000} defaultValue={f.message} />
      </Field>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="site">Laisse ce champ vide</label>
        <input id="site" name="site" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton size="lg" pendingLabel="Envoi de ta demande…">
        Envoyer ma demande
      </SubmitButton>
      <p className="text-xs text-muted">
        Tes informations servent uniquement à te recontacter au sujet du partenariat. Voir la politique de confidentialité.
      </p>
    </form>
  );
}
