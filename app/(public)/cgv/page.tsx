import type { Metadata } from 'next';
import { LegalPage, Todo } from '@/components/public/legal';
import { BRAND } from '@/lib/brand';
import { COACH_TRIAL_DAYS, getPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { formatEuros } from '@/lib/utils';

export const metadata: Metadata = { title: 'Conditions générales de vente' };

export default function CgvPage() {
  const pro = getPlan('pro');
  const plus = getPlan('proplus');
  const rate = Math.round(REFERRAL_COMMISSION_RATE * 100);
  return (
    <LegalPage title="Conditions générales de vente et d’utilisation" updated="12 novembre 2026">
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
          <li>Gratuit : 0 €, 3 produits du jour, 3 écritures de scripts par jour, récap par e-mail.</li>
          <li>
            Pro : {formatEuros(pro.prices.month)} par mois ou {formatEuros(pro.prices.year)} par an. Radar complet, score détaillé, 30
            écritures de scripts par jour, récap Discord et e-mail.
          </li>
          <li>
            Pro+ : {formatEuros(plus.prices.month)} par mois ou {formatEuros(plus.prices.year)} par an. Écritures illimitées (dans le
            cadre d’un usage personnel raisonnable), export des scripts, accès en priorité aux nouvelles fonctions.
          </li>
        </ul>
        <p>
          Prix en euros, <Todo>« toutes taxes comprises » ou « TVA non applicable, article 293 B du CGI »</Todo>. Le paiement se fait
          par carte via Stripe ; {BRAND} n’a jamais accès aux numéros de carte.
        </p>
      </section>
      <section>
        <h2>4. Durée, renouvellement et résiliation</h2>
        <p>
          Les abonnements sont sans engagement et se renouvellent automatiquement à chaque échéance (mois ou année). L’utilisateur
          peut résilier à tout moment depuis son compte (« Gérer mon abonnement ») : la résiliation prend effet à la fin de la
          période en cours, sans frais ni remboursement au prorata, sauf disposition légale contraire.
        </p>
      </section>
      <section>
        <h2>5. Droit de rétractation</h2>
        <p>
          Le consommateur dispose de 14 jours après la souscription pour se rétracter. En demandant l’accès immédiat au service
          pendant ce délai, il accepte que l’exécution commence tout de suite ; s’il se rétracte ensuite, il paie le montant
          correspondant au service fourni jusqu’à sa rétractation. Demande à adresser à <Todo>adresse e-mail de contact</Todo>.
        </p>
      </section>
      <section>
        <h2>6. Essai offert par un formateur</h2>
        <p>
          Un utilisateur inscrit avec le code d’un formateur partenaire bénéficie de {Math.round(COACH_TRIAL_DAYS / 30)} mois de
          plan Pro offerts, sans moyen de paiement. À la fin de l’essai, faute de moyen de paiement enregistré, le compte repasse
          automatiquement en Gratuit, sans aucun prélèvement. Un seul essai par personne.
        </p>
      </section>
      <section>
        <h2>7. Parrainage et formateurs partenaires</h2>
        <p>
          Chaque utilisateur dispose d’un lien de parrainage. Le parrain ou le formateur perçoit une commission de {rate} % du montant
          hors taxes de chaque paiement de ses filleuls, tant que ceux-ci restent abonnés. Les commissions sont calculées
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
