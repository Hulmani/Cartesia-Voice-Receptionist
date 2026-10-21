# Persistent fictional clinic booking

Scope: replace browser-owned appointments in Steps 3 and 4 with a shared D1 calendar. Keep explicit button confirmation, existing voice pipeline, diagnostics, and asset validation. No external clinic integration or real patient data.

Storage: appointment_slots holds immutable dated resources. appointment_bookings holds slot, fixed Demo Patient, timestamp, reference, and unique idempotency key. One unique slot per booking and unique therapist/date/time per slot. Slots are seeded idempotently for the next seven calendar days (weekdays only) through an explicit same-origin initialize action; migrations contain schema only. Existing dated slots are never moved or cleared on refresh.

Access: the existing confirmed owner-private Sites boundary protects the shared demo calendar. Same-origin JSON required for writes. No client-owned state accepted by the conversation backend. Do not make this endpoint public without adding appropriate authorization.

Flow: load/initialize calendar; Gemini reads current server availability and only proposes slots; confirmation uses an idempotency key preserved in sessionStorage across refresh. Atomic INSERT with conflict handling chooses exactly one winner. Retry with the same key returns the original reference; a reused key for another slot is rejected. Confirmation retries remain separate from speech retries. Never infer that an interrupted request was rolled back.

UI: dated calendar groups, available/booked labels, refresh and last-checked time, confirmation and persistent reference. Loading/empty/error states and a reload/retry action. No destructive reset. Conversation reset only clears conversation. Unknown confirmation outcome preserves pending retry on refresh.

Verification: real SQLite schema/repository tests plus local D1 migration, parallel slot contention, idempotent replay including after reconnection, invalid IDs and stale slots, database outage sanitization, authoritative availability, existing audio/diagnostic tests, TypeScript, build, all four VAD artifacts. Publish privately and verify API reads and artifact availability. Real phone microphone QA remains manual.
