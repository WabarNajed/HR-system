'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import { createContext, useContext, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type TabsVariant = 'default' | 'line';
const TabsVariantContext = createContext<TabsVariant>('default');

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-3', className)} {...props} />;
}

/**
 * `variant="default"`: segmented pill tabs (in-card switches).
 * `variant="line"`: underline tabs for page-level navigation.
 */
function TabsList({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          variant === 'default' &&
            'inline-flex h-9 w-fit items-center justify-center gap-0.5 rounded-md bg-muted p-[3px] text-muted-foreground',
          variant === 'line' &&
            'scrollbar-none flex h-10 w-full items-stretch justify-start gap-1 overflow-x-auto border-b border-border text-muted-foreground',
          className,
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === 'default' &&
          'h-full flex-1 rounded-[6px] px-3 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs dark:data-[state=active]:bg-accent',
        variant === 'line' &&
          'relative -mb-px h-full rounded-none border-b-2 border-transparent px-2.5 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
