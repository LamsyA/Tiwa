'use client';

import { magicLinkClient } from 'better-auth/client/plugins';
import { phoneNumberClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [usernameClient(), phoneNumberClient(), magicLinkClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
