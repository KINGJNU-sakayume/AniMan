import { useEffect, useState } from 'react';

export const useAccentColor = (color: string) => {
  const [cssVariable, setCssVariable] = useState('');

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', color);
    setCssVariable(`var(--accent-color)`);
  }, [color]);

  return cssVariable || color;
};
