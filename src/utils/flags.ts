/**
 * Converts ISO 3166-1 alpha-2 country code to flag emoji.
 * e.g. "BR" -> "🇧🇷"
 */
export function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
