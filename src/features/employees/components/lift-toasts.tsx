/**
 * While mounted, bottom toasts float above a sticky form footer / sheet footer instead of covering
 * its Save button (the toaster sits at the logical bottom-end, exactly where the primary action is).
 * Custom properties declared `!important` win over the toaster's inline offsets.
 */
export function LiftToasts({ by = '5.5rem' }: { by?: string }) {
  return (
    <style>{`[data-sonner-toaster][data-y-position="bottom"]{--offset-bottom:${by} !important;--mobile-offset-bottom:${by} !important}`}</style>
  );
}
