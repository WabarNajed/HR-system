'use client';

import {
  CalendarDaysIcon,
  ClipboardListIcon,
  FileTextIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { GallerySection, useDevLabel } from './dev-label';

export function OverlaysSection() {
  const t = useTranslations();
  const L = useDevLabel();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState('system');

  return (
    <GallerySection id="overlays" title={L('النوافذ والقوائم', 'Overlays & menus')}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-5 shadow-card">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{L('نافذة حوار', 'Dialog')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.return')}</DialogTitle>
              <DialogDescription>{t('statuses.request.returned')}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-2">
              <Label htmlFor="dlg-reason">{t('common.reason')}</Label>
              <Textarea id="dlg-reason" rows={4} />
            </DialogBody>
            <DialogFooter>
              <Button variant="outline">{t('common.cancel')}</Button>
              <Button onClick={() => toast.success(t('common.saved'))}>{t('common.submit')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Trash2Icon />
              {L('تأكيد خطِر', 'Danger confirm')}
            </Button>
          }
          variant="danger"
          title={t('common.confirmDeleteTitle')}
          description={t('common.confirmDeleteDescription')}
          confirmLabel={t('common.delete')}
          confirmationPhrase="RESET ORGANIZATION"
          onConfirm={async () => {
            await new Promise((r) => setTimeout(r, 900));
            toast.success(t('common.saved'));
          }}
        />

        <ConfirmDialog
          trigger={<Button variant="outline">{t('common.approve')}</Button>}
          title={t('common.confirmActionTitle')}
          description={t('statuses.request.approved')}
          confirmLabel={t('common.approve')}
          onConfirm={() => {
            toast.success(t('statuses.request.approved'));
          }}
        />

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{L('لوحة جانبية (البداية)', 'Sheet (start)')}</Button>
          </SheetTrigger>
          <SheetContent side="start">
            <SheetHeader>
              <SheetTitle>{t('nav.title')}</SheetTitle>
              <SheetDescription>{t('nav.header.mainNavigation')}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-1">
              {(['dashboard', 'employees', 'requests', 'approvals', 'leave'] as const).map((k) => (
                <div key={k} className="rounded-md px-3 py-2 text-sm hover:bg-accent">
                  {t(`nav.items.${k}`)}
                </div>
              ))}
            </SheetBody>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{L('لوحة جانبية (النهاية)', 'Sheet (end)')}</Button>
          </SheetTrigger>
          <SheetContent side="end">
            <SheetHeader>
              <SheetTitle>{t('common.details')}</SheetTitle>
              <SheetDescription>{t('employees.description')}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('common.nameAr')}</Label>
                <Input defaultValue="نورة القحطاني" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.email')}</Label>
                <Input dir="ltr" defaultValue="noura@example.com" />
              </div>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline">{t('common.cancel')}</Button>
              <Button>{t('common.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">{L('درج سفلي', 'Drawer')}</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t('common.filters')}</DrawerTitle>
              <DrawerDescription>{t('common.table.moreFiltersDescription')}</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 py-2 text-sm text-muted-foreground">{t('common.table.exportHint')}</div>
            <DrawerFooter>
              <Button>{t('common.apply')}</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">{L('نافذة منبثقة', 'Popover')}</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="space-y-3">
            <p className="text-sm font-medium">{t('common.filters')}</p>
            <Input placeholder={t('common.searchPlaceholder')} />
            <Button size="sm" className="w-full">
              {t('common.apply')}
            </Button>
          </PopoverContent>
        </Popover>

        <SimpleTooltip content={t('nav.header.searchPlaceholder')}>
          <Button variant="outline">{L('تلميح', 'Tooltip')}</Button>
        </SimpleTooltip>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Button variant="link"><bdi>@noura</bdi></Button>
          </HoverCardTrigger>
          <HoverCardContent className="flex gap-3">
            <EmployeeAvatar name="نورة القحطاني" size="lg" />
            <div>
              <p className="font-semibold">نورة القحطاني</p>
              <p className="text-meta text-muted-foreground">{L('أخصائي موارد بشرية', 'HR Specialist')}</p>
            </div>
          </HoverCardContent>
        </HoverCard>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {t('common.actions')}
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t('nav.header.account')}</DropdownMenuLabel>
            <DropdownMenuItem>
              <UserIcon />
              {t('nav.header.myProfile')}
              <DropdownMenuShortcut>⇧P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <SettingsIcon />
              {t('nav.items.settings')}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('common.theme')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">{t('common.lightMode')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">{t('common.darkMode')}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">{t('common.systemMode')}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOutIcon />
              {t('nav.header.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" onClick={() => setPaletteOpen(true)} className="gap-3 text-muted-foreground">
          <SearchIcon />
          {t('nav.header.search')}
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title={t('nav.header.search')}>
          <CommandInput placeholder={t('nav.header.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('common.noResults')}</CommandEmpty>
            <CommandGroup heading={t('nav.title')}>
              <CommandItem>
                <UsersIcon />
                {t('nav.items.employees')}
              </CommandItem>
              <CommandItem>
                <ClipboardListIcon />
                {t('nav.items.requests')}
                <CommandShortcut>G R</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <CalendarDaysIcon />
                {t('nav.items.leave')}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t('nav.settings.title')}>
              <CommandItem>
                <FileTextIcon />
                {t('nav.settings.items.certificateTemplates')}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </GallerySection>
  );
}
