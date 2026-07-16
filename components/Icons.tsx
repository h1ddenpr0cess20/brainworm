import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>
);
export const LibraryIcon = (props: IconProps) => (
  <Icon {...props}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /><path d="M9 7h7" /></Icon>
);
export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5v.1h-4v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3v-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 001.8.3 1.7 1.7 0 001-1.5V3h4v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 00-.3 1.8 1.7 1.7 0 001.5 1h.1v4h-.1a1.7 1.7 0 00-1.5 1z" /></Icon>
);
export const SendIcon = (props: IconProps) => (
  <Icon {...props}><path d="M22 12L3 4.5l3.4 7.5L3 19.5 22 12z" /><path d="M6.4 12H22" /></Icon>
);
export const RegenerateIcon = (props: IconProps) => (
  <Icon {...props}><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0115-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 01-15 6.7L3 16" /></Icon>
);
export const BranchIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="6" cy="4" r="2" /><circle cx="6" cy="20" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 6v12M6 12h6a4 4 0 004-4V6" /></Icon>
);
export const StopIcon = (props: IconProps) => (
  <Icon {...props}><rect x="6" y="6" width="12" height="12" rx="2" /></Icon>
);
export const CloseIcon = (props: IconProps) => (
  <Icon {...props}><path d="M18 6L6 18M6 6l12 12" /></Icon>
);
export const TrashIcon = (props: IconProps) => (
  <Icon {...props}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></Icon>
);
export const CopyIcon = (props: IconProps) => (
  <Icon {...props}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Icon>
);
export const SearchIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Icon>
);
export const SparkIcon = (props: IconProps) => (
  <Icon {...props}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15z" /></Icon>
);
export const MoonIcon = (props: IconProps) => (
  <Icon {...props}><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" /></Icon>
);
export const SunIcon = (props: IconProps) => (
  <Icon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const CodeIcon = (props: IconProps) => (
  <Icon {...props}><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></Icon>
);
export const PaperclipIcon = (props: IconProps) => (
  <Icon {...props}><path d="M21.4 11.6l-8.9 8.9a6 6 0 01-8.5-8.5l9.6-9.6a4 4 0 015.7 5.7l-9.6 9.6a2 2 0 01-2.8-2.8l8.9-8.9" /></Icon>
);
export const CheckIcon = (props: IconProps) => (
  <Icon {...props}><path d="M20 6L9 17l-5-5" /></Icon>
);
export const PlayIcon = (props: IconProps) => (
  <Icon {...props}><path d="M8 5l11 7-11 7V5z" /></Icon>
);
export const PauseIcon = (props: IconProps) => (
  <Icon {...props}><path d="M9 5v14M15 5v14" /></Icon>
);
export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Icon>
);
export const VolumeIcon = (props: IconProps) => (
  <Icon {...props}><path d="M11 5L6 9H3v6h3l5 4V5zM15 9a4 4 0 010 6M18 6a8 8 0 010 12" /></Icon>
);
export const ImageIcon = (props: IconProps) => (
  <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 15l-5-5L5 20" /></Icon>
);
