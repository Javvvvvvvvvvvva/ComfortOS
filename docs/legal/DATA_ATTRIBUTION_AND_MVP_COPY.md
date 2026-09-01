# ComfortOS Data Attribution And MVP Copy

Date: 2026-08-16
Status: Engineering inventory; legal review required before beta

## Required Data Attribution

### Basemap And OSM-Derived Data

The current map visibly displays `© OpenStreetMap contributors`. Keep attribution visible,
legible, and linked as required by the selected production map renderer/provider. The
[OpenStreetMap copyright page](https://www.openstreetmap.org/copyright) describes ODbL
licensing and attribution. The public tile service is a separate operational issue: the
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) states that
community tile servers are best-effort infrastructure without an SLA and may block use.

Covered pedestrian extracts derived from OSM must retain source date/query and ODbL
attribution. Review whether any published derivative database triggers ODbL share-alike
obligations; do not treat map attribution alone as the entire data-compliance review.

### Overture Buildings

Overture buildings are ODbL data. Follow the official
[Overture attribution guidance](https://docs.overturemaps.org/attribution/) and retain the
release, manifest source metadata, and upstream contributor information. The official
[buildings guide](https://docs.overturemaps.org/guides/buildings/) identifies the buildings
theme and licensing context.

Recommended product/legal attribution for the current building-derived analysis:

```text
Building data © OpenStreetMap contributors and Overture Maps Foundation, with additional
sources identified in the deployed Overture release metadata.
```

The precise production wording must be checked against the active release's upstream
attribution file because Overture building sources can include additional contributors.

### National Weather Service

Label official alerts as National Weather Service alerts and preserve their official event
and headline semantics. NWS data is generally public domain unless noted, but the
[NWS disclaimer](https://www.weather.gov/DISCLAIMER.PHP) still applies. The
[NWS API documentation](https://www.weather.gov/documentation/services-web-api) requires an
identifying User-Agent and describes usage expectations.

### Mapbox

Mapbox route data remains behind the normalized routing interface. Production use must
follow the account plan and API terms associated with the deployed token. Configure and
restrict the credential using the official
[Mapbox token guidance](https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/).

## Consumer Safety Copy

The route screen should keep this concise statement visible once a route exists:

```text
Outdoor conditions are estimates and can change. Official weather alerts take priority.
```

Route explanations should use relative language such as `more comfortable`, `less exposed`,
`more sheltered`, `lower estimated exposure`, and `estimated building shade`.

Do not claim:

- a safe or safest outdoor route;
- flood, heat, wind, or weather protection;
- medical risk, WBGT, measured solar radiation, or certified shelter;
- that `Stay Cool` makes extreme heat safe;
- that `Stay Dry` makes flooding or severe weather safe.

Official warnings must visually and semantically outrank ordinary Comfort recommendations.
The implemented alert block uses `role="alert"` and assertive announcement before normal
route recommendation content.

## Required Launch Pages

| Artifact | Current state | Owner/gate |
| --- | --- | --- |
| Privacy Policy | missing | legal/privacy review, P0 |
| Terms of Use | missing | legal review, P0 |
| Data attribution page | this inventory exists; consumer page missing | product/legal, P0 |
| Environmental-estimate disclaimer | implemented in route UI | product/legal wording review |
| Contact/support route | missing | operations, P0 |
| Provider/data source inventory | documented here and in Stage 10 audit | engineering complete |

Do not publish legal pages that promise deletion, retention, availability, route safety, or
provider behavior until those promises are implemented and reviewed.
