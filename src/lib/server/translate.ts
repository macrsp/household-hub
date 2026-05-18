// Translation helpers (M60). The route at POST /api/assist/translate asks
// Workers AI to translate a message; this module validates the requested
// target language against the supported set.
import { TRANSLATE_LANGUAGES } from '../languages';

// Resolve a requested target language to one of the supported names,
// case-insensitively. Falls back to English for anything unrecognised.
export function resolveLanguage(to: unknown): string {
	if (typeof to !== 'string') return 'English';
	const want = to.trim().toLowerCase();
	return TRANSLATE_LANGUAGES.find((l) => l.toLowerCase() === want) ?? 'English';
}
