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
  };
}

export async function loadHeaderFooter() {
  const headerTemplateFn = loadTemplate('/partials/header.html');
  const footerTemplateFn = loadTemplate('/partials/footer.html');
  const headerHTML = document.querySelector('#main-header');
  const footerHTML = document.querySelector('#main-footer');
  renderWithTemplate(headerTemplateFn, headerHTML);
  renderWithTemplate(footerTemplateFn, footerHTML);
}

/**
 * Maps the API namespace fragment to a URL-friendly type identifier.
 * @param {string} apiNamespace The namespace like 'dynamic', 'dynamic-classic', 'dynamic-classic1x'
 * @returns {string} The URL type like 'retail', 'classic', 'classicera'
 */
export function mapApiNamespaceToUrlType(apiNamespace) {
  // Extract the core part (e.g., 'dynamic', 'dynamic-classic')
  const baseNamespace = apiNamespace.split('-')[0];
  switch (baseNamespace) {
    case 'dynamic':
      // Need to differentiate retail, classic (wrath/cata), classic1x
      if (apiNamespace.includes('classic1x')) return 'classicera';
      if (apiNamespace.includes('classic')) return 'classic'; // Might adjust this if other classic builds come out like MOP or WOTLK again, etc...
      return 'retail';

    default:
      return 'unknown';
  }
}

/**
 * Maps the URL type back to the API namespace fragment (prefix).
 * @param {string} urlType The URL type like 'retail', 'classic', 'classicera'
 * @returns {string} The API namespace prefix like 'dynamic', 'dynamic-classic', 'dynamic-classic1x'
 */
export function mapUrlTypeToApiNamespace(urlType) {
  switch (urlType) {
    case 'retail':
      return 'dynamic';
    case 'classic':
      return 'dynamic-classic';
    case 'classicera':
      return 'dynamic-classic1x';
    default:
      return 'dynamic';
  }
}

/**
 * Gets the primary name of a realm from its localized name object.
 * Prefers the provided locale, falls back to en_US, then takes the first available.
 * @param {object} nameObject The localized name object (e.g., { en_US: '...', es_MX: '...' })
 * @param {string} preferredLocale The desired locale (e.g., 'en_US')
 * @returns {string} The realm name or 'Unknown Realm'
 */
export function getPrimaryRealmName(nameObject, preferredLocale = 'en_US') {
  if (!nameObject) return 'Unknown Realm';
  if (nameObject[preferredLocale]) return nameObject[preferredLocale];
  if (nameObject['en_US']) return nameObject['en_US'];
  // Fallback to the first available locale if others fail
  const firstLocale = Object.keys(nameObject)[0];
  return nameObject[firstLocale] || 'Unknown Realm';
}

export function getParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
