// src/components/Spinner.tsx
interface SpinnerProps {
  color?: string;
  size?: 'sm' | 'md';
  label?: string;
}

export const Spinner = ({ color = 'var(--accent)', size = 'md', label = '불러오는 중' }: SpinnerProps) => (
  <div
    role="status"
    aria-label={label}
    className={`${size === 'sm' ? 'w-6 h-6 border-[3px]' : 'w-9 h-9 border-4'} border-zinc-800 rounded-full animate-spin`}
    style={{ borderTopColor: color }}
  />
);

export const FullScreenSpinner = () => (
  <div className="min-h-dvh bg-zinc-950 flex items-center justify-center">
    <Spinner />
  </div>
);
