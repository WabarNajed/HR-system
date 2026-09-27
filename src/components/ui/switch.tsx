'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Switch({ className, size = 'md', ...props }: ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'sm' | 'md' }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent px-0.5 shadow-xs transition-colors outline-none',
        'data-[size=md]:h-5 data-[size=md]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong dark:data-[state=unchecked]:bg-input',
        'focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // margin-inline-start travel is logical, so the thumb moves the right way in RTL.
          'pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-[margin] duration-150 ease-out',
          'group-data-[size=md]/switch:size-4 group-data-[size=sm]/switch:size-3',
          'data-[state=unchecked]:ms-0 group-data-[size=md]/switch:data-[state=checked]:ms-3.5 group-data-[size=sm]/switch:data-[state=checked]:ms-2.5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
