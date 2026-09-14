export const OVERCAST_SOLAR_TRANSMISSION_FLOOR = 0.25;
export const CLOUD_ATTENUATION_EXPONENT = 3.4;

export function calculateCloudSolarTransmission(
  cloudCover: number | null | undefined,
  daylight = true,
) {
  if (!daylight) return 0;
  if (typeof cloudCover !== "number" || !Number.isFinite(cloudCover)) return 1;

  const cloudFraction = Math.max(0, Math.min(100, cloudCover)) / 100;
  return Math.max(
    0,
    Math.min(
      1,
      1 -
        (1 - OVERCAST_SOLAR_TRANSMISSION_FLOOR) *
          Math.pow(cloudFraction, CLOUD_ATTENUATION_EXPONENT),
    ),
  );
}
