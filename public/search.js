/**
 * Converts user input into a fully-qualified URL.
 * Falls back to a search engine query if the input isn't a valid URL.
 * @param {string} input
 * @param {string} template - Search URL template with %s placeholder
 * @returns {string}
 */
function search(input, template) {
  input = input.trim();

  // Try parsing as a full URL
  try {
    const url = new URL(input);
    return url.href;
  } catch {}

  // Try prepending https://
  try {
    const url = new URL("https://" + input);
    if (url.hostname.includes(".")) {
      return url.href;
    }
  } catch {}

  // Fall back to search engine
  return template.replace("%s", encodeURIComponent(input));
}
