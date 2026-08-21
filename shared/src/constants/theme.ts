export const palette = {
  primary: "#315E8F",
  primarySoft: "#C8D8E8",
  primaryMid: "#6F91B2",
  primaryDeep: "#315E8F",
  accentRed: "#173A5E",
  accentYellow: "#B88A2E",
  accentBlue: "#3E8FB8",
  accentGreen: "#4F8D7A",
  bgBase: "#EAF1F8",
  bgCard: "#FFFFFF",
  surface: "#FFFFFF",
  background: "#EAF1F8",
  backgroundSecondary: "#F8F9FA",
  text: "#172A40",
  textMain: "#172A40",
  textSecondary: "#506780",
  textMuted: "#9CA3AF",
  borderSoft: "#AFC3D8",
  borderLight: "#E5E7EB",
  shadow: "#173A5E",
} as const;

export const semantic = {
  success: palette.accentGreen,
  warning: palette.accentYellow,
  info: palette.accentBlue,
  danger: palette.accentRed,
} as const;

export const Colors = palette;

export const gradients = {
  page: [palette.bgBase, "#DCE8F3"] as [string, string],
  highlight: [palette.primarySoft, "#C8D8E8"] as [string, string],
} as const;
