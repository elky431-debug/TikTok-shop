import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Field, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { EARNING_FIELDS, guessMapping, normalizeText, parseEarningsCsv, PENDING_IMPORT_KIND, readCsv, type PendingImport } from '@/lib/v2/earnings';
import { getMapping } from '@/lib/v2/earnings-store';
import { cancelImportAction, confirmImportAction } from '../commissions-actions';

export const metadata: Metadata = { title: 'Choisir les colonnes' };

const ERRORS: Record<string, string> = {
  obligatoires: 'Choisis une colonne pour la date, le produit et le montant.',
  doublon: 'Une même colonne est choisie pour deux champs : chaque colonne ne sert qu’une fois.',
  aucune: 'Aucune ligne n’a pu être lue avec ces colonnes : vérifie la date et le montant dans l’aperçu.',
};

/** Écran de choix des colonnes : à la première importation (ou sur demande), puis la correspondance est mémorisée. */
export default async function ImportMappingPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/gestionnaire');
  if (!getPlan(profile.plan).earnings) redirect('/app');
  const repo = getRepo();
  const pending = searchParams.fichier ? await repo.getRecord<PendingImport>(profile.id, searchParams.fichier) : null;
  if (!pending || pending.kind !== PENDING_IMPORT_KIND) redirect('/app?onglet=commissions&erreur=expire#gestion');
  const table = readCsv(pending.data.text);
  const memorized = await getMapping(repo, profile.id);
  const guess = guessMapping(table.headers);
  const preset = (field: string) => {
    const col = memorized?.data.mapping[field as keyof typeof guess] ?? guess[field as keyof typeof guess];
    return col && table.headers.some((h) => normalizeText(h) === normalizeText(col)) ? table.headers.find((h) => normalizeText(h) === normalizeText(col)) : '';
  };
  const trial = parseEarningsCsv(pending.data.text, Object.fromEntries(EARNING_FIELDS.map((f) => [f.key, preset(f.key)])));
  const preview = table.rows.slice(0, 5);

  return (
    <div>
      <Link href="/app?onglet=commissions#gestion" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Commissions
      </Link>
      <PageHeader eyebrow="Suivre"
        title="Choisis les colonnes"
        description={`${pending.data.file_name ? `« ${pending.data.file_name} » : ` : ''}${table.rows.length} ligne${table.rows.length > 1 ? 's' : ''}. Dis-nous quelle colonne contient quoi : ce choix est gardé pour tes prochains imports.`}
      />
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title={ERRORS[searchParams.erreur] ?? ERRORS.aucune} /> : null}

      <Card>
        <form action={confirmImportAction} className="space-y-5">
          <input type="hidden" name="fichier" value={pending.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            {EARNING_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={`${field.label}${field.required ? '' : ' (facultatif)'}`}
                htmlFor={`col_${field.key}`}
                hint={field.hint}
              >
                <Select id={`col_${field.key}`} name={`col_${field.key}`} defaultValue={preset(field.key)} required={field.required}>
                  <option value="">{field.required ? 'Choisis une colonne' : 'Aucune colonne'}</option>
                  {table.headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={h}>
                      {h || `Colonne ${i + 1} (sans nom)`}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {trial.rows.length ? (
            <p className="text-sm text-muted">
              Avec les colonnes proposées : {trial.rows.length} ligne{trial.rows.length > 1 ? 's' : ''} lisible{trial.rows.length > 1 ? 's' : ''}
              {trial.errors.length ? `, ${trial.errors.length} ignorée${trial.errors.length > 1 ? 's' : ''} (${trial.errors[0]})` : ''}.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="Import…">Importer avec ces colonnes</SubmitButton>
          </div>
        </form>
        <form action={cancelImportAction} className="mt-2">
          <input type="hidden" name="fichier" value={pending.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Annulation…">
            Annuler l’import
          </SubmitButton>
        </form>
      </Card>

      <section className="mt-6" aria-labelledby="apercu">
        <h2 id="apercu" className="mb-2 text-lg">
          Aperçu du fichier
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={`${h}-${i}`} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                    {h || `Colonne ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.map((row, r) => (
                <tr key={r}>
                  {table.headers.map((_, c) => (
                    <td key={c} className="max-w-[14rem] truncate px-3 py-2">
                      {row[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Les 5 premières lignes. Le fichier reste privé et n’est gardé que le temps de l’import.</p>
      </section>
    </div>
  );
}
