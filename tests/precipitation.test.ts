import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPrecipitationType,
  isFrozenPrecipitation,
} from "@/lib/weather/precipitation";

test("classifies snowfall separately from liquid-equivalent precipitation", () => {
  const type = classifyPrecipitationType({
    condition: "Snow",
    precipitationMmPerHour: 1.2,
    snowfallMmPerHour: 5,
    iceAccumulationMmPerHour: 0,
  });

  assert.equal(type, "snow");
  assert.equal(isFrozenPrecipitation(type), true);
});

test("classifies freezing rain and mixed winter precipitation", () => {
  assert.equal(
    classifyPrecipitationType({
      condition: "Freezing Rain",
      iceAccumulationMmPerHour: 0.05,
    }),
    "freezing-rain",
  );
  assert.equal(
    classifyPrecipitationType({
      condition: "Rain and Snow",
      snowfallMmPerHour: 1,
      iceAccumulationMmPerHour: 0,
    }),
    "mixed",
  );
});

test("classifies liquid rain and known zero accumulation", () => {
  assert.equal(
    classifyPrecipitationType({ condition: "Rain", precipitationMmPerHour: 2 }),
    "rain",
  );
  assert.equal(
    classifyPrecipitationType({
      precipitationMmPerHour: 0,
      snowfallMmPerHour: 0,
      iceAccumulationMmPerHour: 0,
    }),
    "none",
  );
});
