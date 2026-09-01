"use client";

import { formatTemperatureF, formatWindMph } from "@/lib/weather/format";
import type { WeatherBundle } from "@/lib/weather/types";

type EnvironmentSummaryProps = {
  weather: WeatherBundle | null;
  state: "idle" | "loading" | "success" | "error";
};

export function EnvironmentSummary({ weather, state }: EnvironmentSummaryProps) {
  const current = weather?.current;
  const nextForecast = weather?.hourlyForecast[0];
  const temperature =
    formatTemperatureF(current?.temperatureC ?? nextForecast?.temperatureC) ?? "--";
  const wind =
    formatWindMph(
      current?.windSpeedMps ?? nextForecast?.windSpeedMps,
      current?.windDirectionDeg ?? nextForecast?.windDirectionDeg,
    ) ?? "Wind unavailable";
  const condition =
    current?.shortCondition ?? nextForecast?.shortCondition ?? "Official conditions";

  return (
    <div className="weather-summary" aria-live="polite">
      <p className="eyebrow">Live weather</p>
      {state === "idle" && !weather ? (
        <strong>Select an origin</strong>
      ) : state === "error" ? (
        <strong>Live conditions unavailable</strong>
      ) : (
        <>
          <strong>{state === "loading" && !weather ? "Loading..." : temperature}</strong>
          <span>{condition}</span>
          <small>{wind}</small>
        </>
      )}
    </div>
  );
}
