'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import * as React from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, 'title' | 'tone'>> {
  id: number;
  description?: string | undefined;
  durationMs: number;
}

const ToastContext = React.createContext<((toast: ToastInput) => void) | undefined>(undefined);

/** Push a toast. Must be used under `ToastProvider` (mounted once at app root). */
export function useToast(): (toast: ToastInput) => void {
  const push = React.useContext(ToastContext);
  if (!push) throw new Error('useToast must be used under <ToastProvider>');
  return push;
}

const icons: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="text-success size-5" aria-hidden />,
  error: <TriangleAlert className="text-danger size-5" aria-hidden />,
  info: <Info className="text-focus size-5" aria-hidden />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const id = React.useRef(0);

  const push = React.useCallback((input: ToastInput) => {
    id.current += 1;
    const record: ToastRecord = {
      id: id.current,
      title: input.title,
      description: input.description,
      tone: input.tone ?? 'info',
      durationMs: input.durationMs ?? 4000,
    };
    setToasts((current) => [...current.slice(-2), record]);
  }, []);

  function dismiss(toastId: number) {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastPrimitive.Provider swipeDirection="down">
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            duration={toast.durationMs}
            onOpenChange={(isOpen) => {
              if (!isOpen) dismiss(toast.id);
            }}
            className="border-border bg-surface text-text grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg border p-4 shadow-2"
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            {icons[toast.tone]}
            <div>
              <ToastPrimitive.Title className="font-medium">{toast.title}</ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="text-muted mt-0.5 text-sm">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed inset-x-0 bottom-0 z-[100] mx-auto flex w-full max-w-md flex-col gap-2 p-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
