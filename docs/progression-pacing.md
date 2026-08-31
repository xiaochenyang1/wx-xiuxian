# Early Progression Pacing

This baseline uses the current local configuration with 100% online efficiency,
no equipment, technique, cave, partner, sect, or other bonuses. Each duration
is the cumulative time spent filling the experience bar for the preceding
levels. The Lv.8 task grants the first breakthrough pill automatically.

| Milestone | Cumulative time | Notes |
| --- | ---: | --- |
| Reach Lv.3 | 4m 19s | Lv.3 newcomer task completes |
| Reach Lv.5 | 10m 58s | Lv.5 newcomer task completes |
| Reach Lv.8 | 24m 03s | Lv.8 task grants breakthrough pill x1 |
| Reach Lv.10 | 34m 26s | The first realm bottleneck is next |
| Fill Lv.10 and become breakthrough-ready | 40m 05s | Consume pill x1 to enter Lv.11 |
| Reach Lv.11 | 40m 05s | Partner and cave unlock immediately |

The underlying calculations are derived from `requiredExperienceForLevel` and
`calculateOnlineExperiencePerSecond` in `shared/src/domain/progression.ts`.
The durations are rounded to the nearest second for display; tests should assert
state transitions rather than these rounded presentation values.
