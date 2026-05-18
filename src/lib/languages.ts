// The target languages offered by per-message translation (M60). Shared by the
// translate API and the message UI, so it lives outside $lib/server. The model
// handles named languages well; this list just bounds the picker and the API
// input.
export const TRANSLATE_LANGUAGES = [
	'English',
	'Spanish',
	'French',
	'German',
	'Mandarin Chinese',
	'Hindi',
	'Arabic',
	'Portuguese'
] as const;
