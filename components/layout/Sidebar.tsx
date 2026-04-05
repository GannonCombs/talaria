'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Wallet, Settings, type LucideIcon } from 'lucide-react';

interface SidebarItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
}

function SidebarItem({ href, icon: Icon, label, isActive }: SidebarItemProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center py-3 transition-all duration-0 ${
        isActive
          ? 'text-primary bg-surface-container-low border-l-2 border-primary'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
      }`}
    >
      <Icon size={20} className="mb-1" />
      <span className="uppercase tracking-wider text-[8px]">{label}</span>
    </Link>
  );
}

const navItems = [
  { href: '/cost-analytics', icon: BarChart3, label: 'COST' },
  { href: '/wallet', icon: Wallet, label: 'WALLET' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-16 flex flex-col items-center py-6 bg-background border-r border-outline z-40">
      <nav className="flex flex-col gap-2 w-full px-2">
        {navItems.map((item) => (
          <SidebarItem
            key={item.href}
            {...item}
            isActive={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      <div className="mt-auto mb-4 w-full px-2">
        <SidebarItem
          href="/settings"
          icon={Settings}
          label="SETTINGS"
          isActive={pathname === '/settings'}
        />
      </div>
    </aside>
  );
}
