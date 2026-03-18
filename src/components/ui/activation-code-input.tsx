'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

type ActivationCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  'aria-label'?: string;
};

function normalizeDigits(value: string, length: number): string {
  return value.replace(/\D/g, '').slice(0, length);
}

function toSlots(value: string, length: number): string[] {
  const normalized = normalizeDigits(value, length);
  return Array.from({ length }, (_, index) => normalized[index] ?? '');
}

export function ActivationCodeInput({
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
  className,
  inputClassName,
  'aria-label': ariaLabel = 'Activation code',
}: ActivationCodeInputProps) {
  const [slots, setSlots] = useState<string[]>(() => toSlots(value, length));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const normalized = normalizeDigits(value, length);
    if (normalized !== slots.join('')) {
      setSlots(toSlots(normalized, length));
    }
  }, [length, slots, value]);

  const focusAt = (index: number) => {
    const bounded = Math.max(0, Math.min(length - 1, index));
    const input = refs.current[bounded];
    input?.focus();
    input?.select();
  };

  const emit = (nextSlots: string[]) => {
    setSlots(nextSlots);
    onChange(nextSlots.join(''));
  };

  const handleInputChange = (index: number, raw: string) => {
    if (disabled) return;

    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      const next = [...slots];
      next[index] = '';
      emit(next);
      return;
    }

    const next = [...slots];
    let cursor = index;

    for (const digit of digits) {
      if (cursor >= length) break;
      next[cursor] = digit;
      cursor += 1;
    }

    emit(next);
    focusAt(cursor < length ? cursor : length - 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'Backspace': {
        event.preventDefault();
        const next = [...slots];
        if (next[index]) {
          next[index] = '';
          emit(next);
          return;
        }

        if (index > 0) {
          next[index - 1] = '';
          emit(next);
          focusAt(index - 1);
        }
        return;
      }
      case 'Delete': {
        event.preventDefault();
        const next = [...slots];
        next[index] = '';
        emit(next);
        return;
      }
      case 'ArrowLeft':
        event.preventDefault();
        focusAt(index - 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        focusAt(index + 1);
        return;
      default:
        return;
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    const pasted = event.clipboardData.getData('text');
    const digits = pasted.replace(/\D/g, '');
    if (!digits) return;

    event.preventDefault();

    const next = [...slots];
    let cursor = index;
    for (const digit of digits) {
      if (cursor >= length) break;
      next[cursor] = digit;
      cursor += 1;
    }
    emit(next);
    focusAt(cursor < length ? cursor : length - 1);
  };

  return (
    <div className={cn('flex items-center gap-2 sm:gap-3', className)}>
      {slots.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          value={digit}
          onChange={(event) => handleInputChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-label={`${ariaLabel} digit ${index + 1}`}
          className={cn(
            'h-12 w-10 rounded-lg border border-input bg-transparent px-0 text-center font-mono text-xl font-semibold tracking-[0.16em] shadow-sm transition-all outline-none',
            'focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
            'sm:h-14 sm:w-12',
            inputClassName,
          )}
        />
      ))}
    </div>
  );
}
