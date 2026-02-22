'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

type FadeInProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
};

export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}
