'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '../lib/cn.js';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...rest }, ref) {
  return (
    <LabelPrimitive.Root ref={ref} className={cn('mb-1 block text-sm font-medium text-text', className)} {...rest} />
  );
});
