# ComfortOS — Architecture & Product Guideline v1.0

## 1. Document Purpose

이 문서는 ComfortOS 프로젝트의 최상위 기준문서다.

Cursor, Codex 또는 사람이 코드를 작성하거나 새로운 기능을 추가할 때 이 문서의 원칙을 우선 적용한다.

이 프로젝트의 핵심 목표는 단순한 그늘길 앱이나 날씨 앱을 만드는 것이 아니다.

ComfortOS는 **실시간 도시 미세기후(Microclimate)를 분석하여 사용자가 현재 또는 미래 시점에 가장 편안하게 이동할 수 있는 보행 경로를 계산하는 Outdoor Comfort Navigation Platform​**이다.

핵심 문장:

> Every city has a different definition of comfort.

모든 도시의 환경 문제는 동일하지 않다. 따라서 하나의 고정된 경로 점수식을 미국 전체에 적용하지 않는다.

도시, 계절, 현재 날씨, 시간, 건축환경, 사용자 특성에 따라 Comfort의 의미와 각 요소의 가중치가 동적으로 변해야 한다.

---

# 2. Product Definition

## 2.1 What We Are Building

ComfortOS는 다음 질문에 답하는 시스템이다.

> "지금 이 사람이 이 도시에서 목적지까지 걸어갈 때 가장 편안한 경로는 어디인가?"

그리고 향후에는:

> "30분 뒤 출발한다면 어떤 경로가 가장 편안할 것인가?"

까지 계산한다.

ComfortOS는 다음 데이터를 결합한다.

- 실시간 기상
- 예보
- 태양 위치
- 건물 형상
- 건물 높이
- 그늘
- 가로수
- 지형
- 보행로
- 풍향
- 풍속
- 건물 차폐
- 강수
- 적설
- 대기질
- 도로 특성
- 사용자 프로필

그리고 각 보행 구간(segment)에 대해 환경 점수를 계산한다.

최종적으로 A* 또는 다른 graph routing 알고리즘에서 거리만이 아니라 **Comfort Cost**를 edge weight로 사용한다.

---

# 3. Explicit Non-Goals

ComfortOS는 초기 단계에서 다음을 목표로 하지 않는다.

### Google Maps 대체

자동차 내비게이션을 만들지 않는다.

대중교통 전체 플랫폼을 만들지 않는다.

POI 검색 플랫폼을 처음부터 구축하지 않는다.

Google Maps 수준의 범용 내비게이션을 복제하지 않는다.

### 정밀 CFD

MVP에서 모든 건물 주변에 Computational Fluid Dynamics를 실시간 실행하지 않는다.

도시 전체 실시간 CFD는 계산비용이 너무 높다.

초기에는 건물 형상, 방향, 거리, street canyon 구조 등을 이용한 heuristic wind model을 사용한다.

향후 필요하면 특정 지역에 CFD 또는 ML surrogate model을 도입한다.

### AI-first Architecture

LLM이 핵심 계산을 담당하게 하지 않는다.

Comfort 계산, geometry, routing, weather normalization은 deterministic engine이어야 한다.

LLM은 설명, 요약 및 사용자 인터페이스 역할만 담당한다.

---

# 4. Core Product Principle

사용자가 보는 제품의 중심에는 항상 세 가지가 있다.

### Fast Route

가장 빠른 경로.

### Comfort Route

현재 환경에서 종합적으로 가장 편안한 경로.

### Contextual Route

현재 도시 및 환경에서 특별히 중요한 대안.

예:

Phoenix:

Cool Route

Minneapolis:

Warm Route

Seattle:

Dry Route

Chicago:

Sheltered Route

Denver:

Snow-Safe Route

Miami:

Heat Relief Route

---

# 5. City Climate DNA

ComfortOS의 핵심 차별점이다.

미국 전체를 동일한 알고리즘으로 처리하지 않는다.

각 도시는 기본적인 **Climate DNA**를 가진다.

Climate DNA는 "현재 날씨"가 아니다.

해당 도시가 구조적으로 어떤 환경 위험을 자주 가지고 있는지를 나타내는 baseline profile이다.

예:

```ts
type ClimateDNA = {
  heat: number;
  cold: number;
  humidity: number;
  rain: number;
  snow: number;
  wind: number;
  uv: number;
  wildfireSmoke: number;
  flooding: number;
  altitude: number;
};
```

값의 범위:

```text
0.0 ~ 1.0
```

---

# 6. Example City Profiles

## Phoenix

Primary concern:

Heat + Solar Radiation + UV

Climate DNA 예시:

