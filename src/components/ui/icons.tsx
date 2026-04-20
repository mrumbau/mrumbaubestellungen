import * as React from "react";

/**
 * Icon catalog — minimal, in-house SVG icons.
 *
 * Principles:
 * - Consistent 1.5px stroke width, square linejoin, round linecap
 * - 16×16 intrinsic viewBox (size controlled by className h-/w-)
 * - currentColor for stroke/fill — themable via Tailwind `text-*`
 * - No emoji anywhere in structural UI (per UI/UX audit rule)
 *
 * Extend this file cautiously — each new icon is a design decision.
 */
const iconProps = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": "true" as const,
};

type IconProps = React.SVGProps<SVGSVGElement>;

export function IconPlus(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9.5h5L11 4M7 7v4M9 7v4" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="7" cy="7" r="4" />
      <path d="M13 13l-3-3" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />
      <path d="M5 5h2M5 7.5h2M5 10h2M9 5h2M9 7.5h2M9 10h2" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <circle cx="11" cy="6" r="1.75" />
      <path d="M10.5 9.5c2 0 3.5 1.5 3.5 3.5" />
    </svg>
  );
}

export function IconFolderOpen(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M2 5.5V4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V6M2 5.5l1 6.5a1 1 0 001 1h8a1 1 0 001-1l1-6H2z" />
    </svg>
  );
}

export function IconTool(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M10.5 2.5a3 3 0 11-4 4L3 10l3 3 3.5-3.5a3 3 0 014-4l-2 2-1.5-.5-.5-1.5 2-2z" />
    </svg>
  );
}

export function IconRepeat(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 8a5 5 0 019-3M13 8a5 5 0 01-9 3" />
      <path d="M9 2L12 5 9 8M7 14L4 11l3-3" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4l5-2z" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" />
    </svg>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M2 8h3l2-5 3 10 2-5h2" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="5" cy="11" r="2.5" />
      <path d="M7 9l6-6M11 5l1.5 1.5M9 7l1.5 1.5" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

export function IconAlertCircle(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.5M8 10.5v0.5" />
    </svg>
  );
}

export function IconPuzzle(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M7 2.5a1.5 1.5 0 013 0V4h2.5v2.5H14a1.5 1.5 0 010 3h-1.5V12H10v-1.5a1.5 1.5 0 01-3 0V12H4.5V9.5H3a1.5 1.5 0 010-3h1.5V4H7V2.5z" />
    </svg>
  );
}

export function IconDotsHorizontal(props: IconProps) {
  return (
    <svg {...iconProps} {...props} strokeWidth={0} fill="currentColor">
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 12.5h11" />
    </svg>
  );
}
