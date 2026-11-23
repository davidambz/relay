// Relay — Copyright (C) 2026 David Ambrozio
// SPDX-License-Identifier: GPL-3.0-or-later

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

/** Relay's mark: a source dot radiating two signal arcs. Matches favicon.svg. */
export function RelayMark(props: IconProps) {
  return (
    <svg width={22} height={22} viewBox="0 0 64 64" aria-hidden {...props}>
      <rect width="64" height="64" rx="14" fill="var(--visor-bg)" />
      <circle cx="21" cy="43" r="6" fill="var(--visor-text)" />
      <path d="M21 27a16 16 0 0 1 16 16" fill="none" stroke="var(--visor-text)" strokeWidth="6" strokeLinecap="round" />
      <path d="M21 13a30 30 0 0 1 30 30" fill="none" stroke="var(--visor-text)" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export function BroadcastIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

export function WatchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="m10 8.5 4 2-4 2z" fill="currentColor" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function MutedIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  );
}

export function FullscreenIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function ExitFullscreenIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function MiniPlayerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor" />
    </svg>
  );
}

export function ReturnIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M14 14 8 8M8 13V8h5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** A big screen over a row of small ones: the strip of other broadcasts. */
export function StripIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="11" rx="1.5" />
      <rect x="3" y="17" width="5" height="4" rx="1" />
      <rect x="9.5" y="17" width="5" height="4" rx="1" />
      <rect x="16" y="17" width="5" height="4" rx="1" />
    </svg>
  );
}

/** A monitor with a cross: stop sharing the screen. */
export function StopBroadcastIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="m9.5 8 5 5M14.5 8l-5 5" />
    </svg>
  );
}

/** A monitor with a swap arrow: broadcast another source. */
export function SwitchSourceIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M8 9.5h7l-2-2M16 11.5H9l2 2" />
    </svg>
  );
}

/** Two faders: the broadcast's settings. */
export function SlidersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <rect x="14" y="5" width="4" height="4" rx="1" />
      <rect x="8" y="15" width="4" height="4" rx="1" />
    </svg>
  );
}

/** A gear: the app's settings. */
export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19.4 10.4 L21.7 9.6 L21.7 14.4 L19.4 13.6 L18.4 16.2 L20.5 17.2 L17.2 20.5 L16.2 18.4 L13.6 19.4 L14.4 21.7 L9.6 21.7 L10.4 19.4 L7.8 18.4 L6.8 20.5 L3.5 17.2 L5.6 16.2 L4.6 13.6 L2.3 14.4 L2.3 9.6 L4.6 10.4 L5.6 7.8 L3.5 6.8 L6.8 3.5 L7.8 5.6 L10.4 4.6 L9.6 2.3 L14.4 2.3 L13.6 4.6 L16.2 5.6 L17.2 3.5 L20.5 6.8 L18.4 7.8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** A screen with a plus: watch one more broadcast. */
export function AddWatchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 4H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
      <path d="M8 21h8M12 17v4" />
      <path d="M19 2v6M16 5h6" />
    </svg>
  );
}

/** An arrow out of a door: stop watching this broadcast. */
export function LeaveIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </svg>
  );
}