```text
heat        1.00
uv          0.95
humidity    0.20
rain        0.10
snow        0.00
wind        0.20
cold        0.05
```

Preferred route factors:

- building shade
- tree canopy
- short direct-sun exposure
- reduced thermal surface exposure
- shorter exposed intersections
- access to cooling areas

주요 경로:

**Cool Route**

---

## Seattle

Primary concern:

Rain + Wet Exposure

```text
rain        1.00
humidity    0.85
heat        0.20
cold        0.35
snow        0.10
wind        0.35
uv          0.10
```

Preferred route factors:

- covered walkways
- building overhangs
- arcades
- indoor connections
- tree canopy where useful
- lower rain exposure
- reduced puddling/flooding risk

주요 경로:

**Dry Route**

중요:

"그늘"은 Seattle에서 항상 이점이 아니다.

맑고 추운 겨울날에는 햇빛이 오히려 Comfort를 높일 수 있다.

---

## Minneapolis

Primary concern:

Cold + Snow + Wind Chill

```text
cold        1.00
snow        0.95
wind        0.85
heat        0.50
rain        0.40
uv          0.30
```

Preferred route factors:

- building wind shelter
- sun exposure
- shorter outdoor exposure
- snow-cleared sidewalks
- reduced ice risk
- less headwind
- skyway connections when available

주요 경로:

**Warm Route**

---

## Chicago

Primary concern:

Wind + Winter Cold + Urban Canyon Effects

```text
wind        1.00
cold        0.85
snow        0.65
heat        0.55
rain        0.50
```

특히 중요:

건물 사이에서 발생하는 국지적인 바람.

Weather station wind speed를 그대로 사용하는 것은 금지한다.

Urban Wind Modifier를 적용해야 한다.

주요 경로:

**Sheltered Route**

---

## Miami

Primary concern:

Heat + Humidity + Thunderstorms

```text
heat        0.90
humidity    1.00
rain        0.80
uv          0.85
cold        0.00
```

주요 경로:

**Heat Relief Route**

Shade만으로 판단하지 않는다.

Humidity와 direct solar exposure를 함께 평가한다.

---

## Denver

Primary concern:

UV + Snow + Altitude + Temperature Swings

```text
uv          0.95
snow        0.75
cold        0.70
heat        0.45
altitude    1.00
```

주요 경로:

**Snow-Safe / UV-Aware Route**

---

# 7. Dynamic City Profile

Climate DNA는 baseline일 뿐이다.

최종 weight는 다음 세 요소의 결합으로 결정한다.

```text
City Baseline
    +
Season
    +
Real-Time Conditions
```

예:

Seattle의 Rain Score가 기본적으로 높더라도 현재 강수확률이 0이고 맑은 날이면 Rain weight는 크게 낮아져야 한다.

반대로 Phoenix에 드물게 폭우 경보가 발생했다면 해당 시간에는 Rain/Flood 위험이 Heat보다 우선할 수 있다.

즉:

```text
City does not decide the route.

City provides prior knowledge.
Current conditions decide the route.
```

---

# 8. System Architecture

전체 시스템은 다음 계층을 따른다.

```text
DATA SOURCES
      ↓
INGESTION
      ↓
NORMALIZATION
      ↓
CITY PROFILE ENGINE
      ↓
MICROCLIMATE ENGINE
      ↓
SEGMENT ENVIRONMENT ENGINE
      ↓
COMFORT ENGINE
      ↓
ROUTING ENGINE
      ↓
ROUTE EXPLANATION
      ↓
CLIENT APPLICATION
```

각 레이어는 독립 모듈이어야 한다.

---

# 9. Data Layer

초기 미국 버전은 가능한 한 국가 단위의 공개 데이터를 우선 사용한다.

## Weather

우선 후보:

**NOAA / National Weather Service**

NWS API는 forecasts, alerts, observations 등을 제공하며 미국 정부 open data로 무료 이용이 가능하다.

사용:

- temperature
- humidity
- wind speed
- wind direction
- precipitation
- forecast
- weather alerts

Weather provider는 인터페이스 뒤에 둔다.

```ts
interface WeatherProvider {
  getCurrentWeather(location): Promise<WeatherSnapshot>;
  getForecast(location, time): Promise<WeatherSnapshot>;
}
```

NOAA에 직접 종속된 business logic을 작성하지 않는다.

---

# 10. Air Quality

미국 AQI는 AirNow를 우선 검토한다.

AirNow는 EPA를 포함한 미국 정부 기관들의 협력 플랫폼이며 미국 500개 이상의 도시에서 현재/예보 공기질 데이터를 제공한다.

Normalized model:

