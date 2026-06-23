'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, X, ChevronDown, ChevronRight } from 'lucide-react';
import { getVaultListCategory, type VaultListCategory } from '@/lib/config/vaults';
import { useVaultList } from '@/lib/hooks/useProtocolStats';
import { Button } from '@/components/ui/button';
import { SIDEBAR_NETWORKS } from '@/lib/constants';
import type { VaultWithData } from '@/lib/hooks/useProtocolStats';

const navBase = [
  { label: 'Overview', href: '/', icon: Shield },
];

type VaultSection = { type: VaultListCategory; label: string; vaults: VaultWithData[] };

const SECTION_ORDER: VaultListCategory[] = ['vineyard', 'prime', 'frontier'];
const SECTION_LABELS: Record<VaultListCategory, string> = {
  vineyard: 'V2 Vineyard Vaults',
  prime: 'V2 Prime Vaults',
  frontier: 'V2 Frontier Vaults',
};

function getSectionsForNetwork(vaults: VaultWithData[], chainId: number): VaultSection[] {
  const byChain = vaults.filter((v) => v.chainId === chainId);
  return SECTION_ORDER.map((type) => ({
    type,
    label: SECTION_LABELS[type],
    vaults: byChain.filter((v) => getVaultListCategory(v.address, v.name) === type),
  })).filter((section) => section.vaults.length > 0);
}

type SidebarProps = {
  onClose?: () => void;
};

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: vaults = [], isLoading } = useVaultList();
  const [expandedNetworks, setExpandedNetworks] = useState<Set<number>>(() =>
    new Set(SIDEBAR_NETWORKS.map((n) => n.chainId))
  );

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  const toggleNetwork = (chainId: number) => {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      return next;
    });
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
        <Link
          href="/"
          onClick={handleLinkClick}
          className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          <img
            src="/muscadinelogo.jpg"
            alt="Muscadine"
            className="h-9 w-9 shrink-0 rounded-xl object-cover"
          />
          Analytics
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px] touch-manipulation lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-4 text-sm touch-manipulation">
        <div className="space-y-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Explore
          </p>
          {navBase.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleLinkClick}
              className={`flex min-h-[44px] w-full touch-manipulation items-center gap-2 rounded-lg px-2 py-2 transition ${
                isActive(item.href)
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </div>

        {SIDEBAR_NETWORKS.filter(
          (network) => getSectionsForNetwork(vaults, network.chainId).length > 0
        ).map((network) => {
          const sections = getSectionsForNetwork(vaults, network.chainId);
          const isExpanded = expandedNetworks.has(network.chainId);

          return (
            <div key={network.chainId} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleNetwork(network.chainId)}
                className="flex min-h-[44px] w-full cursor-pointer touch-manipulation items-center gap-2 rounded-lg px-2 py-2 text-left text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className="font-medium">
                  {network.name}
                </span>
              </button>
              {isExpanded && (
                <div className="ml-4 space-y-4 border-l border-slate-200 pl-2 dark:border-slate-700">
                  {isLoading ? (
                    <div className="px-2 py-2 text-slate-500 dark:text-slate-400">Loading...</div>
                  ) : (
                    sections.map((section) => (
                      <div key={section.type} className="space-y-2">
                        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {section.label}
                        </p>
                        <div className="space-y-1">
                          {section.vaults.map((vault) => {
                            const href = `/vault/v2/${vault.address}`;
                            const active = isActive(href);

                            return (
                              <Link
                                key={vault.address}
                                href={href}
                                onClick={handleLinkClick}
                                className={`flex min-h-[44px] w-full touch-manipulation items-center gap-2 rounded-lg px-2 py-2 text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
                                  active
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                    : ''
                                }`}
                              >
                                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                  {(vault.asset ?? 'U').slice(0, 1)}
                                </span>
                                <span className="truncate min-w-0">{vault.name ?? 'Unknown Vault'}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
