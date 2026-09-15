import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigContext } from "expo/config";
import createAppConfig from "../../app.config";

const CONFIG_KEYS = [
  "EAS_BUILD_PROFILE",
  "EAS_BUILD_PLATFORM",
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_SITE_URL",
  "GOOGLE_MAPS_API_KEY",
] as const;

test("production config rejects missing, reserved, and private API origins", () => {
  for (const apiUrl of [
    undefined,
    "http://api.ahhway.com",
    "https://example.com",
    "https://preview.invalid",
    "https://localhost",
    "https://127.0.0.2",
    "https://10.2.3.4",
    "https://172.20.1.4",
    "https://192.168.2.4",
    "https://[::1]",
  ]) {
    withConfigEnv(
      {
        EAS_BUILD_PROFILE: "production",
        EAS_BUILD_PLATFORM: "ios",
        EXPO_PUBLIC_API_BASE_URL: apiUrl,
        EXPO_PUBLIC_SITE_URL: "https://ahhway.com",
      },
      () => assert.throws(() => buildConfig(), /EXPO_PUBLIC_API_BASE_URL/),
    );
  }
});

test("iOS production config pins transport, privacy, and encryption declarations", () => {
  withConfigEnv(
    {
      EAS_BUILD_PROFILE: "production",
      EAS_BUILD_PLATFORM: "ios",
      EXPO_PUBLIC_API_BASE_URL: "https://api.ahhway.com",
      EXPO_PUBLIC_SITE_URL: "https://ahhway.com",
    },
    () => {
      const config = buildConfig();
      assert.equal(config.ios?.config?.usesNonExemptEncryption, false);
      assert.equal(config.ios?.infoPlist?.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
      assert.equal(config.ios?.privacyManifests?.NSPrivacyTracking, false);
    },
  );
});

test("Android production config requires and applies its release map key", () => {
  const base = {
    EAS_BUILD_PROFILE: "production",
    EAS_BUILD_PLATFORM: "android",
    EXPO_PUBLIC_API_BASE_URL: "https://api.ahhway.com",
    EXPO_PUBLIC_SITE_URL: "https://ahhway.com",
  };
  withConfigEnv(base, () => assert.throws(() => buildConfig(), /GOOGLE_MAPS_API_KEY/));
  withConfigEnv({ ...base, GOOGLE_MAPS_API_KEY: "release-key" }, () => {
    assert.equal(buildConfig().android?.config?.googleMaps?.apiKey, "release-key");
  });
});

test("development config permits a local API without adding a map credential", () => {
  withConfigEnv(
    {
      EXPO_PUBLIC_API_BASE_URL: "http://10.0.0.199:3000",
      EXPO_PUBLIC_SITE_URL: undefined,
    },
    () => assert.equal(buildConfig().android?.config, undefined),
  );
});

function buildConfig() {
  return createAppConfig({ config: {} } as ConfigContext);
}

function withConfigEnv(
  values: Partial<Record<(typeof CONFIG_KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = Object.fromEntries(CONFIG_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of CONFIG_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of CONFIG_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