```ts
type AirQualitySnapshot = {
  aqi: number;
  pm25?: number;
  ozone?: number;
  smokeRisk?: number;
};
```

---

# 11. Pedestrian Network

초기 pedestrian graph:

**OpenStreetMap**

OSM은 pedestrian way, sidewalk, crossing, accessibility 및 surface 등 pedestrian routing에 필요한 다양한 속성을 표현할 수 있다.

가능하면 다음을 사용한다.

- highway=footway
- highway=pedestrian
- sidewalk
- crossing
- surface
- incline
- kerb
- wheelchair
- steps
- width
- access

North America에서는 sidewalk를 별도 way로 기록하는 경우가 비교적 흔하므로 edge normalization 과정에서 이를 고려해야 한다.

---

# 12. Terrain / Elevation

미국에서 고도 및 LiDAR 기반 데이터는 USGS 3DEP를 주요 후보로 사용한다.

3DEP는 미국 전역의 고품질 elevation 및 3D topographic data 제공을 목표로 하며 데이터는 무료로 제공된다.

사용 목적:

- slope
- terrain
- depression
- potential snow/ice risk
- building/tree inference 향후 연구

---

# 13. Building Data

Building footprint 및 height는 provider abstraction을 사용한다.

```ts
interface BuildingProvider {
  getBuildings(bounds): Promise<Building[]>;
}
```

Building model:

```ts
type Building = {
  id: string;
  footprint: Polygon;
  heightMeters?: number;
  levels?: number;
  roofType?: string;
  source: string;
  confidence: number;
};
```

중요:

height가 없다고 임의로 정확한 값을 만들어내지 않는다.

추정치는 항상 confidence와 source를 가진다.

---

# 14. Normalized Weather Model

모든 API는 내부적으로 아래와 비슷한 공통 모델로 변환한다.

```ts
type WeatherSnapshot = {
  timestamp: string;

  temperatureC: number;
  relativeHumidity: number;

  windSpeedMps: number;
  windDirectionDeg: number;
  windGustMps?: number;

  precipitationMmPerHour?: number;
  precipitationProbability?: number;

  snowMmPerHour?: number;

  cloudCover?: number;
  uvIndex?: number;

  visibilityMeters?: number;

  source: string;
  confidence: number;
};
```

UI 단위는 미국 사용자에게 맞춰 °F, mph 등을 사용할 수 있지만 내부 엔진은 SI unit 사용을 권장한다.

---

# 15. Pedestrian Graph

모든 길은 node-edge graph로 변환한다.

```ts
type PedestrianEdge = {
  id: string;

  from: NodeId;
  to: NodeId;

  geometry: LineString;

  distanceMeters: number;
  bearingDegrees: number;

  surface?: string;
  slope?: number;

  stairs?: boolean;
  wheelchairAccessible?: boolean;

  crossingType?: string;

  environment?: EdgeEnvironment;
};
```

---

# 16. Edge Environment

ComfortOS에서 가장 중요한 데이터 구조 중 하나다.

```ts
type EdgeEnvironment = {
  shadeRatio?: number;

  solarExposure?: number;

  windExposure?: number;
  headwindScore?: number;

  rainExposure?: number;

  snowRisk?: number;
  iceRisk?: number;

  heatExposure?: number;

  airQualityExposure?: number;

  treeCanopy?: number;

  slopePenalty?: number;

  crossingPenalty?: number;

  safetyPenalty?: number;

  confidence: number;
};
```

이 값을 route search 시 실시간으로 계산하거나 cache 한다.

---

# 17. Solar / Shade Engine

태양 위치는 다음 입력으로 계산한다.

```text
latitude
longitude
date
time
timezone
```

결과:

```text
solar azimuth
solar elevation
```

그 후 건물 footprint + height를 이용해 shadow geometry를 계산한다.

각 pedestrian edge가 shadow polygon과 얼마만큼 겹치는지 계산한다.

결과:

```text
shadeRatio = shadedLength / totalEdgeLength
```

0~1.

Tree canopy는 building shade와 분리해서 저장한다.

---

# 18. Why Shade Must Be Time Dependent

다음은 금지한다.

```ts
edge.shade = 0.8
```

같은 static model.

Shade는 반드시 시간에 따라 변한다.

올바른 개념:

```ts
getShade(edge, timestamp)
```

오전 9시와 오후 5시는 같은 길이어도 결과가 다르다.

---

# 19. Wind Engine

MVP에서 매우 중요한 차별화 요소다.

Weather API의 풍향·풍속은 **regional wind**다.

실제 pedestrian wind와 동일하지 않다.

따라서:

```text
Regional Wind
     ↓
Street Geometry
     ↓
Building Geometry
     ↓
Urban Wind Modifier
     ↓
Estimated Pedestrian Wind
```

방식으로 처리한다.

---

# 20. Wind Direction Interaction

각 pedestrian edge에는 진행 방향(bearing)이 있다.

풍향과 진행 방향의 각도 차이를 계산한다.

이를 이용해:

```text
headwind
tailwind
crosswind
```

를 분류한다.

예:

```ts
headwindScore = f(
  edgeBearing,
  windDirection,
  windSpeed
)
```

겨울에는 headwind penalty를 크게 적용한다.

---

# 21. Building Wind Shelter

MVP heuristic 예:

건물의 상대 위치와 풍향을 계산하여 pedestrian segment가 건물의 leeward side인지 확인한다.

고려 요소:

- building height
- distance from building
- wind direction
- building width
- street orientation
- surrounding building density

결과:

```text
windShelterFactor
0.0 ~ 1.0
```

1.0:

매우 강한 shelter

0:

open exposure

주의:

이 값은 실제 CFD 결과라고 표시하지 않는다.

항상:

**Estimated Wind Exposure**

로 표현한다.

---

# 22. Future Wind Model

추후:

- CFD simulation
- precomputed wind fields
- machine-learning surrogate
- user sensor calibration

등으로 교체할 수 있게 인터페이스화한다.

```ts
interface UrbanWindModel {
  estimate(edge, weather, urbanContext): WindEstimate;
}
```

---

# 23. Rain Exposure Engine

Seattle 같은 지역에서 중요하다.

Rain exposure는 단순히 강수량을 edge에 그대로 넣는 것이 아니다.

다음 환경정보를 고려한다.

- covered walkway
- roof
- awning
- arcade
- tunnel
- indoor connector
- tree canopy
- building orientation
- wind-driven rain

결과:

```text
rainExposure
0 ~ 1
```

---

# 24. Snow / Ice Engine

겨울 도시에서 사용한다.

초기 모델:

```text
temperature
precipitation
snowfall
slope
solar exposure
surface
time since snowfall
```

을 사용한다.

가능한 경우 도시별 snow-removal/open data를 추가한다.

하지만 전국 공통 데이터가 없는 기능은 core requirement로 만들지 않는다.

City Adapter에서 제공한다.

---

# 25. City Adapter Architecture

미국은 도시별 공개 데이터 격차가 매우 크다.

따라서:

```text
National Core
+
City Adapter
```

구조로 간다.

예:

```text
/core
/cities/minneapolis
/cities/seattle
/cities/phoenix
```

Seattle adapter:

```text
rain-related city datasets
covered walkway information
local transportation data
```

Minneapolis adapter:

```text
skyway
snow routes
local sidewalk data
```

City Adapter가 없어도 앱 기본 기능은 작동해야 한다.

---

# 26. Comfort Engine

Comfort Engine은 각 edge의 환경 cost를 계산한다.

개념적으로:

```text
Comfort Cost =
Travel Cost
+
Heat Cost
+
Cold Cost
+
Wind Cost
+
Rain Cost
+
Snow Cost
+
Air Cost
+
Slope Cost
+
Safety Cost
```

단, 모든 weight는 고정되지 않는다.

---

# 27. Dynamic Weight Engine

최종 weight:

```text
W =
City DNA
×
Season Modifier
×
Current Weather Modifier
×
User Profile Modifier
×
Route Mode Modifier
```

예:

Minneapolis + January + -15°F + strong NW wind:

```text
coldWeight ↑↑
windWeight ↑↑
sunBenefit ↑
shadeBenefit ↓
```

Seattle + November + heavy rain:

```text
rainWeight ↑↑↑
coveredWalkBenefit ↑↑
heatWeight ↓
```

Phoenix + July + 110°F:

```text
heatWeight ↑↑↑
solarWeight ↑↑↑
shadeBenefit ↑↑↑
```

---

# 28. Comfort Score

사용자에게는 이해하기 쉬운 0~100 점수를 제공한다.

```text
0   dangerous/uncomfortable
50  moderate
100 excellent
```

하지만 route optimization 내부에서는 raw cost를 사용한다.

UI Score와 Routing Cost를 동일한 값으로 만들지 않는다.

---

# 29. Route Modes

MVP:

```ts
type RouteMode =
  | "fast"
  | "comfort"
  | "cool"
  | "warm"
  | "dry"
  | "sheltered";
```

도시/상황에 따라 사용자에게 일부만 보여준다.

예:

Phoenix:

Fast
Comfort
Cool

