import { z } from 'zod';

export const saveNotificationSettingsSchema = z.object({
  rows: z
    .array(
      z.object({
        eventKey: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'validation.invalidValue'),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
});
