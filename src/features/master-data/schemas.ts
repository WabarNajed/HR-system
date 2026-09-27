import { z } from 'zod';
import { MASTER_ENTITIES } from './config';

/** Master data schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const text = (max: number) => z.string().trim().max(max, `validation.maxLength|{"max":${max}}`);

export const CODE_PATTERN = /^[A-Za-z0-9؀-ۿ][A-Za-z0-9؀-ۿ._\-/]*$/;

export const masterDataFormSchema = z
  .object({
    code: text(30).refine((v) => v === '' || CODE_PATTERN.test(v), 'validation.codeFormat'),
    nameAr: text(150),
    nameEn: text(150),
    descriptionAr: text(500),
    descriptionEn: text(500),
    city: text(100),
    country: text(100),
    parentId: z.guid().nullable(),
    headEmployeeId: z.guid().nullable(),
    isActive: z.boolean(),
  })
  .refine((v) => Boolean(v.nameAr || v.nameEn), { path: ['nameAr'], message: 'validation.atLeastOneName' });

export type MasterDataFormValues = z.infer<typeof masterDataFormSchema>;

export const saveMasterDataSchema = z.object({
  entity: z.enum(MASTER_ENTITIES),
  id: z.guid().nullable(),
  values: masterDataFormSchema,
});
export type SaveMasterDataInput = z.infer<typeof saveMasterDataSchema>;

export const masterDataIdSchema = z.object({
  entity: z.enum(MASTER_ENTITIES),
  id: z.guid(),
});

export const setActiveSchema = z.object({
  entity: z.enum(MASTER_ENTITIES),
  ids: z.array(z.guid()).min(1).max(500),
  active: z.boolean(),
});

export const employeeSearchSchema = z.object({
  query: z.string().trim().max(100),
});

export const EMPTY_MASTER_DATA_FORM: MasterDataFormValues = {
  code: '',
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  descriptionEn: '',
  city: '',
  country: '',
  parentId: null,
  headEmployeeId: null,
  isActive: true,
};
