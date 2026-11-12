import type { Metadata } from 'next';
import { LegalPage, Todo } from '@/components/public/legal';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Mentions légales' };

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updated="12 novembre 2026">
      <section>
        <h2>Éditeur du site</h2>
        <p>
          Le site et le service {BRAND} sont édités par <Todo>raison sociale</Todo>, <Todo>forme juridique (ex. SAS, micro-entreprise)</Todo>{' '}
          au capital de <Todo>montant</Todo> €, immatriculée sous le numéro SIREN <Todo>numéro</Todo> (RCS <Todo>ville</Todo>), dont le
          siège est situé <Todo>adresse postale complète</Todo>.
        </p>
        <p>
          Numéro de TVA intracommunautaire : <Todo>numéro, ou « TVA non applicable, article 293 B du CGI »</Todo>.
        </p>
        <p>
          Directeur ou directrice de la publication : <Todo>prénom et nom</Todo>. Contact : <Todo>adresse e-mail de contact</Todo>.
        </p>
      </section>
      <section>
        <h2>Hébergement</h2>
        <p>
          Le site est hébergé par Netlify, Inc. (netlify.com), [À COMPLÉTER : adresse postale et téléphone de l’hébergeur, à reprendre sur netlify.com]. Les données
          des comptes sont hébergées par Supabase (supabase.com), dans la région <Todo>région du projet Supabase, idéalement dans l’Union européenne</Todo>.
          Coordonnées à vérifier au moment de la mise en ligne.
        </p>
      </section>
      <section>
        <h2>Indépendance vis-à-vis de TikTok</h2>
        <p>
          {BRAND} est un service indépendant. Il n’est ni édité, ni sponsorisé, ni approuvé par TikTok ou ByteDance. « TikTok » et
          « TikTok Shop » sont des marques de leurs propriétaires respectifs, citées uniquement pour décrire le service. {BRAND} ne
          se connecte jamais aux comptes TikTok de ses utilisateurs et ne publie aucun contenu à leur place.
        </p>
      </section>
      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Les textes, visuels et logiciels du site sont protégés. Les scripts générés pour un utilisateur lui appartiennent : il peut
          les utiliser librement pour ses vidéos. La police Sora est utilisée sous licence SIL Open Font License 1.1.
        </p>
      </section>
      <section>
        <h2>Médiation de la consommation</h2>
        <p>
          En cas de litige, après une réclamation écrite restée sans réponse satisfaisante, tu peux recourir gratuitement au
          médiateur de la consommation : <Todo>nom et coordonnées du médiateur choisi</Todo>.
        </p>
      </section>
    </LegalPage>
  );
}
