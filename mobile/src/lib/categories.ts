import {
  Armchair,
  Droplet,
  type LucideIcon,
  PaintRoller,
  Snowflake,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react-native';
import type { Category, Language } from '../api/types';

/** Icon keys stored with categories (backend prisma/seed/categories.ts). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  droplet: Droplet,
  'paint-roller': PaintRoller,
  sparkles: Sparkles,
  armchair: Armchair,
  snowflake: Snowflake,
  wrench: Wrench,
};

export function categoryIcon(icon: string): LucideIcon {
  return CATEGORY_ICONS[icon] ?? Wrench;
}

export function categoryName(category: Pick<Category, 'names'>, language: Language): string {
  return category.names[language] ?? category.names.uz;
}
