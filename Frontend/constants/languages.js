export const LANGUAGES = [
  { id: 1, name: "English",   code: "en", flag: "🇺🇸" },
  { id: 2, name: "Italian",   code: "it", flag: "🇮🇹" },
  { id: 3, name: "German",    code: "de", flag: "🇩🇪" },
  { id: 4, name: "French",    code: "fr", flag: "🇫🇷" },
  { id: 5, name: "Spanish",   code: "es", flag: "🇪🇸" },
  { id: 6, name: "Bulgarian", code: "bg", flag: "🇧🇬" },
  { id: 7, name: "Greek",     code: "el", flag: "🇬🇷" },
  { id: 8, name: "Turkish",   code: "tr", flag: "🇹🇷" },
  { id: 9, name: "Korean",    code: "ko", flag: "🇰🇷" },
  { id: 10, name: "Russian",  code: "ru", flag: "🇷🇺" },
];

export function findLanguageById(id) {
  return LANGUAGES.find((l) => l.id === Number(id)) || null;
}

export function findLanguageByName(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  return LANGUAGES.find((l) => l.name.toLowerCase() === normalized) || null;
}
