'use client';

import { magicLinkClient } from 'better-auth/client/plugins';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [phoneNumberClient(), magicLinkClient()],
});

export const { useSession, signIn, signOut } = authClient;
