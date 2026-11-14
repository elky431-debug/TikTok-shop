import type { Profile } from '@/lib/db/types';
import type { LaunchStep } from '@/lib/v2/launch';
import type { LaunchPageData } from '@/lib/v2/launch-view';
import { StepFrame, StepNav } from '../step-frame';
import { ProductStep } from './product-step';
import { SampleStep } from './sample-step';
import { ScriptsStep } from './scripts-step';
import { PlanStep } from './plan-step';
import { ShootStep } from './shoot-step';

/** Affiche l'étape demandée d'un lancement. */
export function LaunchStepView({
  step,
  data,
  profile,
  searchParams,
  generating = false,
}: {
  step: LaunchStep;
  data: LaunchPageData;
  profile: Profile;
  searchParams: Record<string, string | undefined>;
  generating?: boolean;
}) {
  switch (step) {
    case 'produit':
      return <ProductStep data={data} profile={profile} />;
    case 'echantillon':
      return <SampleStep data={data} searchParams={searchParams} />;
    case 'scripts':
      return <ScriptsStep data={data} profile={profile} searchParams={searchParams} generating={generating} />;
    case 'planifier':
      return <PlanStep data={data} profile={profile} searchParams={searchParams} />;
    case 'tourner':
      return <ShootStep data={data} />;
    default:
      return (
        <StepFrame step={step} sentence="Cette étape arrive.">
          <StepNav id={data.launch.id} step={step} />
        </StepFrame>
      );
  }
}
