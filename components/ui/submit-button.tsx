'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from './button';
import { Spinner } from './spinner';

/** Bouton d'envoi de formulaire avec état de chargement (« Écriture… »). */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      name={name}
      value={value}
    >
      {pending ? (
        <>
          <Spinner />
          <span>{pendingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
