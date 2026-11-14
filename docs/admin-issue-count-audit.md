# Admin issue-count audit — 14 November 2026

Rule: problem events must not be interpreted as a count of failed player actions. A slow action and its recovery are separate events; retransmitting the same delivery must not create another event. Admin retains its existing latest-two-release, app-only and excluded-device filters. Historical records remain unchanged.

## Places read in this audit

| Place | Result |
| --- | --- |
| `useMultiplayerGame` issue emitter and lock deadline, roll/lock/score/forfeit paths | Reports slow responses, recovery, failed responses and discrepancies separately. Friend and quick online matches share these paths. One attempt can legitimately emit slow and recovered events. No erroneous failure-only counter found. |
| `analytics.ts` enqueue, flush, reload and page-hide handling | `mp_issue` has durable storage and a stable delivery ID through retries. Original occurrence timestamp survives in metadata. Queue is bounded and storage is best effort, so completeness is not guaranteed. |
| `log_analytics_events`, migration 0131 | Unique device/event/delivery-ID receipt deduplicates new retries, not distinct events belonging to one action. Legacy ID-less rows are preserved. |
| Live `admin_daily_stats_v3` | Counts stored `mp_issue` events using app platforms, excluded devices and the current latest two releases, not distinct attempts or failures. Groups by server receipt date in Stockholm time. |
| Live `admin_daily_extra_stats` | Counts distinct affected app devices, using the same two-release rule and exclusions. Distinct devices are not summed between days. |
| `admin_daily_stats_v4`–`v8` wrappers and `admin-analytics` handler | Pass through the event counter; handler selects v8. No additional failure-only aggregation. Wrapper definitions covered by migration 0114, 0124 and 0125 and the live v8 definition. |
| `AdminPage` table and affected-device subline | Labels the metric Problemhändelser, not failed actions; includes latest-two-version scope and a separate device count. |
| `admin-records` cell values, means and record selection; `AdminPage` total | Use the same event counts without attempt deduplication. Event totals may be summed; affected devices are not summed. |
| `AdminLineChart` controls, data and tooltip | Uses the same `issues` field supplied to the table. Label is Problemhändelser, not failures. |
| Live `internal_cleanup_diagnostics` daily job | Existing 30-day diagnostic retention unchanged. It deletes expired events, not failed actions only. |
| `delete_player_data` | Existing device-bound analytics deletion also removes delivery IDs; no separate identity ledger added. |
| Local gameplay, Home, waiting room and non-admin player statistics | Search found no independent `mp_issue` counter or display. No changes needed to those flows. |

## Validation

41 tests passed across analytics diagnostics, isolated SQL delivery receipts, admin issue versions, extra statistics and record calculations. No live test events were inserted. Live definitions and today's event breakdown were read; no new authenticated browser check was performed in this audit.

At the preceding read, iOS 5.7 and 5.8 accounted for 24 events: 11 slow locks, 7 slow rolls, 5 recovered rolls and 1 slow score submission. Android 2.3 contributed 14 additional events, including one reported roll failure. These are different scopes, not evidence of miscounting. The seven associated games had status finished; that does not by itself prove every action succeeded or that none of the games ended by forfeit.

No new counting defect was established, so gameplay, permissions, filters, existing settings and historical data were not changed. Physical-device transport delay remains unverified as documented in the earlier diagnostic sweep.