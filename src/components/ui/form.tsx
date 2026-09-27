'use client';

import { Label as LabelPrimitive, Slot } from 'radix-ui';
import { createContext, useContext, useId, type ComponentProps } from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * react-hook-form integration (shadcn "form" pattern).
 *
 *   <Form {...form}>
 *     <form onSubmit={form.handleSubmit(onSubmit)}>
 *       <FormField control={form.control} name="email" render={({ field }) => (
 *         <FormItem>
 *           <FormLabel required>{t('email')}</FormLabel>
 *           <FormControl><Input {...field} /></FormControl>
 *           <FormDescription>…</FormDescription>
 *           <FormMessage />
 *         </FormItem>
 *       )} />
 *
 * FormMessage translates the error message when it is an i18n key (e.g. `validation.required`
 * or `validation.minLength|{"min":3}`), so zod schemas can carry keys instead of text.
 */
const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName };

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

type FormItemContextValue = { id: string };
const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) throw new Error('useFormField should be used within <FormField>');
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: ComponentProps<'div'>) {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn('grid min-w-0 content-start gap-1.5', className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  required,
  optional,
  children,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean; optional?: boolean }) {
  const { error, formItemId } = useFormField();
  const t = useTranslations('common');
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn('data-[error=true]:text-danger', className)}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden className="text-danger">
          *
        </span>
      ) : null}
      {optional ? <span className="font-normal text-faint-foreground">{t('optionalSuffix')}</span> : null}
    </Label>
  );
}

function FormControl(props: ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();
  return (
    <p data-slot="form-description" id={formDescriptionId} className={cn('text-xs text-muted-foreground', className)} {...props} />
  );
}

/**
 * Resolves an error message: i18n key (`namespace.key`), key with JSON params
 * (`validation.minLength|{"min":3}`), or plain text (returned as-is).
 */
export function useErrorMessage() {
  const t = useTranslations();
  return (message: string | undefined | null): string => {
    if (!message) return '';
    const [key, rawParams] = message.split('|');
    if (!key || !/^[a-zA-Z]+(\.[a-zA-Z0-9_]+)+$/.test(key)) return message;
    let params: Record<string, string | number> | undefined;
    if (rawParams) {
      try {
        params = JSON.parse(rawParams) as Record<string, string | number>;
      } catch {
        params = undefined;
      }
    }
    // Dynamic key: validated shape above; fall back to raw text when missing.
    const translate = t as unknown as { has: (k: string) => boolean; (k: string, p?: Record<string, string | number>): string };
    return translate.has(key) ? translate(key, params) : message;
  };
}

function FormMessage({ className, children, ...props }: ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const resolve = useErrorMessage();
  const body = error ? resolve(String(error?.message ?? '')) : children;
  if (!body) return null;
  return (
    <p data-slot="form-message" id={formMessageId} className={cn('text-xs font-medium text-danger', className)} {...props}>
      {body}
    </p>
  );
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };
