'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useActionFeedback } from '@/features/users/components/use-action-feedback';
import { localized } from '@/lib/i18n/localized';
import { createRoleAction, updateRoleAction } from '../actions';
import type { RoleWithPermissions } from '../queries';
import { roleDetailsSchema } from '../schemas';

type FormValues = {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  dataScope: 'own' | 'team' | 'organization';
  copyFromRoleId: string;
};

const NONE = '__none__';

/** Create a custom role (optionally copying another role's permissions) or edit a role's details. */
export function RoleDialog({
  mode,
  role,
  roles,
  isSuperAdmin,
  onOpenChange,
  onCreated,
}: {
  mode: 'create' | 'edit' | null;
  role: RoleWithPermissions | null;
  roles: RoleWithPermissions[];
  isSuperAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: string) => void;
}) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(roleDetailsSchema) as never,
    defaultValues: { nameAr: '', nameEn: '', descriptionAr: '', descriptionEn: '', dataScope: 'own', copyFromRoleId: NONE },
  });

  useEffect(() => {
    if (!mode) return;
    form.reset(
      mode === 'edit' && role
        ? {
            nameAr: role.nameAr,
            nameEn: role.nameEn,
            descriptionAr: role.descriptionAr ?? '',
            descriptionEn: role.descriptionEn ?? '',
            dataScope: role.dataScope,
            copyFromRoleId: NONE,
          }
        : { nameAr: '', nameEn: '', descriptionAr: '', descriptionEn: '', dataScope: 'own', copyFromRoleId: NONE },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog opens
  }, [mode, role?.id]);

  const onSubmit = (values: FormValues) =>
    startTransition(async () => {
      const details = {
        nameAr: values.nameAr,
        nameEn: values.nameEn,
        descriptionAr: values.descriptionAr,
        descriptionEn: values.descriptionEn,
        dataScope: values.dataScope,
      };
      if (mode === 'edit' && role) {
        const result = await run(updateRoleAction({ ...details, roleId: role.id }));
        if (result.ok) onOpenChange(false);
        return;
      }
      const result = await run(createRoleAction({ ...details, copyFromRoleId: values.copyFromRoleId === NONE ? null : values.copyFromRoleId }), { refresh: false });
      if (result.ok) {
        onOpenChange(false);
        if (result.data?.key) onCreated(result.data.key);
      } else {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          if (field === 'nameAr' || field === 'nameEn') form.setError(field, { message: key });
        }
      }
    });

  const scopeLocked = mode === 'edit' && !isSuperAdmin;

  return (
    <Dialog open={Boolean(mode)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? t('edit.title') : t('create.title')}</DialogTitle>
          <DialogDescription>{mode === 'edit' ? t('edit.description') : t('create.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col" aria-busy={pending}>
            <DialogBody className="grid gap-4 pb-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nameAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tc('nameAr')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="rtl" disabled={pending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nameEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tc('nameEn')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" disabled={pending} />
                    </FormControl>
                    {mode === 'create' ? <FormDescription>{t('create.keyHint')}</FormDescription> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="descriptionAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel optional>{tc('descriptionAr')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} dir="rtl" rows={2} disabled={pending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="descriptionEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel optional>{tc('descriptionEn')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} dir="ltr" rows={2} disabled={pending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dataScope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.dataScope')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={pending || scopeLocked}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(['own', 'team', 'organization'] as const).map((s) => (
                          <SelectItem key={s} value={s} disabled={s === 'organization' && !isSuperAdmin}>
                            {t(`scope.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{scopeLocked ? t('fields.dataScopeLocked') : t(`scopeHelp.${field.value}`)}</FormDescription>
                  </FormItem>
                )}
              />
              {mode === 'create' ? (
                <FormField
                  control={form.control}
                  name="copyFromRoleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel optional>{t('create.copyFrom')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>{t('create.startEmpty')}</SelectItem>
                          {roles
                            .filter((r) => r.key !== 'super_admin')
                            .map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {localized({ name_ar: r.nameAr, name_en: r.nameEn }, 'name', locale)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('create.copyFromHint')}</FormDescription>
                    </FormItem>
                  )}
                />
              ) : null}
            </DialogBody>
            <DialogFooter className="mt-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={pending} className="min-w-28">
                {mode === 'edit' ? tc('saveChanges') : t('create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
