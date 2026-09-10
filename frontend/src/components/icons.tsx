import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

function base(children: ReactNode, size = 18) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconGrid({ size }: IconProps) {
  return base(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>,
    size
  );
}

export function IconTrendingUp({ size }: IconProps) {
  return base(
    <>
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </>,
    size
  );
}

export function IconTrendingDown({ size }: IconProps) {
  return base(
    <>
      <polyline points="3 7 9 13 13 9 21 18" />
      <polyline points="15 18 21 18 21 12" />
    </>,
    size
  );
}

export function IconPlug({ size }: IconProps) {
  return base(
    <>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V9Z" />
      <path d="M12 18v3" />
    </>,
    size
  );
}

export function IconLogOut({ size }: IconProps) {
  return base(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>,
    size
  );
}

export function IconChevronDown({ size }: IconProps) {
  return base(<polyline points="6 9 12 15 18 9" />, size);
}

export function IconCalendar({ size }: IconProps) {
  return base(
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </>,
    size
  );
}

export function IconCheckCircle({ size }: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8.5 12.5 11 15 15.5 9" />
    </>,
    size
  );
}

export function IconAlertTriangle({ size }: IconProps) {
  return base(
    <>
      <path d="M10.5 3.5 2 19h20L13.5 3.5a1.7 1.7 0 0 0-3 0Z" />
      <line x1="12" y1="9.5" x2="12" y2="13.5" />
      <line x1="12" y1="16.5" x2="12" y2="16.6" />
    </>,
    size
  );
}

export function IconClock({ size }: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>,
    size
  );
}

export function IconRefresh({ size }: IconProps) {
  return base(
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4.6M4 5v5h5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.6M20 19v-5h-5" />
    </>,
    size
  );
}

export function IconArrowRight({ size }: IconProps) {
  return base(
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </>,
    size
  );
}

export function IconShoppingBag({ size }: IconProps) {
  return base(
    <>
      <path d="M6 8h12l1.2 12.2a1.5 1.5 0 0 1-1.5 1.8H6.3a1.5 1.5 0 0 1-1.5-1.8L6 8Z" />
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
    </>,
    size
  );
}

export function IconTrash({ size }: IconProps) {
  return base(
    <>
      <polyline points="4 7 20 7" />
      <path d="M6 7h12l-1 14H7L6 7Z" />
      <path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>,
    size
  );
}

export function IconMegaphone({ size }: IconProps) {
  return base(
    <>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l7 4V5l-7 4H4a1 1 0 0 0-1 1Z" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" />
      <path d="M20 6a8.5 8.5 0 0 1 0 12" />
    </>,
    size
  );
}

export function IconTarget({ size }: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>,
    size
  );
}

export function IconSettings({ size }: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M5.1 6.1l1.6 1.6M17.3 16.3l1.6 1.6M3.5 12h2.2M18.3 12h2.2M5.1 17.9l1.6-1.6M17.3 7.7l1.6-1.6" />
    </>,
    size
  );
}

export function IconUsers({ size }: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M19 20c0-2.6-1.7-4.8-4-5.6" />
    </>,
    size
  );
}

export function IconUserPlus({ size }: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <line x1="18" y1="6" x2="18" y2="12" />
      <line x1="15" y1="9" x2="21" y2="9" />
    </>,
    size
  );
}

export function IconBuilding({ size }: IconProps) {
  return base(
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <line x1="8" y1="7.5" x2="8" y2="7.6" />
      <line x1="12" y1="7.5" x2="12" y2="7.6" />
      <line x1="16" y1="7.5" x2="16" y2="7.6" />
      <line x1="8" y1="11.5" x2="8" y2="11.6" />
      <line x1="12" y1="11.5" x2="12" y2="11.6" />
      <line x1="16" y1="11.5" x2="16" y2="11.6" />
      <line x1="8" y1="15.5" x2="8" y2="15.6" />
      <line x1="16" y1="15.5" x2="16" y2="15.6" />
      <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" />
    </>,
    size
  );
}

export function IconMessageCircle({ size }: IconProps) {
  return base(
    <>
      <path d="M3 12a9 9 0 1 1 3.5 7.1L3 20l1.1-3.3A8.96 8.96 0 0 1 3 12Z" />
    </>,
    size
  );
}

export function IconTag({ size }: IconProps) {
  return base(
    <>
      <path d="M12.5 3.5h5A2 2 0 0 1 19.5 5.5v5a2 2 0 0 1-.586 1.414l-7.5 7.5a2 2 0 0 1-2.828 0l-4.5-4.5a2 2 0 0 1 0-2.828l7.5-7.5A2 2 0 0 1 12.5 3.5Z" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </>,
    size
  );
}

export function IconDatabaseZap({ size }: IconProps) {
  return base(
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5v6c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8v-6" />
      <path d="M4 11.5v6c0 1.55 3.58 2.8 8 2.8.9 0 1.76-.06 2.55-.18" />
      <path d="M14.5 15.5 12 19h4l-2.5 3.5" />
    </>,
    size
  );
}

export function IconSun({ size }: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M4.4 4.4l2.1 2.1M17.5 17.5l2.1 2.1M2.5 12h3M18.5 12h3M4.4 19.6l2.1-2.1M17.5 6.5l2.1-2.1" />
    </>,
    size
  );
}

export function IconMoon({ size }: IconProps) {
  return base(<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />, size);
}

export function IconDownload({ size }: IconProps) {
  return base(
    <>
      <path d="M12 3.5v11.5M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
    </>,
    size
  );
}

export function IconFileText({ size }: IconProps) {
  return base(
    <>
      <path d="M7 3.5h7l3.5 3.5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V7h3.5" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
      <line x1="8.5" y1="15.5" x2="15.5" y2="15.5" />
      <line x1="8.5" y1="19" x2="12.5" y2="19" />
    </>,
    size
  );
}

export function IconMenu({ size }: IconProps) {
  return base(
    <>
      <line x1="3.5" y1="6.5" x2="20.5" y2="6.5" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" />
      <line x1="3.5" y1="17.5" x2="20.5" y2="17.5" />
    </>,
    size
  );
}

export function IconInfo({ size }: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="7.5" x2="12" y2="7.6" />
    </>,
    size
  );
}

export function IconPlay({ size }: IconProps) {
  return base(<path d="M6.5 4.5v15l13-7.5-13-7.5Z" />, size);
}

export function IconShield({ size }: IconProps) {
  return base(
    <>
      <path d="M12 3 4.5 6v6c0 5 3.5 7.5 7.5 9 4-1.5 7.5-4 7.5-9V6L12 3Z" />
      <polyline points="9 12 11.2 14.2 15.5 9.5" />
    </>,
    size
  );
}

export function IconX({ size }: IconProps) {
  return base(
    <>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </>,
    size
  );
}
