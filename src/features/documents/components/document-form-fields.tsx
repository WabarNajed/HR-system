'use client';

import { useTranslations } from 'next-intl';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { z } from 'zod';
import { DatePicker } from '@/components/shared/date-picker';
import { FormFullRow, FormGrid } from '@/components/shared/form-section';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DOCUMENT_TYPES, EXPIRING_TYPES, type DocumentType } from '../constants';
import { useDocumentTypeLabel } from './labels';

/** Client-side metadata form (mirrors `documentMetadataSchema` on the server). */
export const documentFormSchema = z
  .object({
    documentType: z.string().min(1, 'validation.required'),
    documentNumber: z.string().trim().max(100, 'validation.maxLength|{"max":100}'),
    issueDate: z.string().nullable(),
    expiryDate: z.string().nullable(),
    isConfidential: z.boolean(),
    notes: z.string().trim().max(1000, 'validation.maxLength|{"max":1000}'),
  })
  .superRefine((value, ctx) => {
    if (value.issueDate && value.expiryDate && value.expiryDate < value.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['expiryDate'], message: 'documents.validation.expiryBeforeIssue' });
    }
  });

export type DocumentFormValues = z.infer<typeof documentFormSchema>;

export function toMetadataPayload(values: DocumentFormValues) {
  return {
    documentType: values.documentType as DocumentType,
    documentNumber: values.documentNumber.trim() || null,
    issueDate: values.issueDate || null,
    expiryDate: values.expiryDate || null,
    // medical reports are always confidential (also enforced by the database)
    isConfidential: values.documentType === 'medical_report' || values.isConfidential,
    notes: values.notes.trim() || null,
  };
}

type Props<T extends FieldValues> = {
  control: Control<T>;
  /** HR may mark documents confidential; employees cannot. */
  showConfidential: boolean;
  disabled?: boolean;
  documentType?: string;
};

/** Document type · number · issue/expiry dates · confidential · notes. */
export function DocumentFormFields<T extends FieldValues>({ control, showConfidential, disabled, documentType }: Props<T>) {
  const t = useTranslations('documents');
  const typeLabel = useDocumentTypeLabel();
  const expiring = documentType ? EXPIRING_TYPES.includes(documentType as DocumentType) : false;
  const name = (n: keyof DocumentFormValues) => n as unknown as Path<T>;

  return (
    <FormGrid columns={2}>
      <FormField
        control={control}
        name={name('documentType')}
        render={({ field }) => (
          <FormItem>
            <FormLabel required>{t('fields.documentType')}</FormLabel>
            <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('placeholders.selectType')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {typeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={name('documentNumber')}
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>{t('fields.documentNumber')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} dir="ltr" className="text-start" autoComplete="off" disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={name('issueDate')}
        render={({ field }) => (
          <FormItem>
            <FormLabel optional>{t('fields.issueDate')}</FormLabel>
            <FormControl>
              <DatePicker value={field.value} onChange={field.onChange} disabled={disabled} captionLayout="dropdown" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={name('expiryDate')}
        render={({ field }) => (
          <FormItem>
            <FormLabel optional={!expiring}>{t('fields.expiryDate')}</FormLabel>
            <FormControl>
              <DatePicker value={field.value} onChange={field.onChange} disabled={disabled} captionLayout="dropdown" />
            </FormControl>
            {expiring ? <FormDescription>{t('upload.expiryHint')}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        )}
      />
      <FormFullRow>
        <FormField
          control={control}
          name={name('notes')}
          render={({ field }) => (
            <FormItem>
              <FormLabel optional>{t('fields.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} rows={2} placeholder={t('placeholders.notes')} disabled={disabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormFullRow>
      {showConfidential ? (
        <FormFullRow>
          <FormField
            control={control}
            name={name('isConfidential')}
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-4 rounded-lg border border-border bg-subtle px-3.5 py-3">
                <div className="flex flex-col gap-0.5">
                  <FormLabel className="text-sm">{t('fields.confidential')}</FormLabel>
                  <FormDescription>{t('upload.confidentialHint')}</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={documentType === 'medical_report' ? true : Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    disabled={disabled || documentType === 'medical_report'}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </FormFullRow>
      ) : null}
    </FormGrid>
  );
}
