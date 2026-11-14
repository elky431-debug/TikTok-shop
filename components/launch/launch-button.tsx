import { CalendarDays, PenLine, Rocket } from 'lucide-react';
import { startLaunchAction } from '@/app/app/lancer/actions';
import type { ButtonSize, ButtonVariant } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';
import type { LaunchStep } from '@/lib/v2/launch';

const ICONS = { fusee: Rocket, calendrier: CalendarDays, stylo: PenLine } as const;

/**
 * Bouton qui ouvre (ou reprend) le lancement d'un produit, à une étape donnée : « Lancer ce produit », « Écrire mes
 * scripts », « Planifier »… Le produit est suivi au passage ; s'il dépasse la limite du plan, retour à `back` avec
 * `?lancement=limite`.
 */
export function LaunchButton({
  productId,
  back,
  step,
  label,
  icon,
  variant = 'primary',
  size = 'md',
  className,
}: {
  productId: string;
  back: string;
  step?: LaunchStep;
  label: string;
  icon?: keyof typeof ICONS;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const Icon = ICONS[icon ?? (step === 'scripts' ? 'stylo' : step === 'planifier' ? 'calendrier' : 'fusee')];
  return (
    <form action={startLaunchAction}>
      <input type="hidden" name="produit" value={productId} />
      <input type="hidden" name="retour" value={back} />
      {step ? <input type="hidden" name="etape" value={step} /> : null}
      <SubmitButton variant={variant} size={size} className={className} pendingLabel="Ouverture…">
        <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
        {label}
      </SubmitButton>
    </form>
  );
}