Seattle 비 오는 날:

Fast
Comfort
Dry

Minneapolis 겨울:

Fast
Comfort
Warm

Chicago 강풍:

Fast
Comfort
Sheltered

---

# 30. Adaptive UI

앱의 route option을 고정시키지 않는다.

잘못된 예:

```text
Fast
Cool
Warm
Dry
Wind
Snow
```

항상 6개 표시.

올바른 방식:

현재 환경을 평가해서 관련 옵션만 노출한다.

예:

```text
Fastest
Most Comfortable
Stay Dry
```

또는:

```text
Fastest
Most Comfortable
Stay Warm
```

---

# 31. Comfort Map

장기적으로 핵심 differentiator다.

지도 전체의 pedestrian segment를 comfort score로 표현한다.

레이어 예:

```text
Comfort
Heat
Shade
Wind
Rain
Snow
AQI
```

사용자는 목적지를 입력하지 않아도 주변 환경을 볼 수 있다.

---

# 32. Predictive Routing

ComfortOS는 결국 **4D Routing** 시스템이어야 한다.

```text
latitude
longitude
elevation
time
```

현재 상태뿐 아니라 future timestamp를 입력할 수 있어야 한다.

API 설계 단계부터 반드시:

```ts
getRoute({
  origin,
  destination,
  departureTime
})
```

형태로 만든다.

`departureTime`을 나중에 추가하는 구조로 설계하지 않는다.

---

# 33. Route Time Simulation

중요:

20분 걷는 경로의 모든 edge를 출발 시점 날씨 하나로 평가하면 안 된다.

예:

3:00 출발.

edge A 도착:

3:01

edge B:

3:05

edge C:

3:13

각 segment의 예상 도달시간을 기반으로 environmental state를 계산할 수 있도록 architecture를 설계한다.

초기 MVP에서는 일정 시간 bucket으로 근사해도 된다.

---

# 34. User Profiles

초기:

```text
Default
Heat Sensitive
Cold Sensitive
Wheelchair
Runner
Dog Walk
```

각 profile은 weight modifier다.

사용자의 의료정보를 요구하지 않는다.

예:

```ts
coldSensitive.windPenalty *= 1.3;
```

---

# 35. Accessibility

Wheelchair mode에서는 comfort보다 먼저 accessibility constraint를 만족해야 한다.

예:

```text
stairs → prohibited
inaccessible curb → prohibited
excessive slope → heavy penalty or prohibited
```

OSM은 kerb, incline, wheelchair, surface 등의 pedestrian 관련 속성을 제공할 수 있으므로 이를 graph schema에 보존한다.

---

# 36. Health/Safety Principle

ComfortOS는 의료 진단 앱이 아니다.

다음과 같이 표현한다.

Good:

```text
High heat exposure expected.
Consider a shaded route.
```

Bad:

```text
You will get heat stroke.
```

공식 NWS alert가 있다면 자체 AI 경고보다 공식 alert를 우선 노출한다.

NWS는 watches, warnings, advisories 등의 alerts API도 제공한다.

---

# 37. AI Explanation Layer

LLM은 route 선택을 결정하지 않는다.

Routing Engine이 결과를 만든다.

그 후 AI가 설명한다.

입력:

```json
{
  "routeDifferenceMinutes": 3,
  "shadeImprovement": 0.32,
  "windReduction": 0.41
}
```

출력:

```text
This route takes about 3 minutes longer,
but keeps you in shade for most of the walk
and reduces estimated wind exposure.
```

AI는 숫자를 만들어내지 않는다.

---

# 38. Confidence System

모든 derived environment score는 가능하면 confidence를 가져야 한다.

예:

```ts
{
  windExposure: 0.72,
  confidence: 0.58
}
```

Building height가 정확한 LiDAR 기반이면 confidence ↑.

Building height가 floors 기반 추정이면 confidence ↓.

데이터가 없는데 시스템이 확신하는 것처럼 표시하지 않는다.

---

# 39. Data Provenance

모든 주요 데이터에는 source를 저장한다.

```ts
type Provenance = {
  provider: string;
  dataset?: string;
  timestamp?: string;
  confidence?: number;
};
```

AI/Codex가 외부 데이터를 추가할 때 반드시 provenance를 유지한다.

---

# 40. Recommended Repository Architecture

초기 monorepo:

```text
comfortos/

apps/
  web/
  mobile/

packages/

  shared/
    types/
    constants/

  geo/
    geometry/
    solar/
    shadows/
    bearings/

  weather/
    providers/
    normalization/
    forecasting/

  city/
    climate-dna/
    adapters/

  environment/
    shade/
    wind/
    rain/
    heat/
    cold/
    snow/
    air-quality/

  graph/
    osm/
    pedestrian/
    preprocessing/

  comfort/
    scoring/
    weights/
    profiles/

  routing/
    algorithms/
    cost-functions/
    route-comparison/

  api/
    contracts/

  ai/
    explanation/

  data/
    ingestion/
    caching/

docs/
  ARCHITECTURE_SPEC_V1.md
  DATA_SOURCES.md
  ROUTING_MODEL.md
  CITY_ADAPTERS.md
```

---

# 41. Recommended Initial Stack

## App/Web

TypeScript

React / Next.js for initial development/debugging.

모바일 앱이 본 제품이라면 이후 React Native/Expo.

## Mapping

MapLibre 또는 Mapbox 계열 검토.

vendor lock-in을 줄이기 위해 map rendering과 route engine은 분리한다.

## Geospatial backend

PostgreSQL

PostGIS

## Backend

초기에는 TypeScript 기반 backend도 가능하다.

향후 geometry/ML 처리량이 많아질 경우 Python microservice 추가.

처음부터 frontend + Node + Python + ML server를 모두 나누지 않는다.

## Routing

초기:

custom pedestrian graph + A*

또는 기존 routing engine에 custom cost architecture 결합.

장기적으로 Valhalla/GraphHopper 등도 비교한다.

---

# 42. MVP City

전국으로 시작하지 않는다.

**한 도시에서 제대로 작동하는 엔진을 만든다.**

추천 MVP 후보:

### Minneapolis

장점:

겨울 wind/cold/snow라는 차별화가 강하다.

여름 heat/shade도 테스트 가능하다.

즉 사계절 기능 검증이 가능하다.

### Seattle

Rain/Dry Route 차별화를 빠르게 보여주기 좋다.

### Phoenix

Shade/Cool Route 정확성을 가장 직관적으로 보여주기 좋다.

첫 개발도시는 한 곳만 선택한다.

Architecture는 multi-city.

Implementation은 single-city-first.

---

# 43. MVP v0

목표:

**환경 데이터 없이 pedestrian routing부터 제대로 만든다.**

완료 조건:

- 지도 표시
- 위치 검색
- origin
- destination
- pedestrian graph
- standard fastest route
- route geometry
- ETA

Comfort feature 추가 금지.

기본 경로가 불안정하면 모든 Comfort 계산이 의미가 없다.

---

# 44. MVP v1

추가:

- current weather
- temperature
- humidity
- wind
- forecast
- weather alerts
- Weather normalization

지도 상단에:

```text
Current Environment
Temperature
Wind
Conditions
```

---

# 45. MVP v2

Shade Engine.

추가:

- building footprint
- building height
- solar position
- shadow polygon
- pedestrian edge intersection
- shade ratio

결과:

Cool Route.

---

# 46. MVP v3

Wind Engine.

추가:

- edge bearing
- regional wind
- headwind
- crosswind
- building shelter heuristic

결과:

Warm/Sheltered Route.

---

# 47. MVP v4

City Climate DNA + Dynamic Weights.

같은 engine이 도시 환경에 따라 다른 route behavior를 보여주도록 한다.

---

# 48. MVP v5

Rain Exposure.

특히 Seattle adapter에서 검증.

결과:

Dry Route.

---

# 49. MVP v6

Comfort Map.

모든 visible pedestrian segments에 current comfort value를 계산한다.

---

# 50. MVP v7

Prediction.

현재 시간이 아니라 미래 departure time을 선택한다.

```text
Leave now
5:00 PM
6:00 PM
```

그림자, 날씨, comfort route가 변화해야 한다.

---

# 51. Validation Strategy

이 프로젝트는 화면이 예쁜 것으로 정확성을 판단하지 않는다.

각 엔진별 ground truth 검증이 필요하다.

Shade:

실제 현장 사진/Street View와 비교.

Wind:

weather station + 가능한 local observations와 비교.

Routing:

실제 sidewalk와 crossing 확인.

Weather:

source API와 normalized result 비교.

---

# 52. Testing Philosophy

각 엔진에 deterministic test가 있어야 한다.

예:

```text
Wind from north
pedestrian walking north
→ high headwind
```

```text
Wind from north
pedestrian walking south
→ tailwind
```

```text
Sun west
tall building west of sidewalk
→ expected shade relationship
```

AI가 만든 코드라도 test 없이 merge하지 않는다.

---

# 53. Performance

Route request마다 도시 전체 shadow polygon을 새로 생성하지 않는다.

시간 bucket cache를 사용한다.

예:

```text
shade:{tile}:{2026-08-07T15:10}
wind:{tile}:{weatherSnapshotId}
```

지도는 tile/grid 기반으로 계산한다.

---

# 54. Spatial Resolution

초기 목표:

사람이 걷는 경험을 분석하기 때문에 city-scale 평균보다 pedestrian segment level이 중요하다.

Weather resolution과 pedestrian resolution을 혼동하지 않는다.

Weather는 상대적으로 coarse.

Urban modifier는 fine.

---

# 55. Missing Data Strategy

데이터가 없다고 기능 전체를 중단하지 않는다.

예:

building height unavailable:

```text
buildingHeight = estimated
confidence = low
```

tree data unavailable:

tree contribution 제외.

snow clearing unavailable:

generic snow model 사용.

하지만 절대로 없는 데이터를 있는 것처럼 생성하지 않는다.

---

# 56. Feature Flags

실험적인 engine은 feature flag 뒤에 둔다.

```text
enableWindShelter
enableRainExposure
enableSnowRisk
enablePredictiveRouting
```

새로운 알고리즘 때문에 전체 route가 망가지지 않도록 한다.

---

# 57. Core Competitive Advantage

우리의 moat는 UI가 아니다.

다음 네 가지가 누적되어야 한다.

### 1. Segment-level environmental model

각 길이 현재 어떤 상태인지 계산하는 능력.

### 2. City adaptation

도시마다 comfort 정의를 달리하는 시스템.

### 3. Temporal prediction

시간이 바뀌면서 길의 상태가 변하는 것을 모델링.

### 4. Historical calibration

향후 실제 관측값과 사용자 데이터를 이용해 모델 정확도를 보정.

---

# 58. Long-Term Outdoor Comfort Graph

장기적으로 가장 가치 있는 자산은:

```text
Street Segment
×
Weather
×
Time
×
Urban Geometry
×
Observed Comfort
```

데이터다.

이를 **Outdoor Comfort Graph**라고 부른다.

이 데이터가 축적되면 단순 routing 앱을 넘어:

- campus planning
- urban planning
- heat resilience
- pedestrian infrastructure
- smart city
- real estate
- events

분석으로 확장할 수 있다.

---

# 59. B2C Product

사용자가 보는 것은 최대한 단순해야 한다.

```text
Where are you going?
```

목적지 입력.

결과:

```text
Fastest
12 min

Comfort
14 min
Recommended

Stay Cool
15 min
```

내부 엔진의 복잡성을 사용자에게 그대로 노출하지 않는다.

---

# 60. B2B Future

향후 별도 제품:

**ComfortOS Insights**

지도에서:

- heat exposure
- shade shortage
- wind tunnel
- rain exposure
- pedestrian comfort
- accessibility

등을 분석한다.

B2C app과 B2B analytics는 같은 environment engine을 공유한다.

---

# 61. Rules for Cursor / Codex

모든 AI coding agent는 다음을 따른다.

### Rule 1

새로운 기능을 추가하기 전에 어느 engine에 속하는지 결정한다.

### Rule 2

UI 컴포넌트에서 environmental 계산을 하지 않는다.

### Rule 3

Weather provider raw response를 routing engine에서 직접 사용하지 않는다.

항상 normalized model을 사용한다.

### Rule 4

도시 이름을 core scoring logic에 hard-code하지 않는다.

Bad:

```ts
if (city === "Seattle") ...
```

Good:

```ts
cityProfile.weights.rain
```

### Rule 5

API provider를 business logic에 강하게 결합하지 않는다.

### Rule 6

환경 모델은 deterministic하고 testable해야 한다.

### Rule 7

LLM이 routing score를 생성하지 않는다.

### Rule 8

Missing data는 confidence로 표현한다.

### Rule 9

Every feature must preserve future timestamp support.

### Rule 10

Every route must remain pedestrian-safe before comfort optimization.

---

# 62. Architectural Decision Order

충돌이 발생하면 아래 순서로 판단한다.

```text
1. Pedestrian Safety
2. Accessibility constraints
3. Data correctness
4. Environmental accuracy
5. Route quality
6. Performance
7. UX
8. Visual polish
```

예쁜 지도 때문에 geometry accuracy를 희생하지 않는다.

---

# 63. Product Decision Order

기능 제안이 들어오면 다음 질문을 한다.

### A

사용자가 실제로 다른 경로를 선택하게 만드는가?

### B

환경 정보를 더 정확하게 만드는가?

### C

도시별 차이를 더 잘 반영하는가?

### D

시간 변화에 대응하는가?

### E

