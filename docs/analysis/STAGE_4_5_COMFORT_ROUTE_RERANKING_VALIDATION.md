# Stage 4.5 Comfort Route Reranking Validation

Date: 2026-08-10

## Scope

This validates OSRM alternative-route reranking with raw `RouteComfortCost`. It does not validate custom A*, Climate DNA route names, rain/snow/AQI routing, or user personalization.

## Synthetic Tests

Implemented in `tests/comfort-routing.test.ts`:

- A: lower raw-cost alternative within detour policy becomes Comfort.
- B: excessive detour remains Fastest.
- C: incomplete alternative cannot become Comfort.
- E: 1% raw-cost improvement does not force a separate Comfort route.
- F: faster and lower-cost candidate can be both Fastest and Comfort.

Implemented in `tests/routing.test.ts`:

- Multiple OSRM alternatives normalize into route candidates.
- Nearly identical route geometry deduplicates.

## Default Policy

```text
max extra duration: 5 minutes
max extra duration ratio: 35%
max extra distance ratio: 35%
minimum environmental cost reduction: 8%
dedupe overlap threshold: 92%
```

## Live Minneapolis Validation

Departure timestamp used for validation:

```text
2026-08-10T18:00:00.000Z
```

All five searches returned two normalized OSRM candidates after deduplication.

| Scenario | Candidates | Fastest min | Alternative min | Raw costs | Scores | Comparable | Selected Comfort | Differs? |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |
| Downtown dense blocks | 2 | 16.3 | 16.3, 16.4 | 5.982, 6.136 | 92, 92 | yes, yes | Fastest | no |
| University area | 2 | 16.4 | 16.4, 16.7 | 6.981, 7.098 | 91, Limited data | yes, no | Fastest | no |
| River/open exposure | 2 | 20.6 | 20.6, 21.1 | 0, 0 | Limited data, Limited data | no, no | Fastest | no |
| Residential | 2 | 12.0 | 12.0, 12.0 | 0, 0 | Limited data, Limited data | no, no | Fastest | no |
| Bridge/open route | 2 | 16.0 | 16.0, 16.0 | 9.917, 9.969 | Limited data, Limited data | no, no | Fastest | no |

Fastest and Comfort differed in:

```text
0 / 5 searches = 0%
```

This was not tuned away. In the live samples, alternatives were either higher raw cost or incomplete/non-comparable.

## Route Overlap

Observed alternative overlap ratios:

```text
Downtown: 40.9%
University: 25.6%
River/open: 53.6%
Residential: 41.8%
Bridge/open: 45.1%
```

No live candidate exceeded the 92% deduplication threshold in this run.

## Policy Sensitivity

Using the already-analyzed live candidate results:

| Policy | Separate Comfort routes |
| --- | ---: |
| max +2 min | 0 / 5 |
| max +5 min | 0 / 5 |
| max +10 min | 0 / 5 |

Changing detour allowance did not change selection because no live alternative both remained comparable and achieved meaningful raw-cost improvement.

## Meaningful-Improvement Sensitivity

Using the same live candidates:

| Threshold | Separate Comfort routes |
| --- | ---: |
| 1% lower raw cost | 0 / 5 |
| 5% lower raw cost | 0 / 5 |
| 8% lower raw cost | 0 / 5 |
| 15% lower raw cost | 0 / 5 |

The live alternatives did not beat Fastest on raw environmental cost. Lowering the threshold would not have changed selection for these samples.

## Performance

Observed end-to-end server timings from `comparison.debug.performanceMs`:

| Scenario | Routing | Weather | Candidate analysis | Reranking | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Downtown dense blocks | 471 ms | 0 ms | 470 ms | 0 ms | 942 ms |
| University area | 156 ms | 634 ms | 24,774 ms | 0 ms | 25,564 ms |
| River/open exposure | 418 ms | 1,430 ms | 25,826 ms | 0 ms | 27,674 ms |
| Residential | 429 ms | 952 ms | 24,808 ms | 0 ms | 26,190 ms |
| Bridge/open route | 426 ms | 815 ms | 24,464 ms | 1 ms | 25,707 ms |

Candidate analysis is the bottleneck. The main cost is provider-backed shade/wind building analysis per route candidate.

Future calibration should rerun the pure selector against already-analyzed candidates instead of recomputing environmental analysis for each policy variant.

## Judgment

Stage 4.5 reranking behavior is correct for the audited contract:

- incomplete candidates did not win
- rounded scores did not drive selection
- raw cost preserved ordering
- Fastest remained independently identifiable
- Fastest and Comfort were legitimately the same route in all live samples

The major limitation is that OSRM alternatives were not environmentally better in this live sample. That supports deferring custom graph routing, but it also shows why Stage 5 should focus on better candidate generation or route-corridor expansion before adding consumer-facing route modes.
