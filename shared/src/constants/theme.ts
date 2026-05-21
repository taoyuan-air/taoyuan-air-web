export const palette = {
  primary: "#E76595",
  primarySoft: "#F8D0DA",
  primaryMid: "#FBA7BC",
  primaryDeep: "#E76595",
  accentRed: "#E94C78",
  accentYellow: "#d7ae29",
  accentBlue: "#8AB3FF",
  accentGreen: "#79b360",
  bgBase: "#FFF6F9",
  bgCard: "#FFFFFF",
  surface: "#FFFFFF",
  background: "#FFF6F9",
  backgroundSecondary: "#F8F9FA",
  text: "#3A1E2D",
  textMain: "#3A1E2D",
  textSecondary: "#7F5A6A",
  textMuted: "#9CA3AF",
  borderSoft: "#F6C8D6",
  borderLight: "#E5E7EB",
  shadow: "#5E2A42",
} as const;

export const semantic = {
  success: palette.accentGreen,
  warning: palette.accentYellow,
  info: palette.accentBlue,
  danger: palette.accentRed,
} as const;

export const Colors = palette;

export const gradients = {
  page: [palette.bgBase, "#FFEAF0"] as [string, string],
  highlight: [palette.primarySoft, "#FFE1EA"] as [string, string],
} as const;
