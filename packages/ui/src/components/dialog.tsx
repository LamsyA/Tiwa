'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.js';
import { Button } from './button.js';
import { Input } from './input.js';

export interface ResponsiveDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet below `md` (drag the handle down to close), centred
 * dialog on `md+`. Drag uses pointer events so mouse works too.
 */
export function ResponsiveDialog({
  trigger,
  title,
  description,
  children,
  footer,
  className,
  ...rest
}: ResponsiveDialogProps) {
  const [dragY, setDragY] = React.useState<number | undefined>(undefined);
  const startY = React.useRef<number | undefined>(undefined);
  const [open, setOpen] = React.useState(rest.defaultOpen ?? false);
  const controlled = rest.open !== undefined ? rest.open : open;

  function handleOpenChange(next: boolean) {
    setDragY(undefined);
    if (rest.open === undefined) setOpen(next);
    rest.onOpenChange?.(next);
  }

  return (
    <DialogPrimitive.Root {...rest} open={controlled} onOpenChange={handleOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          style={dragY !== undefined ? { transform: `translate(-50%, ${dragY}px)` } : undefined}
          className={cn(
            'bg-bg fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border-t shadow-2',
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border',
            className,
          )}
        >
          <div
            className="flex shrink-0 cursor-grab touch-none justify-center pt-3 active:cursor-grabbing md:hidden"
            onPointerDown={(event) => {
              startY.current = event.clientY;
              (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (startY.current === undefined) return;
              setDragY(Math.max(0, event.clientY - startY.current));
            }}
            onPointerUp={() => {
              if ((dragY ?? 0) > 100) handleOpenChange(false);
              else setDragY(undefined);
              startY.current = undefined;
            }}
          >
            <span aria-hidden className="bg-border h-1.5 w-12 rounded-full" />
          </div>
          <div className="flex items-start justify-between gap-4 px-4 pt-3 md:px-6 md:pt-6">
            <div>
              <DialogPrimitive.Title className="font-display text-xl font-bold">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-muted mt-1 text-base">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="text-muted hover:text-text -m-1 rounded-full p-2 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-4 py-4 md:px-6">{children}</div>
          {footer && <div className="border-border flex shrink-0 gap-2 border-t p-4 md:px-6">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel = 'Confirm',
  requireText,
  onConfirm,
  destructive = false,
}: {
  trigger: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  /** When set, the user must type this exact text to enable confirm. */
  requireText?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState('');
  const matches = requireText === undefined || typed === requireText;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped('');
      }}
      trigger={trigger}
      title={title}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            fullWidth
            disabled={!matches}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-base">{body}</div>
      {requireText !== undefined && (
        <div className="mt-4">
          <label htmlFor="confirm-text" className="mb-1 block text-sm font-medium">
            Type <strong>{requireText}</strong> to confirm
          </label>
          <Input
            id="confirm-text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </div>
      )}
    </ResponsiveDialog>
  );
}
