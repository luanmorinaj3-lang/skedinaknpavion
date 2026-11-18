import { Shield } from 'lucide-react';
import { useState } from 'react';

interface TeamLogoProps {
  src: string | null | undefined;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TeamLogo({ src, alt, size = 'sm' }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'lg' ? 'w-10 h-10' : size === 'md' ? 'w-7 h-7' : 'w-5 h-5';
  const iconDims =
    size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  if (!src || failed) {
    return (
      <span
        className={`${dims} shrink-0 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500`}
        aria-hidden="true"
      >
        <Shield className={iconDims} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} shrink-0 object-contain rounded-sm`}
      loading="lazy"
    />
  );
}
