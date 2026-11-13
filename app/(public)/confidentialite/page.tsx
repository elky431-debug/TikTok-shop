import type { Metadata } from 'next';
import { LegalPage, Todo } from '@/components/public/legal';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = { title: 'Politique de confidentialité' };

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" updated="12 novembre 2026">
      <section>
        <h2>Qui est responsable de tes données ?</h2>
        <p>
          <Todo>raison sociale et adresse</Todo>, éditeur de {BRAND}, est responsable du traitement. Pour toute question ou pour
          exercer tes droits : <Todo>adresse e-mail dédiée, ex. confidentialite@ton-domaine.fr</Todo>.
        </p>
      </section>

      <section>
        <h2>Ce que nous collectons, et pourquoi</h2>
        <ul>
          <li>
            <strong>Compte</strong> : adresse e-mail, prénom, pseudo TikTok (facultatif), tranche d’abonnés, niches, style de vidéo,
            phrase d’exemple. Pour fournir le service et personnaliser le radar et les scripts (exécution du contrat).
          </li>
          <li>
            <strong>Utilisation</strong> : scripts écrits, produits suivis, nombre de vidéos déclarées, compteur quotidien, dernière
            connexion. Pour le service, l’application des limites du plan et l’espace formateur (exécution du contrat).
          </li>
          <li>
            <strong>Paiement</strong> : statut d’abonnement et identifiant client Stripe. Les données de carte sont traitées par
            Stripe uniquement. Les factures sont conservées au titre de nos obligations comptables (obligation légale). Ta demande
            de démarrage immédiat de l’abonnement (date et texte coché) est gardée comme preuve, au titre du droit de rétractation
            (obligation légale), <Todo>durée de conservation, ex. 5 ans</Todo>.
          </li>
          <li>
            <strong>Discord</strong> (si tu lies ton compte) : ton identifiant Discord, pour t’envoyer ton récap et gérer ton rôle.
          </li>
          <li>
            <strong>Formulaire formateur</strong> : nom, e-mail, formation, message. Pour te recontacter (intérêt légitime).
          </li>
          <li>
            <strong>Journaux techniques</strong> : nécessaires à la sécurité et au bon fonctionnement (intérêt légitime).
          </li>
        </ul>
        <p>
          Nous ne nous connectons jamais à ton compte TikTok et ne collectons aucune donnée depuis celui-ci. Aucune donnée n’est
          vendue ni utilisée à des fins publicitaires.
        </p>
      </section>

      <section>
        <h2>Ton formateur</h2>
        <p>
          Si tu t’es inscrit avec le code d’un formateur, il voit des informations limitées : ton prénom, ton plan, ton statut
          (préparation ou affilié), le nombre de scripts écrits, le nombre de produits suivis et ta dernière connexion. Il ne voit ton
          adresse e-mail que si tu l’as accepté dans ton compte (consentement retirable à tout moment).
        </p>
      </section>

      <section>
        <h2>Nos sous-traitants</h2>
        <ul>
          <li>Supabase : base de données et connexion (région <Todo>région du projet</Todo>).</li>
          <li>Netlify : hébergement du site.</li>
          <li>Stripe : paiement des abonnements.</li>
          <li>Resend : envoi des e-mails.</li>
          <li>
            Anthropic : écriture des scripts. Seuls la fiche produit, le format, ton style de vidéo, ta phrase d’exemple et ton
            prénom sont transmis ; jamais ton e-mail.
          </li>
          <li>Discord : uniquement si tu lies ton compte.</li>
        </ul>
        <p>
          Certains sont établis hors de l’Union européenne ; les transferts sont encadrés par les clauses contractuelles types de la
          Commission européenne ou un mécanisme équivalent. <Todo>vérifier les accords de traitement (DPA) signés avec chaque prestataire</Todo>
        </p>
      </section>

      <section>
        <h2>Combien de temps nous les gardons</h2>
        <ul>
          <li>Compte : tant qu’il est actif, puis <Todo>durée après la dernière connexion, ex. 3 ans</Todo> avant suppression.</li>
          <li>Pièces comptables : 10 ans (obligation légale).</li>
          <li>Demandes de partenariat : 3 ans après le dernier contact.</li>
          <li>Récaps du matin : quelques semaines.</li>
        </ul>
      </section>

      <section>
        <h2>Tes droits</h2>
        <p>
          Tu peux accéder à tes données, les corriger (page Compte), les supprimer (bouton « Supprimer mon compte », effacement
          immédiat), demander leur portabilité, t’opposer à un traitement ou en demander la limitation, en écrivant à l’adresse
          ci-dessus. Tu peux aussi saisir la CNIL (cnil.fr).
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          {BRAND} n’utilise que des cookies strictement nécessaires : ta session de connexion, le code d’invitation d’un parrain ou
          d’un formateur (30 jours) et ton choix de thème clair ou sombre. Aucun cookie publicitaire ni de mesure d’audience : c’est
          pourquoi aucune bannière de consentement ne s’affiche.
        </p>
      </section>
    </LegalPage>
  );
}