향후 Outdoor Comfort Graph에 가치 있는 데이터를 추가하는가?

다섯 질문 중 대부분 No라면 우선순위를 낮춘다.

---

# 64. Initial Success Metric

초기 성공은 다운로드 수가 아니다.

첫 검증:

> 동일한 Origin/Destination에서 환경 조건이 바뀌었을 때 ComfortOS가 합리적으로 다른 경로를 선택하는가?

예:

맑음 → shaded route

추움 + 강풍 → sheltered/sunny route

폭우 → covered route

환경이 바뀌는데 경로가 항상 같다면 ComfortOS의 핵심 engine이 실패한 것이다.

---

# 65. First Technical Milestone

첫 번째 milestone:

**Pedestrian Environmental Graph Prototype**

입력:

```text
Origin
Destination
Timestamp
Weather
```

출력:

```json
{
  "fastRoute": {},
  "comfortRoute": {},
  "explanation": {
    "timeDifferenceMinutes": 2,
    "shadeDifference": 0.31,
    "windExposureDifference": -0.24
  }
}
```

처음에는 UI보다 이 JSON이 제대로 나오는 것을 목표로 한다.

---

# 66. First Repository Tasks

프로젝트를 생성한 후 가장 먼저:

1. monorepo/scaffold 생성
2. shared geospatial types 정의
3. WeatherProvider interface
4. NWS provider
5. pedestrian graph model
6. OSM ingest prototype
7. A* fastest route
8. CityProfile schema
9. Minneapolis 또는 첫 테스트 도시 profile
10. 환경 엔진용 테스트 fixture 작성

이 순서를 크게 변경하지 않는다.

---

# 67. Do Not Build Yet

초기 개발 단계에서 다음 기능은 만들지 않는다.

- 로그인
- 결제
- Premium
- Apple Watch
- Social
- AI chatbot
- achievements
- user reviews
- city leaderboard
- AR
- B2B dashboard
- complicated ML
- full CFD

Core engine을 먼저 증명한다.

---

# 68. MVP Definition of Done

MVP는 다음 상황을 실제 지도에서 보여줄 수 있을 때 완료로 간주한다.

### Scenario A — Summer

같은 출발/도착.

오후 강한 햇빛.

Fast route와 Cool route가 다르다.

Cool route가 실제로 더 높은 shade ratio를 가진다.

### Scenario B — Winter

강한 북서풍.

Fast route와 Warm/Sheltered route가 다르다.

추천 route의 estimated headwind exposure가 낮다.

### Scenario C — Rain

강수 중.

가능한 지역에서 Dry Route가 exposed walking을 줄인다.

### Scenario D — Time

같은 경로.

오전 10시와 오후 4시.

건물 그림자가 달라지고 route ranking이 변한다.

---

# 69. North Star

ComfortOS의 최종 목표는:

> **Know how every outdoor path feels before you walk it.**

이를 위해 우리는 도시를 단순한 도로 네트워크가 아니라:

```text
dynamic
time-dependent
weather-dependent
human-centered
environment
```

로 모델링한다.

---

# 70. Final Principle

어떤 기능을 만들지 고민될 때 항상 이 질문으로 돌아간다.

> **Does this help us understand how this street will feel for this person at this time?**

Yes라면 ComfortOS의 기능이다.

No라면 다른 제품의 기능일 가능성이 높다.

---

# 71. Nationwide Geographic Expansion

미국 전역 지원은 하나의 boolean으로 표현하지 않는다. 지역별 capability를 다음과 같이
분리한다.

```text
place search eligibility
walking routing eligibility
weather eligibility
environmental data deployment
environmental validation
```

50개 주와 District of Columbia는 공식 Census geography catalog에 등록한다. Mapbox 검색과
보행 경로, NWS 날씨의 provider eligibility는 전국 범위로 유지하되, building, shade,
rain-cover data가 실제 배포되지 않은 지역은 `Limited Data`로 동작해야 한다.

대규모 building data는 주 전체 단일 파일이나 도시별 adapter로 만들지 않는다. 공식 주
경계와 교차하는 bounded spatial partition으로 계획하고, immutable Overture store로
생성한다. Query service는 manifest만 먼저 읽고, 요청 경로와 교차하는 partition data만
lazy-load하며 제한된 LRU cache를 유지한다.

주 또는 metro가 catalog에 존재한다는 사실은 detailed Comfort coverage를 의미하지 않는다.
환경 데이터가 없거나 검증되지 않은 경우 다른 지역 데이터를 빌려 쓰거나 좋은 점수를
만들지 않으며, Fastest route와 실제 confidence/completeness 상태를 보존한다.
