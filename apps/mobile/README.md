# Ahhway Mobile

Native iOS and Android client for the Ahhway walking-route experience. ComfortOS calculations,
provider credentials, weather normalization, and environmental analysis remain on the server.
The app consumes only normalized `/api` responses.

## Run

```bash
npm install
npm run ios
```

The iOS simulator defaults to `http://localhost:3000`. The Android emulator defaults to
`http://10.0.2.2:3000`. For a physical device or production build, create `.env.local`:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-ahhway-api.example.com
EXPO_PUBLIC_SITE_URL=https://your-ahhway-site.example.com
GOOGLE_MAPS_API_KEY=your-android-app-restricted-google-maps-key
```

Never place Mapbox, R2, weather-service, or environment-service secrets in an
`EXPO_PUBLIC_*` variable. Those credentials stay in the server deployment. The Google Maps
key is written into the Android binary and must be restricted to `com.ahhway.app` plus the
release signing certificate SHA-1 in Google Cloud Console.

Production EAS builds fail during config resolution unless the public API and policy-site
origins use non-placeholder HTTPS URLs. Android production builds also require
`GOOGLE_MAPS_API_KEY`.

## Checks

```bash
npm run typecheck
npm test
npm run doctor
npm run smoke:api
```

Expo Go can exercise the current map and foreground location flow. Store builds require the
platform map configuration described by Expo before Android release signing.
