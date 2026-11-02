'use client';

import { Button } from '@tiwa/ui';
import { Check, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export function CopyLink({ url }: { url: string }) {
  const t = useTranslations('day.share');
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
