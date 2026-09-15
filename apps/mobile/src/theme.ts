import type { ViewStyle } from "react-native";

export const COLORS = {
  ink: "#17262B",
  comfort: "#16766A",
  comfortDark: "#105D55",
  comfortSurface: "#E9F5F2",
  comfortIconSurface: "#D8EEE9",
  signal: "#F7C843",
  origin: "#E79A37",
  destination: "#E36E5C",
  focus: "#2674C8",
  focusSurface: "#F1F7FD",
  white: "#FFFFFF",
  surface: "#F4F6F5",
  mapFallback: "#DDE8E3",
  border: "#D9E0DD",
  borderStrong: "#AEBAB5",
  muted: "#65736E",
  placeholder: "#8C9894",
  disabled: "#AEB8B4",
  alert: "#B64032",
  alertText: "#713129",
  alertSurface: "#FFF0ED",
  noticeText: "#5D4A12",
  noticeSurface: "#FFF7D8",
} as const;

export const SHADOW: ViewStyle = {
  shadowColor: "#17262B",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.14,
  shadowRadius: 12,
  elevation: 5,
};
