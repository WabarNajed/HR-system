'use client';

import {
  AlarmClock,
  Ambulance,
  Archive,
  Award,
  Baby,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpen,
  Briefcase,
  BriefcaseBusiness,
  Building,
  Building2,
  Bus,
  Calculator,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Car,
  ChartColumn,
  ChevronsUpDownIcon,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ClockAlert,
  Coffee,
  Coins,
  Contact,
  CreditCard,
  DoorOpen,
  FileBadge,
  FileCheck,
  FileClock,
  FilePenLine,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  Flag,
  Folder,
  Gavel,
  Gift,
  Globe,
  GraduationCap,
  HandCoins,
  HandHelping,
  Handshake,
  Headset,
  HeartHandshake,
  HeartPulse,
  Hospital,
  Hotel,
  Hourglass,
  House,
  IdCard,
  Inbox,
  Info,
  KeyRound,
  Landmark,
  Laptop,
  ListChecks,
  LogIn,
  LogOut,
  Luggage,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  Percent,
  Phone,
  PiggyBank,
  Pill,
  Plane,
  PlaneTakeoff,
  Printer,
  Receipt,
  Repeat,
  Rocket,
  Route,
  Scale,
  Settings,
  Shield,
  ShieldCheck,
  ShieldPlus,
  Signature,
  Smartphone,
  Sparkles,
  Stamp,
  Star,
  Stethoscope,
  Syringe,
  Target,
  Ticket,
  Timer,
  TreePalm,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Truck,
  Umbrella,
  User,
  UserCheck,
  UserCog,
  UserMinus,
  UserPen,
  UserPlus,
  Users,
  UserX,
  Utensils,
  Wallet,
  Workflow,
  Wrench,
  XIcon,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createElement, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Curated lucide icons (kebab-case names as stored in DB, e.g. `request_types.icon`).
 * Only these are bundled; unknown names render the fallback.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  'alarm-clock': AlarmClock,
  ambulance: Ambulance,
  archive: Archive,
  award: Award,
  baby: Baby,
  'badge-check': BadgeCheck,
  banknote: Banknote,
  bell: Bell,
  'book-open': BookOpen,
  briefcase: Briefcase,
  'briefcase-business': BriefcaseBusiness,
  building: Building,
  'building-2': Building2,
  bus: Bus,
  calculator: Calculator,
  'calendar-check': CalendarCheck,
  'calendar-clock': CalendarClock,
  'calendar-days': CalendarDays,
  'calendar-plus': CalendarPlus,
  'calendar-range': CalendarRange,
  'calendar-x': CalendarX,
  car: Car,
  'chart-column': ChartColumn,
  'circle-help': CircleHelp,
  'clipboard-check': ClipboardCheck,
  'clipboard-list': ClipboardList,
  clock: Clock,
  'clock-alert': ClockAlert,
  coffee: Coffee,
  coins: Coins,
  contact: Contact,
  'credit-card': CreditCard,
  'door-open': DoorOpen,
  'file-badge': FileBadge,
  'file-check': FileCheck,
  'file-clock': FileClock,
  'file-pen-line': FilePenLine,
  'file-search': FileSearch,
  'file-spreadsheet': FileSpreadsheet,
  'file-text': FileText,
  fingerprint: Fingerprint,
  flag: Flag,
  folder: Folder,
  gavel: Gavel,
  gift: Gift,
  globe: Globe,
  'graduation-cap': GraduationCap,
  'hand-coins': HandCoins,
  'hand-helping': HandHelping,
  handshake: Handshake,
  headset: Headset,
  'heart-handshake': HeartHandshake,
  'heart-pulse': HeartPulse,
  hospital: Hospital,
  hotel: Hotel,
  hourglass: Hourglass,
  house: House,
  'id-card': IdCard,
  inbox: Inbox,
  info: Info,
  'key-round': KeyRound,
  landmark: Landmark,
  laptop: Laptop,
  'list-checks': ListChecks,
  'log-in': LogIn,
  'log-out': LogOut,
  luggage: Luggage,
  mail: Mail,
  'map-pin': MapPin,
  megaphone: Megaphone,
  'message-square': MessageSquare,
  network: Network,
  package: Package,
  percent: Percent,
  phone: Phone,
  'piggy-bank': PiggyBank,
  pill: Pill,
  plane: Plane,
  'plane-takeoff': PlaneTakeoff,
  printer: Printer,
  receipt: Receipt,
  repeat: Repeat,
  rocket: Rocket,
  route: Route,
  scale: Scale,
  settings: Settings,
  shield: Shield,
  'shield-check': ShieldCheck,
  'shield-plus': ShieldPlus,
  signature: Signature,
  smartphone: Smartphone,
  sparkles: Sparkles,
  stamp: Stamp,
  star: Star,
  stethoscope: Stethoscope,
  syringe: Syringe,
  target: Target,
  ticket: Ticket,
  timer: Timer,
  'tree-palm': TreePalm,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  trophy: Trophy,
  truck: Truck,
  umbrella: Umbrella,
  user: User,
  'user-check': UserCheck,
  'user-cog': UserCog,
  'user-minus': UserMinus,
  'user-pen': UserPen,
  'user-plus': UserPlus,
  users: Users,
  'user-x': UserX,
  utensils: Utensils,
  wallet: Wallet,
  workflow: Workflow,
  wrench: Wrench,
};

export const ICON_NAMES = Object.keys(ICON_REGISTRY);

/** Resolves a stored icon name (kebab-case; PascalCase also accepted) to a component. */
export function resolveIcon(name: string | null | undefined): LucideIcon | undefined {
  if (!name) return undefined;
  const key = name.includes('-') || name === name.toLowerCase() ? name : name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return ICON_REGISTRY[key];
}

/** Renders an icon by stored name with a fallback (default: file-text). */
export function DynamicIcon({ name, fallback = FileText, ...props }: LucideProps & { name: string | null | undefined; fallback?: LucideIcon }) {
  return createElement(resolveIcon(name) ?? fallback, { 'aria-hidden': true, ...props });
}

export type IconPickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Allow clearing to "no icon" (default true). */
  clearable?: boolean;
};

/** Searchable grid of the curated icon set; stores the kebab-case name. */
export function IconPicker({ value, onChange, disabled, id, className, clearable = true }: IconPickerProps) {
  const t = useTranslations('common.iconPicker');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES;
  }, [query]);
  const current = resolveIcon(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('h-9 w-full justify-between gap-2 border-input px-3 font-normal active:scale-100 dark:bg-input/20', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {current ? (
              <span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-primary">
                {createElement(current, { className: 'size-4' })}
              </span>
            ) : null}
            <span className={cn('truncate', !current && 'text-faint-foreground')} dir="ltr">
              {current ? value : t('placeholder')}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-8"
            dir="ltr"
          />
        </div>
        <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto p-2">
          {clearable ? (
            <SimpleTooltip content={t('none')}>
              <button
                type="button"
                aria-label={t('none')}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex size-8 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-accent"
              >
                <XIcon className="size-3.5" />
              </button>
            </SimpleTooltip>
          ) : null}
          {filtered.map((name) => {
            const active = value === name;
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={active}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  active && 'bg-primary-soft text-primary ring-1 ring-primary/30',
                )}
              >
                {createElement(ICON_REGISTRY[name]!, { className: 'size-4' })}
              </button>
            );
          })}
          {!filtered.length ? <p className="col-span-8 py-4 text-center text-meta text-muted-foreground">{t('empty')}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
