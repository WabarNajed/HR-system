/**
 * Nationality is free text (imports keep the source value). The two canonical workbook values —
 * Saudi / Non-Saudi, in either language — are shown with the translated label; anything else
 * (e.g. a specific country) is shown as recorded.
 */
export function nationalityKey(value: string | null | undefined): 'saudi' | 'nonSaudi' | null {
  const v = (value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!v) return null;
  if (/^(non saudi|not saudi|غير سعودي(ة)?)$/.test(v)) return 'nonSaudi';
  if (/^(saudi|saudi arabian|ksa|سعودي(ة)?)$/.test(v)) return 'saudi';
  return null;
}

