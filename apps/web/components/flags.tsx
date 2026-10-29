'use client';

import type { FlagName } from '@tiwa/config';
import * as React from 'react';

// Client side of P2-T10: the server resolves flags (getFlagsFor) and passes
// booleans down; components read them with useFlag. The UI only hides or
// shows — server commands still guard with requireFlag (Frontend.md §7.9).

const FlagsContext = React.createContext<Partial<Record<FlagName, boolean>>>({});

export function FlagsProvider({ flags, children }: { flags: Record<FlagName, boolean>; children: React.ReactNode }) {
  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}

/** Unknown or missing flags read as OFF. */
export function useFlag(name: FlagName): boolean {
  return React.useContext(FlagsContext)[name] === true;
}
