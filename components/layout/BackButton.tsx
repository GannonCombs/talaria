import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  href?: string;
}

export default function BackButton({ href = '/' }: BackButtonProps) {
  return (
    <Link href={href} className="text-on-surface-variant hover:text-white">
      <ArrowLeft size={20} />
    </Link>
  );
}
