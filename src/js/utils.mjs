export async function renderWithTemplate(
  templateFn,
  parentElement,
  data,
  callback,
  position = 'afterbegin',
  clear = true,
) {
  if (clear) {
    parentElement.innerHTML = '';
  }
  const htmlString = await templateFn(data);
  parentElement.insertAdjacentHTML(position, htmlString);
  if (callback) {
    callback(data);
  }
}

function loadTemplate(path) {
  // currying
  return async function () {
    const res = await fetch(path);
    if (res.ok) {
      const html = await res.text();
      return html;
    }
    console.error(`Failed to load template: ${path}`);
    return '<p>Error loading template</p>';
  };
}

export async function loadHeaderFooter() {
  const headerTemplateFn = loadTemplate('/partials/header.html');
  const footerTemplateFn = loadTemplate('/partials/footer.html');
  const headerHTML = document.querySelector('#main-header');
  const footerHTML = document.querySelector('#main-footer');
  // Ensure elements exist before rendering
  if (headerHTML) {
    renderWithTemplate(headerTemplateFn, headerHTML);
  } else {
    console.warn('Header element (#main-header) not found.');
  }
  if (footerHTML) {
    renderWithTemplate(footerTemplateFn, footerHTML);
  } else {
    console.warn('Footer element (#main-footer) not found.');
  }
}

/**
 * Maps the full API namespace string to a simplified URL-friendly type identifier.
 * Used by realms.js to create links.
 * Example: 'dynamic-us' -> 'retail', 'dynamic-classic-eu' -> 'classic'
 * @param {string} apiNamespace The full namespace like 'dynamic-us', 'dynamic-classic-eu', 'dynamic-classic1x-kr'
 * @returns {string} The URL type like 'retail', 'classic', 'classicera', or 'unknown'
 */
export function mapApiNamespaceToUrlType(apiNamespace) {
  if (!apiNamespace) return 'unknown';

  if (apiNamespace.startsWith('dynamic-classic1x')) {
    return 'classicera';
  } else if (apiNamespace.startsWith('dynamic-classic')) {
    return 'classic'; // Covers Cata (and potentially future classic expansions)
  } else if (apiNamespace.startsWith('dynamic')) {
    return 'retail';
  }

  // Fallback for unrecognized namespaces
  console.warn(`Unknown API namespace encountered: ${apiNamespace}`);
  return 'unknown';
}

/**
 * Maps a simple URL type string ('retail', 'classic', 'classicera')
 * back to the corresponding Blizzard API namespace *prefix*.
 * Used by realm-detail.js and player-details.js to query the correct API endpoint.
 * @param {string} urlType - 'retail', 'classic', or 'classicera'.
 * @param {string} apiType
 * @returns {string|null}
 */
export function mapUrlTypeToApiNamespace(urlType, apiType = 'dynamic') {
  // Default to 'dynamic' for backwards compatibility, just in case
  const map = {
    dynamic: {
      retail: 'dynamic',
      classic: 'dynamic-classic', // Cataclysm uses 'classic,' but so will WOTLK and others when it comes time
      classicera: 'dynamic-classic1x',
    },
    profile: {
      retail: 'profile',
      classic: 'profile-classic',
      classicera: 'profile-classic1x',
    },
    static: {
      retail: 'static',
      classic: 'static-classic',
      classicera: 'static-classic1x',
    },
  };

  const prefix = map[apiType]?.[urlType];

  if (!prefix) {
    console.error(
      `Could not map urlType '${urlType}' for apiType '${apiType}' to a namespace prefix.`,
    );
    return null; // Return null explicitly on failure
  }

  return prefix;
}

/**
 * Gets a displayable name from a localized name object (like those returned by Blizzard API).
 * Prefers 'en_US', falls back to the first available locale if en_US is missing.
 * @param {object|string} nameData
 * @param {string} [preferredLocale='en_US'] - The ideal locale to use (currently only uses en_US as primary fallback).
 * @returns {string}
 */
export function getPrimaryName(nameData, preferredLocale = 'en_US') {
  if (!nameData) return 'N/A';

  // If it's already a string, just return it
  if (typeof nameData === 'string') {
    return nameData;
  }

  // If it's an object, try preferred (currently hardcoded to en_US as primary target)
  if (typeof nameData === 'object') {
    if (nameData['en_US']) {
      return nameData['en_US'];
    }
    // Fallback: Try the locale passed as preferredLocale, if different from en_US
    if (preferredLocale !== 'en_US' && nameData[preferredLocale]) {
      return nameData[preferredLocale];
    }
    // Fallback: Get the first key/value pair in the object
    const firstLocaleKey = Object.keys(nameData)[0];
    if (firstLocaleKey) {
      return nameData[firstLocaleKey];
    }
  }

  // If it's neither a string nor a valid object, or the object is empty
  return 'N/A';
}

/**
 * @deprecated Prefer using getPrimaryName for more general use.
 * Gets the primary name of a realm from its localized name object.
 * Prefers the provided locale, falls back to en_US, then takes the first available.
 * @param {object} nameObject The localized name object (e.g., { en_US: '...', es_MX: '...' })
 * @param {string} preferredLocale The desired locale (e.g., 'en_US')
 * @returns {string} The realm name or 'Unknown Realm'
 */
export function getPrimaryRealmName(nameObject, preferredLocale = 'en_US') {
  if (!nameObject || typeof nameObject !== 'object') return 'Unknown Realm';
  if (nameObject[preferredLocale]) return nameObject[preferredLocale];
  if (nameObject['en_US']) return nameObject['en_US'];
  // Fallback to the first available locale if others fail
  const firstLocale = Object.keys(nameObject)[0];
  return nameObject[firstLocale] || 'Unknown Realm';
}

/**
 * @param {string} param The name of the query parameter to retrieve.
 * @returns {string|null} The value of the parameter, or null if not found.
 */
export function getParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Converts a string into a URL-friendly slug.
 * Lowercases, replaces spaces with hyphens, removes non-alphanumeric chars (except hyphens).
 * @param {string} text The text to slugify.
 * @returns {string} The slugified text.
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars except -
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}
