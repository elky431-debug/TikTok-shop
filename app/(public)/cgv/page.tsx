import type { Metadata } from 'next';
import { LegalPage, Todo } from '@/components/public/legal';
import { BRAND } from '@/lib/brand';
import { WITHDRAWAL_CONSENT_TEXT } from '@/lib/billing/consent';
import { COACH_FIRST_MONTH_DISCOUNT, getPlan, REFERRAL_COMMISSION_RATE, yearlyMonthlyEquivalent } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';

export const metadata: Metadata = { title: 'Conditions générales de vente' };

export default function CgvPage() {
  const starter = getPlan('starter');
  const pro = getPlan('pro');
  const elite = getPlan('elite');
  const rate = Math.round(REFERRAL_COMMISSION_RATE * 100);
  const percent = Math.round(COACH_FIRST_MONTH_DISCOUNT * 100);
  return (
    <LegalPage title="Conditions générales de vente et d’utilisation" updated="14 novembre 2026">
      <p>
        <Todo>faire relire ces conditions par un juriste avant la mise en ligne</Todo>
      </p>
      <section>
        <h2>1. Objet</h2>
        <p>
          Ces conditions encadrent l’utilisation du service {BRAND}, édité par <Todo>raison sociale</Todo> (voir les mentions
          légales), et la souscription de ses abonnements. Créer un compte vaut acceptation de ces conditions.
        </p>
      </section>
      <section>
        <h2>2. Le service</h2>
        <p>
          {BRAND} aide les créateurs affiliés TikTok Shop à choisir des produits et à écrire leurs vidéos : un classement quotidien de
          produits avec un score d’opportunité, des scripts générés automatiquement, un récap du matin et un suivi de leurs produits.
          L’accès au service demande un abonnement payant : il n’existe ni plan gratuit ni essai.
        </p>
        <p>
          Les ventes estimées, scores et tendances sont des <strong>estimations</strong> issues de sources de données tierces. Ils
          peuvent être incomplets ou inexacts. <strong>{BRAND} ne garantit aucun résultat commercial</strong> : les ventes dépendent
          des vidéos de l’utilisateur, de son audience, du produit et des règles de TikTok.
        </p>
      </section>
      <section>
        <h2>3. Plans et prix</h2>
        <ul>
          <li>
            Starter : {formatEuros(starter.prices.month)} par mois ou {formatEuros(starter.prices.year)} par an (soit{' '}
            {formatEuros(yearlyMonthlyEquivalent('starter'))} par mois). Radar France complet
            avec score expliqué et fiche produit, {starter.scriptsPerDay} scripts par jour dans {starter.scriptFormats} formats,
            téléprompteur, {starter.savedProducts} produits suivis, plan de publication, récap du matin, {starter.alerts} alertes,{' '}
            {starter.keywordSearchesPerDay} recherches par jour, mode préparation, parrainage.
          </li>
          <li>
            Pro : {formatEuros(pro.prices.month)} par mois ou {formatEuros(pro.prices.year)} par an (soit{' '}
            {formatEuros(yearlyMonthlyEquivalent('pro'))} par mois). Tout le Starter, plus{' '}
            {pro.scriptsPerDay} scripts par jour dans les {pro.scriptFormats} formats, style personnel, série de 20 vidéos, score « pour
            toi », produits suivis illimités, suivi des gains et import CSV, {pro.analysesPerMonth} analyses de vidéo et{' '}
            {pro.offersPerMonth} propositions de marques par mois, comparateur, {pro.alerts} alertes, {pro.keywordSearchesPerDay}{' '}
            recherches par jour, récap de la semaine.
          </li>
          <li>
            Elite : {formatEuros(elite.prices.month)} par mois ou {formatEuros(elite.prices.year)} par an (soit{' '}
            {formatEuros(yearlyMonthlyEquivalent('elite'))} par mois). Tout le Pro en illimité, plus
            les catalogues d’Allemagne, d’Italie et d’Espagne, la traduction des scripts, les poids du score réglables, l’export CSV et{' '}
            {elite.keywordSearchesPerDay} recherches par jour.
          </li>
        </ul>
        <p>
          « Illimité » s’entend d’un usage personnel normal, même intensif : une limite de sécurité, appliquée par jour ou par mois,
          protège le service contre les abus et les usages automatisés. Elle n’est jamais atteinte par un usage normal.
        </p>
        <p>
          Prix en euros toutes taxes comprises <Todo>ou « TVA non applicable, article 293 B du CGI » selon le régime</Todo>.
          L’abonnement annuel est payé en une fois pour douze mois ; le prix mensuel équivalent est indiqué à titre de comparaison. Le paiement se fait par carte via Stripe ; {BRAND} n’a jamais accès
          aux numéros de carte.
        </p>
      </section>
      <section>
        <h2>4. Durée, renouvellement et résiliation</h2>
        <p>
          Les abonnements sont sans engagement et se renouvellent automatiquement à chaque échéance (mois ou année). L’utilisateur
          peut résilier à tout moment depuis son compte (« Gérer mon abonnement ») : la résiliation prend effet à la fin de la
          période en cours, sans frais ni remboursement au prorata, sauf disposition légale contraire (voir le droit de rétractation).
          Un changement de plan est calculé au prorata de la période en cours.
        </p>
      </section>
      <section id="retractation" className="scroll-mt-24">
        <h2>5. Droit de rétractation</h2>
        <p>
          Le consommateur dispose d’un délai de <strong>14 jours</strong> à compter de la souscription de son abonnement pour se
          rétracter, sans avoir à se justifier (article L221-18 du Code de la consommation).
        </p>
        <p>
          <strong>Démarrage immédiat.</strong> L’abonnement ne démarre avant la fin de ce délai que si le consommateur le demande
          expressément. Avant le paiement, il coche pour cela la case suivante, sans laquelle le paiement n’est pas lancé :
        </p>
        <blockquote>« {WITHDRAWAL_CONSENT_TEXT} »</blockquote>
        <p>
          Cette demande est enregistrée avec sa date et confirmée par e-mail avec le récapitulatif de l’abonnement. S’il se rétracte
          ensuite dans le délai, le consommateur paie un montant proportionnel au service fourni jusqu’à la communication de sa
          décision de se rétracter (article L221-25) ; le reste lui est remboursé.
        </p>
        <p>
          <strong>Comment se rétracter.</strong> Le consommateur informe {BRAND} de sa décision par une déclaration dénuée
          d’ambiguïté, par e-mail à <Todo>adresse e-mail de contact</Todo> ou par courrier à <Todo>adresse postale</Todo>, en
          utilisant s’il le souhaite le formulaire ci-dessous. Le remboursement est fait au plus tard 14 jours après la réception de
          la demande, par le même moyen de paiement que celui utilisé pour la souscription, sans frais pour le consommateur.
        </p>
        <p>
          <strong>Formulaire de rétractation</strong> (modèle de l’annexe à l’article R221-1 du Code de la consommation) :
        </p>
        <blockquote>
          (Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)
          <br />À l’attention de <Todo>raison sociale, adresse postale et adresse e-mail</Todo> :
          <br />
          Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat pour la vente du bien (*)/pour
          la prestation de services (*) ci-dessous :
          <br />
          Commandé le (*)/reçu le (*) :
          <br />
          Nom du (des) consommateur(s) :
          <br />
          Adresse du (des) consommateur(s) :
          <br />
          Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :
          <br />
          Date :
          <br />
          (*) Rayez la mention inutile.
        </blockquote>
      </section>
      <section>
        <h2>6. Code d’un formateur partenaire</h2>
        <p>
          Un utilisateur inscrit avec le code ou le lien d’un formateur partenaire bénéficie d’une remise de {percent} % sur le premier
          mois de son abonnement mensuel, quel que soit le plan, une seule fois par compte (aucun abonnement souscrit auparavant). La
          remise est appliquée automatiquement au premier paiement ; elle ne s’applique pas à l’abonnement annuel. Les essais offerts
          ouverts avant le 13 novembre 2026 vont jusqu’à leur terme, sans prélèvement si aucun abonnement n’est choisi.
        </p>
      </section>
      <section>
        <h2>7. Parrainage et formateurs partenaires</h2>
        <p>
          Chaque utilisateur dispose d’un lien de parrainage. Le parrain ou le formateur perçoit une commission de {rate} % du montant
          hors taxes de chaque paiement de ses filleuls (après remise éventuelle), tant que ceux-ci restent abonnés. Les commissions sont calculées
          automatiquement à chaque paiement encaissé (les remboursements et impayés ne génèrent pas de commission) et versées par
          virement <Todo>fréquence et seuil de versement, ex. mensuel dès 50 €</Todo>. Le bénéficiaire est responsable de ses
          obligations fiscales et sociales. Toute fraude (auto-parrainage, faux comptes) entraîne l’annulation des commissions.
        </p>
      </section>
      <section>
        <h2>8. Obligations de l’utilisateur</h2>
        <ul>
          <li>Respecter les règles de TikTok et de TikTok Shop, et la loi.</li>
          <li>
            Signaler clairement toute collaboration commerciale dans ses vidéos (mention « publicité » ou « partenariat » et option de
            contenu commercial de TikTok), conformément à la loi du 9 juin 2023 sur l’influence commerciale.
          </li>
          <li>
            Relire et adapter les scripts générés : l’utilisateur reste seul responsable de ce qu’il publie, en particulier des
            allégations sur les produits.
          </li>
          <li>Ne pas revendre l’accès, ni extraire massivement les données du service.</li>
        </ul>
      </section>
      <section>
        <h2>9. Responsabilité</h2>
        <p>
          {BRAND} met tout en œuvre pour fournir un service disponible et des informations utiles, sans garantie d’exactitude des
          données tierces ni de disponibilité continue. Sa responsabilité ne peut être engagée pour des pertes de chiffre d’affaires
          liées aux choix de produits de l’utilisateur.
        </p>
      </section>
      <section>
        <h2>10. Données personnelles</h2>
        <p>Voir la politique de confidentialité.</p>
      </section>
      <section>
        <h2>11. Modification, droit applicable et litiges</h2>
        <p>
          Ces conditions peuvent évoluer ; l’utilisateur est prévenu par e-mail au moins 30 jours avant toute modification
          importante. Elles sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité,
          puis le recours au médiateur de la consommation est possible (voir les mentions légales).
        </p>
      </section>
    </LegalPage>
  );
}
