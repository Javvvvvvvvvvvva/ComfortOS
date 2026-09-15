import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const buildPlatform = process.env.EAS_BUILD_PLATFORM;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (buildProfile === "production") {
    assertProductionUrl("EXPO_PUBLIC_API_BASE_URL", apiBaseUrl);
    assertProductionUrl("EXPO_PUBLIC_SITE_URL", siteUrl);
    if (buildPlatform === "android" && !googleMapsApiKey) {
      throw new Error("GOOGLE_MAPS_API_KEY is required for an Android production build.");
    }
  }

  return {
    ...config,
    name: "Ahhway",
    slug: "ahhway",
    description: "Compare walking routes for current weather and street exposure.",
    scheme: "ahhway",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.ahhway.app",
      buildNumber: "1",
      config: {
        usesNonExemptEncryption: false,
      },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePreciseLocation",
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeSearchHistory",
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
        ],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["0A2A.1", "3B52.1", "C617.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
            NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
            NSPrivacyAccessedAPITypeReasons: ["85F4.1", "E174.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["1C8F.1", "CA92.1"],
          },
        ],
      },
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
        },
        NSLocationWhenInUseUsageDescription:
          "Ahhway uses your location to choose a starting point and compare nearby walking routes.",
      },
    },
    android: {
      package: "com.ahhway.app",
      versionCode: 1,
      predictiveBackGestureEnabled: true,
      adaptiveIcon: {
        backgroundColor: "#17262B",
        foregroundImage: "./assets/android-icon-foreground.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      ...(googleMapsApiKey
        ? { config: { googleMaps: { apiKey: googleMapsApiKey } } }
        : {}),
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 180,
          resizeMode: "contain",
          backgroundColor: "#17262B",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Ahhway uses your location to choose a starting point and compare nearby walking routes.",
        },
      ],
    ],
  };
};

function assertProductionUrl(name: string, value: string | undefined) {
  let parsed: URL | null = null;
  try {
    parsed = value ? new URL(value) : null;
  } catch {
    parsed = null;
  }
  const hostname = parsed?.hostname.toLowerCase() ?? "";
  const hasCredentials = Boolean(parsed?.username || parsed?.password);
  if (
    parsed?.protocol !== "https:" ||
    hasCredentials ||
    isDisallowedProductionHostname(hostname)
  ) {
    throw new Error(`${name} must be a non-placeholder HTTPS URL for production builds.`);
  }
}

function isDisallowedProductionHostname(hostname: string) {
  const reservedName =
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    ["example.com", "example.net", "example.org"].includes(hostname) ||
    [".example", ".invalid", ".test"].some((suffix) => hostname.endsWith(suffix));
  if (reservedName || hostname.includes(":")) return true;

  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
