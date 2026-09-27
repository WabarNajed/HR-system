'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AtSignIcon, BriefcaseIcon, IdCardIcon, PhoneIcon, UserIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ColorPicker } from '@/components/shared/color-picker';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { DatePicker, DateRangePicker, type IsoDateRange } from '@/components/shared/date-picker';
import { FileDropzone } from '@/components/shared/file-dropzone';
import { FormFullRow, FormGrid, FormSection } from '@/components/shared/form-section';
import { IconPicker } from '@/components/shared/icon-picker';
import { StickyFormFooter } from '@/components/shared/sticky-form-footer';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputAddon, InputGroup } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { GallerySection, useDevLabel } from './dev-label';
import { SAMPLE_DEPARTMENTS, SAMPLE_EMPLOYEES } from './sample-data';

const schema = z.object({
  nameAr: z.string().min(1, 'validation.required'),
  nameEn: z.string().optional(),
  email: z.email('validation.email').or(z.literal('')),
  mobile: z.string().regex(/^05\d{8}$/, 'validation.phone'),
  employmentType: z.string().min(1, 'validation.selectOne'),
  joiningDate: z.string().nullable().refine((v) => !!v, 'validation.required'),
  notes: z.string().max(500, 'validation.maxLength|{"max":500}').optional(),
});

type Values = z.infer<typeof schema>;

export function FormsSection() {
  const t = useTranslations();
  const L = useDevLabel();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { nameAr: '', nameEn: '', email: '', mobile: '', employmentType: '', joiningDate: null, notes: '' },
  });

  const [dept, setDept] = useState<string | null>('hr');
  const [managers, setManagers] = useState<string[]>([]);
  const [range, setRange] = useState<IsoDateRange | null>({ from: '2026-09-01', to: '2026-09-27' });
  const [color, setColor] = useState<string | null>('#0f5e6b');
  const [icon, setIcon] = useState<string | null>('calendar-days');
  const [files, setFiles] = useState<File[]>([]);
  const [slider, setSlider] = useState([30]);

  const deptOptions: ComboboxOption[] = SAMPLE_DEPARTMENTS.map((d) => ({ value: d.id, label: locale === 'ar' ? d.name_ar : d.name_en }));
  const managerOptions: ComboboxOption[] = SAMPLE_EMPLOYEES.slice(0, 8).map((e) => ({
    value: e.id,
    label: locale === 'ar' ? e.name_ar : e.name_en || e.name_ar,
    description: e.employee_number,
    keywords: [e.name_ar, e.name_en],
  }));

  const onSubmit = (values: Values) =>
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 900));
      toast.success(t('common.saved'), { description: values.nameAr });
      form.reset(values);
    });

  return (
    <GallerySection id="forms" title={L('النماذج', 'Forms')} description={L('react-hook-form + zod مع رسائل تحقق مترجمة', 'react-hook-form + zod with translated validation messages')}>
      <Form {...form}>
        <form id="dev-form" onSubmit={form.handleSubmit(onSubmit)} className="mx-auto flex w-full max-w-form flex-col gap-5">
          <FormSection title={L('بيانات الهوية', 'Identity')} description={L('الاسم وبيانات التواصل الأساسية', 'Name and primary contact details')} icon={<UserIcon />}>
            <FormGrid>
              <FormField
                control={form.control}
                name="nameAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('common.nameAr')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="rtl" />
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
                    <FormLabel optional>{t('common.nameEn')}</FormLabel>
                    <FormControl>
                      <Input {...field} dir="ltr" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.email')}</FormLabel>
                    <FormControl>
                      <InputGroup start={<AtSignIcon />} dir="ltr" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('common.mobile')}</FormLabel>
                    <FormControl>
                      <InputGroup start={<PhoneIcon />} dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" {...field} />
                    </FormControl>
                    <FormDescription>{t('validation.phone')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormGrid>
          </FormSection>

          <FormSection title={L('بيانات التوظيف', 'Employment')} icon={<BriefcaseIcon />}>
            <FormGrid>
              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{L('نوع التوظيف', 'Employment type')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('common.selectPlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(['full_time', 'part_time', 'contract', 'temporary', 'intern'] as const).map((k) => (
                          <SelectItem key={k} value={k}>
                            {t(`enums.employmentType.${k}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joiningDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{L('تاريخ الالتحاق', 'Joining date')}</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-1.5">
                <Label>{t('common.department')}</Label>
                <Combobox options={deptOptions} value={dept} onChange={(v) => setDept(v)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('common.manager')}</Label>
                <Combobox multiple options={managerOptions} value={managers} onChange={(v) => setManagers(v)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('common.dateRange')}</Label>
                <DateRangePicker value={range} onChange={setRange} />
              </div>
              <div className="grid gap-1.5">
                <Label>{L('الراتب الأساسي', 'Basic salary')}</Label>
                <div className="flex gap-2">
                  <Input dir="ltr" inputMode="decimal" defaultValue="12,500.00" className="numeric" />
                  <InputAddon>{t('common.sar')}</InputAddon>
                </div>
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="col-span-full">
                    <FormLabel optional>{t('common.notes')}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormGrid>
          </FormSection>

          <FormSection title={L('عناصر اختيار أخرى', 'Other controls')} icon={<IdCardIcon />} layout="card">
            <FormGrid>
              <div className="grid gap-3">
                <Label>{t('enums.title')}</Label>
                <RadioGroup defaultValue="iqama" className="flex gap-5">
                  {(['iqama', 'national_id'] as const).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <RadioGroupItem value={k} id={`id-${k}`} />
                      <Label htmlFor={`id-${k}`} className="font-normal">
                        {t(`enums.idType.${k}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <div className="flex items-center gap-2">
                  <Checkbox id="chk-1" defaultChecked />
                  <Label htmlFor="chk-1" className="font-normal">
                    {t('nav.settings.items.notifications')}
                  </Label>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{t('enums.notificationChannel.email')}</p>
                    <p className="text-xs text-muted-foreground">{t('nav.settings.descriptions.notifications')}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="grid gap-2">
                  <Label>{L('نسبة', 'Percentage')} · {slider[0]}%</Label>
                  <Slider value={slider} onValueChange={setSlider} max={100} step={5} />
                </div>
              </div>
              <div className="grid content-start gap-4">
                <div className="grid gap-1.5">
                  <Label>{t('common.colorPicker.label')}</Label>
                  <ColorPicker value={color} onChange={setColor} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t('common.iconPicker.placeholder')}</Label>
                  <IconPicker value={icon} onChange={setIcon} />
                </div>
              </div>
              <FormFullRow>
                <FileDropzone multiple accept={['.pdf', '.jpg', '.png']} maxSize={5 * 1024 * 1024} value={files} onChange={setFiles} />
              </FormFullRow>
            </FormGrid>
          </FormSection>

          <StickyFormFooter dirty={form.formState.isDirty} pending={pending} formId="dev-form" onCancel={() => form.reset()} className="md:mx-0 md:rounded-lg md:border" />
        </form>
      </Form>
    </GallerySection>
  );
}
