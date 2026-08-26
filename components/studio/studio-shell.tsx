"use client";

import { useState, type ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Layers3,
  Library,
  ListVideo,
  Menu,
  RadioTower,
  Settings,
  SlidersHorizontal,
  Video,
  X,
} from "lucide-react";
import styles from "./studio-shell.module.css";

const navigation = [
  {
    label: "On Air",
    description: "Program and preview",
    href: "/studio",
    icon: RadioTower,
  },
  {
    label: "Library",
    description: "Video, audio and stills",
    href: "/studio/library",
    icon: Library,
  },
  {
    label: "Logs",
    description: "Daily running order",
    href: "/studio/logs",
    icon: ListVideo,
  },
  {
    label: "Graphics",
    description: "Overlays and ticker",
    href: "/studio/graphics",
    icon: Layers3,
  },
  {
    label: "Live",
    description: "Cameras and inputs",
    href: "/studio/live",
    icon: Video,
  },
  {
    label: "Settings",
    description: "Playout and delivery",
    href: "/studio/settings",
    icon: Settings,
  },
] as const;

function isCurrentPath(pathname: string, href: string) {
  if (href === "/studio") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getCurrentSection(pathname: string) {
  return (
    navigation.find((item) => isCurrentPath(pathname, item.href)) ?? {
      label: "Broadcast Studio",
      description: "NeuseCast playout operations",
    }
  );
}

type StudioShellProps = {
  children: ReactNode;
};

export function StudioShell({ children }: StudioShellProps) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const currentSection = getCurrentSection(pathname);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#studio-main-content">
        Skip to studio workspace
      </a>

      {navigationOpen ? (
        <button
          className={`${styles.scrim} ${styles.scrimVisible}`}
          type="button"
          aria-label="Close studio navigation"
          onClick={() => setNavigationOpen(false)}
        />
      ) : null}

      <aside
        className={`${styles.sidebar} ${navigationOpen ? styles.sidebarOpen : ""}`}
        id="studio-navigation"
        aria-label="Broadcast Studio navigation"
      >
        <div className={styles.sidebarHeader}>
          <Link
            className={styles.brand}
            href="/studio"
            aria-label="NeuseCast Broadcast Studio home"
            onClick={() => setNavigationOpen(false)}
          >
            <span className={styles.brandMark} aria-hidden="true">
              <RadioTower size={23} strokeWidth={1.8} />
              <span className={styles.brandPulse} />
            </span>
            <span className={styles.brandCopy}>
              <span className={styles.brandName}>NEUSECAST</span>
              <span className={styles.brandProduct}>Broadcast Studio</span>
            </span>
          </Link>

          <button
            className={`${styles.iconButton} ${styles.closeButton}`}
            type="button"
            aria-label="Close studio navigation"
            onClick={() => setNavigationOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.outputCard}>
          <span className={styles.outputIcon} aria-hidden="true">
            <SlidersHorizontal size={17} />
          </span>
          <span className={styles.outputCopy}>
            <small>Automation workspace</small>
            <strong>Main channel</strong>
          </span>
          <span className={styles.outputTag}>CG</span>
        </div>

        <nav className={styles.navigation} aria-label="Studio sections">
          <span className={styles.navigationLabel}>Production</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isCurrentPath(pathname, item.href);

            return (
              <Link
                className={`${styles.navigationLink} ${active ? styles.navigationLinkActive : ""}`}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavigationOpen(false)}
              >
                <span className={styles.navigationIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className={styles.navigationCopy}>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.engineCard}>
            <span className={styles.engineIndicator} aria-hidden="true" />
            <span>
              <small>Playout engine</small>
              <strong>CasparCG target</strong>
            </span>
          </div>

          <Link
            className={styles.controlLink}
            href="/control"
            onClick={() => setNavigationOpen(false)}
          >
            <ArrowLeft size={16} strokeWidth={1.9} aria-hidden="true" />
            Back to Control Room
          </Link>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.titleGroup}>
            <button
              className={`${styles.iconButton} ${styles.menuButton}`}
              type="button"
              aria-label="Open studio navigation"
              aria-expanded={navigationOpen}
              aria-controls="studio-navigation"
              onClick={() => setNavigationOpen(true)}
            >
              <Menu size={21} aria-hidden="true" />
            </button>

            <div className={styles.titleCopy}>
              <span>Broadcast operations</span>
              <h1>{currentSection.label}</h1>
            </div>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.workspaceBadge} title="Authenticated NeuseCast workspace">
              <span className={styles.workspaceDot} aria-hidden="true" />
              Studio console
            </div>
            <span className={styles.topbarDivider} aria-hidden="true" />
            <div className={styles.userButton}>
              <UserButton />
            </div>
          </div>
        </header>

        <main className={styles.content} id="studio-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
