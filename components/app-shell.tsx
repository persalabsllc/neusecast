"use client";

import { useState, type ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  Clapperboard,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Megaphone,
  MonitorPlay,
  RadioTower,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";

const primaryNavigation = [
  { label: "Dashboard", href: "/control", icon: LayoutDashboard },
  { label: "Screens", href: "/control/screens", icon: MonitorPlay },
  { label: "Content", href: "/control/content", icon: FolderOpen },
  { label: "Campaigns", href: "/control/campaigns", icon: Megaphone },
  { label: "Schedule", href: "/control/schedule", icon: CalendarClock },
] as const;

const pageTitles: Record<string, { eyebrow: string; title: string }> = {
  "/control": { eyebrow: "Network overview", title: "Control Room" },
  "/control/screens": { eyebrow: "Network operations", title: "Screens" },
  "/control/content": { eyebrow: "Creative library", title: "Content" },
  "/control/campaigns": { eyebrow: "Sales & delivery", title: "Campaigns" },
  "/control/schedule": { eyebrow: "Programming", title: "Schedule" },
};

function isCurrentPath(pathname: string, href: string) {
  if (href === "/control") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getPageTitle(pathname: string) {
  const exact = pageTitles[pathname];
  if (exact) return exact;

  const parentPath = Object.keys(pageTitles).find(
    (path) => path !== "/control" && pathname.startsWith(`${path}/`),
  );

  return parentPath
    ? pageTitles[parentPath]
    : { eyebrow: "NeuseCast control room", title: "Operations" };
}

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pageTitle = getPageTitle(pathname);

  return (
    <div className="app-shell">
      <button
        className={`shell-scrim ${navigationOpen ? "is-visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        tabIndex={navigationOpen ? 0 : -1}
        onClick={() => setNavigationOpen(false)}
      />

      <aside
        className={`shell-sidebar ${navigationOpen ? "is-open" : ""}`}
        id="primary-navigation"
        aria-label="Primary navigation"
      >
        <div className="sidebar-heading">
          <Brand />
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="network-badge" aria-label="NeuseCast screen network">
          <span className="network-badge-icon" aria-hidden="true">
            <RadioTower size={17} />
          </span>
          <span>
            <span className="network-badge-label">Active network</span>
            <strong>NeuseCast screen network</strong>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </div>

        <nav className="sidebar-nav" aria-label="Control room">
          <span className="sidebar-nav-label">Control room</span>
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = isCurrentPath(pathname, item.href);

            return (
              <Link
                className={`sidebar-nav-link ${active ? "is-active" : ""}`}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavigationOpen(false)}
              >
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        <Link
          className="sidebar-nav-link host-portal-link"
          href="/host"
          onClick={() => setNavigationOpen(false)}
        >
          <Clapperboard size={18} strokeWidth={1.9} aria-hidden="true" />
          <span>Host portal</span>
          <span className="nav-link-kicker">Live</span>
        </Link>

        <div className="sidebar-profile">
          <span className="profile-avatar" aria-hidden="true">
            NC
          </span>
          <span className="profile-copy">
            <strong>Control Room</strong>
            <small>NeuseCast administrator</small>
          </span>
          <UserButton />
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="topbar-title-group">
            <button
              className="icon-button mobile-menu-button"
              type="button"
              aria-label="Open navigation"
              aria-expanded={navigationOpen}
              aria-controls="primary-navigation"
              onClick={() => setNavigationOpen(true)}
            >
              <Menu size={21} aria-hidden="true" />
            </button>
            <div>
              <span className="topbar-eyebrow">{pageTitle.eyebrow}</span>
              <h1>{pageTitle.title}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="sync-status" title="Screen health is shown on the live dashboard">
              <RadioTower size={14} aria-hidden="true" />
              Fleet monitoring
            </span>
            <UserButton />
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
