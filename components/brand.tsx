import Link from "next/link";

type BrandProps = {
  compact?: boolean;
  href?: string;
};

export function Brand({ compact = false, href = "/control" }: BrandProps) {
  return (
    <Link className="brand" href={href} aria-label="NeuseCast home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 44 44" role="img">
          <rect x="3" y="4" width="38" height="32" rx="10" />
          <path d="M10 26c4.2 0 4.2-7 8.4-7s4.2 7 8.4 7 4.2-7 8.4-7" />
          <path d="M17 40h10" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-copy">
          <span className="brand-name">NeuseCast</span>
          <span className="brand-tag">Local screens, connected.</span>
        </span>
      )}
    </Link>
  );
}
