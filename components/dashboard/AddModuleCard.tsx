import { PlusCircle } from 'lucide-react';

export default function AddModuleCard() {
  return (
    <div className="h-[220px] bg-transparent border border-dashed border-outline flex flex-col items-center justify-center gap-3 group hover:border-on-surface-variant cursor-pointer">
      <PlusCircle
        size={32}
        className="text-on-surface-variant group-hover:text-on-surface"
      />
      <span className="section-header text-[10px] text-on-surface-variant group-hover:text-on-surface">
        Add Module
      </span>
    </div>
  );
}
