"use client";

import { CloudSun, Droplets, Snowflake, Wind } from "lucide-react";
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
  const humidity = current?.relativeHumidity ?? nextForecast?.relativeHumidity;
  const snowfall = current?.snowfallMmPerHour ?? nextForecast?.snowfallMmPerHour;
  const ice = current?.iceAccumulationMmPerHour ?? nextForecast?.iceAccumulationMmPerHour;
  const winterPrecipitation =
    (typeof snowfall === "number" && snowfall > 0) ||
    (typeof ice === "number" && ice > 0);

  return (
    <div className="weather-summary" aria-live="polite">
      <CloudSun className="weather-icon" size={19} aria-hidden="true" />
      {state === "idle" && !weather ? (
        <span className="weather-empty">Weather where you start</span>
      ) : state === "error" ? (
        <span className="weather-empty">Weather unavailable</span>
      ) : (
        <>
          <span className="weather-reading">
            <strong>{state === "loading" && !weather ? "--" : temperature}</strong>
            <span>{condition}</span>
          </span>
          <span className="weather-facts">
            <small><Wind size={12} aria-hidden="true" />{wind}</small>
            {typeof humidity === "number" ? (
              <small><Droplets size={12} aria-hidden="true" />{Math.round(humidity)}%</small>
            ) : null}
            {winterPrecipitation ? (
              <small>
                <Snowflake size={12} aria-hidden="true" />
                {typeof snowfall === "number" && snowfall > 0
                  ? `${snowfall.toFixed(1)} mm/h snow`
                  : `${(ice ?? 0).toFixed(2)} mm/h ice`}
              </small>
            ) : null}
          </span>
        </>
      )}
    </div>
  );
}
