import {
  Sprout, Fish, UtensilsCrossed, Scissors, Shirt, Heart, Home, Smartphone, Wrench,
  Briefcase, Milk, Bike, Dumbbell, Gamepad2, BookOpen, Package, Hammer, ShoppingBag,
  type LucideIcon,
} from 'lucide-react';

export const categoryIconMap: Record<string, LucideIcon> = {
  Wheat: Sprout,
  Fish,
  UtensilsCrossed,
  Scissors,
  Shirt,
  Heart,
  Home,
  Smartphone,
  Wrench,
  Briefcase,
  Milk,
  Bike,
  Dumbbell,
  Gamepad2,
  BookOpen,
  Package,
  Hammer,
  Sprout,
};

export const availableIconNames: { name: string; Icon: LucideIcon }[] = [
  { name: 'Smartphone', Icon: Smartphone },
  { name: 'Shirt', Icon: Shirt },
  { name: 'Home', Icon: Home },
  { name: 'UtensilsCrossed', Icon: UtensilsCrossed },
  { name: 'Sprout', Icon: Sprout },
  { name: 'Wheat', Icon: Sprout },
  { name: 'Milk', Icon: Milk },
  { name: 'Fish', Icon: Fish },
  { name: 'Bike', Icon: Bike },
  { name: 'Heart', Icon: Heart },
  { name: 'Dumbbell', Icon: Dumbbell },
  { name: 'Gamepad2', Icon: Gamepad2 },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Scissors', Icon: Scissors },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Hammer', Icon: Hammer },
  { name: 'Package', Icon: Package },
];

export function getCategoryIcon(iconName: string | null | undefined): LucideIcon {
  return (iconName && categoryIconMap[iconName]) || ShoppingBag;
}
