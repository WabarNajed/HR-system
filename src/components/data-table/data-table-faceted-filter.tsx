'use client';

import { CheckIcon, PlusCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { SelectFilterDef } from './types';

export type DataTableFacetedFilterProps = {
  def: SelectFilterDef<never> | SelectFilterDef<unknown>;
  value: string[];
  onChange: (value: string[]) => void;
};

/** Toolbar filter button with a searchable option list (single or multi select, optional counts). */
export function DataTableFacetedFilter({ def, value, onChange }: DataTableFacetedFilterProps) {
  const t = useTranslations('common');
  const multiple = def.multiple ?? true;
  const selected = new Set(value);
  const Icon = def.icon ?? PlusCircleIcon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('border-dashed active:scale-100', selected.size > 0 && 'border-solid border-primary/35 bg-primary-soft/40')}
        >
          <Icon className="text-muted-foreground" />
          {def.title}
          {selected.size > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 !h-4" />
              <Badge variant="default" size="sm" className="rounded-sm px-1 font-normal lg:hidden">
                {selected.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selected.size > 2 ? (
                  <Badge variant="default" size="sm" className="rounded-sm px-1.5 font-normal">
                    {t('table.selectedFilters', { count: selected.size })}
                  </Badge>
                ) : (
                  def.options
                    .filter((o) => selected.has(o.value))
                    .map((o) => (
                      <Badge key={o.value} variant="default" size="sm" className="max-w-28 rounded-sm px-1.5 font-normal">
                        <span className="truncate">{o.label}</span>
                      </Badge>
                    ))
                )}
              </div>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          {def.options.length > 7 ? <CommandInput placeholder={def.title} /> : null}
          <CommandList>
            <CommandEmpty>{t('table.noFilterOptions')}</CommandEmpty>
            <CommandGroup>
              {def.options.map((option) => {
                const isSelected = selected.has(option.value);
                const OptIcon = option.icon;
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    onSelect={() => {
                      if (multiple) {
                        const next = new Set(selected);
                        if (isSelected) next.delete(option.value);
                        else next.add(option.value);
                        onChange(Array.from(next));
                      } else {
                        onChange(isSelected ? [] : [option.value]);
                      }
                    }}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center border',
                        multiple ? 'rounded-xs' : 'rounded-full',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                      )}
                    >
                      {isSelected ? <CheckIcon className="size-3 !text-primary-foreground" strokeWidth={3} /> : null}
                    </span>
                    {OptIcon ? <OptIcon className="size-4" /> : null}
                    <span className="truncate">{option.label}</span>
                    {typeof option.count === 'number' ? (
                      <span className="ms-auto text-xs text-muted-foreground numeric">{option.count}</span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    {t('clearFilters')}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
