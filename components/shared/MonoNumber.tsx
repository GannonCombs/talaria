interface MonoNumberProps {
  value: number;
  prefix?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  className?: string;
}

const formatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function MonoNumber({
  value,
  prefix = '$',
  minimumFractionDigits,
  maximumFractionDigits,
  className = '',
}: MonoNumberProps) {
  const formatted =
    minimumFractionDigits !== undefined || maximumFractionDigits !== undefined
      ? new Intl.NumberFormat('en-US', {
          minimumFractionDigits: minimumFractionDigits ?? 2,
          maximumFractionDigits: maximumFractionDigits ?? 2,
        }).format(value)
      : formatter.format(value);

  return (
    <span className={`font-mono ${className}`}>
      {prefix}
      {formatted}
    </span>
  );
}
