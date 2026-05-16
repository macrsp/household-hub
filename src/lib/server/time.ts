/** The current time as an ISO 8601 string, e.g. "2026-05-16T12:34:56.789Z". */
export function nowIso(): string {
	return new Date().toISOString();
}
