export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}

export interface PresetGroup {
  id: string;
  /** Display name for the category, e.g. "Facebook" */
  label: string;
  /** Icon key resolved to a component in the UI layer (keeps this file data-only) */
  icon: string;
  /** Extra search terms so the group is findable by its former/alternate names */
  keywords?: string[];
  presets: CanvasPreset[];
}

export const PRESET_GROUPS: PresetGroup[] = [
  {
    id: "common",
    label: "Common",
    icon: "grid",
    presets: [
      { label: "Square", width: 1080, height: 1080 },
      { label: "Portrait", width: 1080, height: 1350 },
      { label: "Phone Portrait", width: 1080, height: 1920 },
      { label: "Phone Landscape", width: 1920, height: 1080 },
      { label: "Tablet Portrait", width: 1620, height: 2160 },
      { label: "Desktop", width: 1440, height: 900 },
      { label: "Desktop HD", width: 1920, height: 1080 },
      { label: "Presentation", width: 1280, height: 720 },
    ],
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: "users",
    presets: [
      { label: "Profile Photo", width: 720, height: 720 },
      { label: "Cover Photo", width: 820, height: 312 },
      { label: "Post", width: 1200, height: 630 },
      { label: "Square Post", width: 1080, height: 1080 },
      { label: "Story", width: 1080, height: 1920 },
      { label: "Event Cover", width: 1920, height: 1005 },
      { label: "Group Cover", width: 1640, height: 856 },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "camera",
    presets: [
      { label: "Square Post", width: 1080, height: 1080 },
      { label: "Portrait Post", width: 1080, height: 1350 },
      { label: "Landscape Post", width: 1080, height: 566 },
      { label: "Story / Reel", width: 1080, height: 1920 },
      { label: "Profile Photo", width: 320, height: 320 },
    ],
  },
  {
    id: "twitter",
    label: "X (Twitter)",
    icon: "at",
    presets: [
      { label: "Post", width: 1600, height: 900 },
      { label: "Card", width: 1200, height: 628 },
      { label: "Header", width: 1500, height: 500 },
      { label: "Profile Photo", width: 400, height: 400 },
    ],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "briefcase",
    presets: [
      { label: "Square Post", width: 1080, height: 1080 },
      { label: "Landscape Post", width: 1200, height: 627 },
      { label: "Portrait Post", width: 1200, height: 1500 },
      { label: "Banner", width: 1584, height: 396 },
      { label: "Profile Photo", width: 400, height: 400 },
      { label: "Company Logo", width: 300, height: 300 },
    ],
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: "play",
    presets: [
      { label: "Thumbnail", width: 1280, height: 720 },
      { label: "Channel Banner", width: 2560, height: 1440 },
      { label: "Profile Photo", width: 800, height: 800 },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "music",
    presets: [
      { label: "Video", width: 1080, height: 1920 },
      { label: "Profile Photo", width: 200, height: 200 },
    ],
  },
  {
    id: "pinterest",
    label: "Pinterest",
    icon: "pin",
    presets: [
      { label: "Pin", width: 1000, height: 1500 },
      { label: "Square Pin", width: 1000, height: 1000 },
      { label: "Profile Photo", width: 165, height: 165 },
    ],
  },
  {
    id: "google",
    label: "Google Business",
    icon: "store",
    keywords: ["google my business", "gmb", "business profile", "google maps"],
    presets: [
      { label: "Profile Photo", width: 720, height: 720 },
      { label: "Cover Photo", width: 1024, height: 576 },
      { label: "Post", width: 1200, height: 900 },
      { label: "Post (Portrait)", width: 900, height: 1200 },
      { label: "Story / Video", width: 1080, height: 1920 },
    ],
  },
  {
    id: "print",
    label: "Print",
    icon: "printer",
    presets: [
      { label: "A4 (300 DPI)", width: 2480, height: 3508 },
      { label: "A5 (300 DPI)", width: 1748, height: 2480 },
      { label: "Poster (2:3)", width: 2400, height: 3600 },
      { label: "Business Card", width: 1050, height: 600 },
      { label: "Flyer", width: 2480, height: 3508 },
    ],
  },
  {
    id: "other",
    label: "Other",
    icon: "box",
    presets: [
      { label: "Logo", width: 500, height: 500 },
      { label: "Email Header", width: 1200, height: 400 },
      { label: "Blog Hero", width: 1200, height: 800 },
      { label: "Ad Banner", width: 728, height: 90 },
      { label: "Wide Banner", width: 970, height: 250 },
    ],
  },
];

/** Short list used for the toolbar size picker / quick labels. */
export const QUICK_SIZES: CanvasPreset[] = [
  { label: "Square", width: 1080, height: 1080 },
  { label: "Portrait", width: 1080, height: 1350 },
  { label: "Phone Portrait", width: 1080, height: 1920 },
  { label: "Phone Landscape", width: 1920, height: 1080 },
  { label: "Desktop", width: 1440, height: 900 },
  { label: "Desktop HD", width: 1920, height: 1080 },
  { label: "Presentation", width: 1280, height: 720 },
];

/** Finds the first preset (quick sizes first, then all presets) matching the given dimensions. */
export function findPresetLabel(width: number, height: number): string | null {
  const quick = QUICK_SIZES.find((s) => s.width === width && s.height === height);
  if (quick) return quick.label;
  for (const group of PRESET_GROUPS) {
    const match = group.presets.find((p) => p.width === width && p.height === height);
    if (match) return `${group.label} ${match.label}`;
  }
  return null;
}
