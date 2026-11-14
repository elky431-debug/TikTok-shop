import type { Profile } from '@/lib/db/types';
import type { LaunchStep } from '@/lib/v2/launch';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { StepFrame, StepNav } from '../step-frame';
import { ProductStep } from './product-step';

/** Affiche l'étape demandée d'un lancement. */
export function LaunchStepView({
  step,
  data,
  profile,
}: {
  step: LaunchStep;
  data: LaunchPageData;
  profile: Profile;
  searchParams: Record<string, string | undefined>;
}) {
  switch (step) {
    case 'produit':
      return <ProductStep data={data} profile={profile} />;
    default:
      return (
        <StepFrame step={step} sentence="Cette étape arrive.">
          <StepNav id={data.launch.id} step={step} />
        </StepFrame>
      );
  }
}
