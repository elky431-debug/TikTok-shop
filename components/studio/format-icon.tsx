import { ArrowLeftRight, BookOpen, ListChecks, MessageSquareReply, PackageOpen, Scale, Trophy, Video, type LucideIcon } from 'lucide-react';
import type { StudioFormat } from '@/lib/ai/formats';

/** Une icône par format de vidéo (cartes du studio, historique). */
export const FORMAT_ICONS: Record<StudioFormat, LucideIcon> = {
  demo: Video,
  avant_apres: ArrowLeftRight,
  histoire: BookOpen,
  reponse_commentaire: MessageSquareReply,
  unboxing: PackageOpen,
  comparaison: Scale,
  routine: ListChecks,
  top3: Trophy,
};

export function FormatIcon({ format, className }: { format: StudioFormat; className?: string }) {
  const Icon = FORMAT_ICONS[format] ?? Video;
  return <Icon className={className} aria-hidden="true" />;
}
