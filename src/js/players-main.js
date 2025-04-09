import {
  loadHeaderFooter,
  mapUrlTypeToApiNamespace,
  getPrimaryName,
} from './utils.mjs';
import { getAccessToken } from './blizzAPI.js';

// --- Constants ---
const DEFAULT_URL_TYPE = 'retail';
const DEFAULT_REGION = 'us';
const API_REQUEST_TIMEOUT = 8000; // Shorter timeout for pre-check

// --- DOM Elements ---
const buttons = document.querySelectorAll('.filter-button');
const regionDropdown = document.querySelector('#region-select');
const realmDropdown = document.querySelector('#realm-select');
const realmLoadingMsg = document.querySelector('#realm-loading-message');
const characterNameInput = document.querySelector('#character-name-input');
const searchButton = document.querySelector('#search-player-button');
const errorMessageDiv = document.querySelector('#error-message');

// --- State Variables ---
let selectedButton = null;
let currentUrlType = DEFAULT_URL_TYPE;
let currentRegion = DEFAULT_REGION;
let blizzardToken = null; // Store the token for reuse

async function fetchWithTimeout(
  resource,
  options = {},
  timeout = API_REQUEST_TIMEOUT,
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response; // Return the raw response for status checking
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`API check timed out after ${timeout / 1000} seconds.`);
    }
    throw error;
  }
}

// --- Functions ---
function showError(message) {
  errorMessageDiv.textContent = message;
  errorMessageDiv.style.display = 'block';
}

function clearError() {
  errorMessageDiv.textContent = '';
  errorMessageDiv.style.display = 'none';
}

// Sets the visual state of the selected filter button and updates state
function selectGameVersionButton(buttonToSelect) {
  if (!buttonToSelect || buttonToSelect === selectedButton) return;

  if (selectedButton) {
    selectedButton.classList.remove('selected');
  }
  buttonToSelect.classList.add('selected');
  selectedButton = buttonToSelect;
  currentUrlType = selectedButton.dataset.urltype;
  triggerRealmListUpdate();
}

// Normalizes character name: lowercase, trims whitespace
function normalizeCharacterName(name) {
  return name.trim().toLowerCase();
}

// Fetches the list of realms for the specified region and game version
async function fetchRealmListForDropdown(region, urlType) {
  if (!blizzardToken) {
    throw new Error('Authentication token is missing.');
  }
  if (!region || !urlType) {
    return [];
  }

  const apiNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'dynamic'); // 'dynamic' namespace is for realm index
  if (!apiNamespacePrefix) {
    console.error(
      `[Players Page] Could not determine namespace prefix for urlType: ${urlType}`,
    );
    throw new Error(`Unsupported game version type: ${urlType}`);
  }

  const fullApiNamespace = `${apiNamespacePrefix}-${region}`;
  const apiUrl = `https://${region}.api.blizzard.com/data/wow/realm/index?namespace=${fullApiNamespace}&locale=en_US`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${blizzardToken}` },
    });

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
        console.error(`[Players Page] API Error (${response.status}) fetching realm index:`, errorBody);
        // Handle specific errors if needed (e.g., 404 might mean bad namespace/region combo)
        if (response.status === 404) {
          throw new Error(`No realms found for ${region}/${urlType} (${fullApiNamespace}). Check filters. Status: ${response.status}`);
        }
        throw new Error(errorBody.detail || errorBody.title || `Failed to fetch realms. Status: ${response.status}`);
      } catch (jsonError) {
        console.error('[Players Page] Failed to parse error response:', jsonError);
        throw new Error(`Failed to fetch realms. Status: ${response.status}`);
      }
    }
    const data = await response.json();

    if (!data || !data.realms) {
      console.warn('[Players Page] Invalid or empty response structure received from realm index API for:', fullApiNamespace);
      return [];
    }
    if (data.realms.length === 0) {
      console.warn('[Players Page] API returned 0 realms for:', fullApiNamespace);
      return [];
    }

    const realms = data.realms
      .map((realm) => {
        // Ensure realm and realm.name exist before accessing properties
        if (!realm || !realm.name || !realm.slug) {
          console.warn('[Players Page] Skipping realm due to missing data:', realm);
          return null;
        }
        const name = getPrimaryName(realm.name);
        const slug = realm.slug;

        if (!name) {
          console.warn(`[Players Page] Skipping realm after getPrimaryName resulted in null/empty name for original: ${realm.name}`);
          return null;
        }

        return { name, slug };
      })
      .filter((realm) => realm !== null)
      .filter(
        (realm) =>
          !realm.name.toLowerCase().startsWith('test realm') &&
          !realm.name.toLowerCase().startsWith('ptr') &&
          !realm.name.startsWith('US') &&
          !realm.name.includes('CWOW')
      )
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

    return realms;

  } catch (error) {
    console.error('[Players Page] Error in fetchRealmListForDropdown:', error);
    throw error;
  }
}

function populateRealmDropdown(realms) {
  realmDropdown.innerHTML = '';

  if (!realms || realms.length === 0) {
    realmDropdown.innerHTML =
      '<option value="" disabled>-- No Realms Found --</option>';
    realmDropdown.disabled = true;
    return;
  }

  realmDropdown.innerHTML = '<option value="">-- Select a Realm --</option>';

  realms.forEach((realm) => {
    const option = document.createElement('option');
    option.value = realm.slug;
    option.textContent = realm.name;
    realmDropdown.appendChild(option);
  });

  realmDropdown.disabled = false;
}

async function triggerRealmListUpdate() {
  clearError();
  realmDropdown.disabled = true;
  realmLoadingMsg.style.display = 'inline';
  realmDropdown.innerHTML = '<option value="">Loading realms...</option>';

  try {
    if (!blizzardToken) {
      blizzardToken = await getAccessToken();
      if (!blizzardToken) {
        throw new Error('Authentication failed. Cannot load realms.');
      }
    }
    const realms = await fetchRealmListForDropdown(
      currentRegion,
      currentUrlType,
    );
    populateRealmDropdown(realms);
  } catch (error) {
    console.error('Failed to update realm list:', error);
    showError(`Error loading realms: ${error.message}`);
    realmDropdown.innerHTML =
      '<option value="">-- Error Loading Realms --</option>';
    realmDropdown.disabled = true;
  } finally {
    realmLoadingMsg.style.display = 'none';
  }
}

// --- Event Listeners ---
buttons.forEach((button) => {
  button.addEventListener('click', () => selectGameVersionButton(button));
});

regionDropdown.addEventListener('change', () => {
  currentRegion = regionDropdown.value;
  triggerRealmListUpdate();
});

// --- Modified Search Button Click Handler ---
searchButton.addEventListener('click', async () => {
  clearError();

  const region = currentRegion;
  const urlType = currentUrlType;
  const realmSlug = realmDropdown.value;
  const rawCharacterName = characterNameInput.value;

  // --- Basic Input Validation ---
  if (!urlType || !region || !realmSlug || !rawCharacterName) {
    showError(
      'Please select game version, region, realm, and enter a character name.',
    );
    if (!realmSlug) realmDropdown.focus();
    else if (!rawCharacterName) characterNameInput.focus();
    return;
  }
  const characterName = normalizeCharacterName(rawCharacterName);
  if (!characterName) {
    showError('Character name cannot be empty or just spaces.');
    characterNameInput.focus();
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = 'Verifying...';
  let characterExists = false;

  try {
    // Ensure token is available
    if (!blizzardToken) {
      blizzardToken = await getAccessToken();
    }
    if (!blizzardToken) {
      throw new Error('Authentication failed. Cannot verify player.');
    }

    const profileNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'profile');
    if (!profileNamespacePrefix) {
      throw new Error(
        `Invalid game version type for profile check: ${urlType}`,
      );
    }
    const fullProfileNamespace = `${profileNamespacePrefix}-${region}`;

    // Construct the basic profile URL
    const checkUrl = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}?namespace=${fullProfileNamespace}&locale=en_US`;

    const checkResponse = await fetchWithTimeout(checkUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${blizzardToken}` },
    });

    // Check the status
    if (checkResponse.ok) {
      // Status 200-299
      characterExists = true;
    } else if (checkResponse.status === 404) {
      characterExists = false;
      showError(
        `Player "${rawCharacterName}" on realm "${realmDropdown.options[realmDropdown.selectedIndex].text}" (${region.toUpperCase()}) not found. Please check the spelling, realm, and region.`,
      );
    } else {
      let errorDetail = `API Error ${checkResponse.status}`;
      try {
        const errorBody = await checkResponse.json();
        errorDetail = errorBody.detail || errorBody.title || errorDetail;
      } catch (e) {
      }
      throw new Error(`Verification failed: ${errorDetail}`);
    }
  } catch (error) {
    console.error('Error during player pre-check:', error);
    showError(`Error verifying player: ${error.message}`);
    characterExists = false;
  } finally {
    searchButton.disabled = false; // Re-enable button
    searchButton.textContent = 'Search Player';
  }

  // --- Proceed to Redirect ONLY if Character Exists ---
  if (characterExists) {
    const params = new URLSearchParams();
    params.append('region', region);
    params.append('urlType', urlType);
    params.append('realmSlug', realmSlug);
    params.append('characterName', characterName);

    const detailPageUrl = `/player-details/?${params.toString()}`;
    window.location.href = detailPageUrl;
  }
});

// --- Initialization ---
async function initializePage() {
  loadHeaderFooter();

  regionDropdown.value = DEFAULT_REGION;
  const defaultButton = document.querySelector(
    `.filter-button[data-urltype="${DEFAULT_URL_TYPE}"]`,
  );
  if (defaultButton) {
    defaultButton.classList.add('selected');
    selectedButton = defaultButton;
  } else {
    console.error('Could not find default game version button!');
    if (buttons.length > 0) {
      buttons[0].classList.add('selected');
      selectedButton = buttons[0];
      currentUrlType = selectedButton.dataset.urltype;
    }
  }

  console.log('Player search page initialized.');
  console.log(
    `Initial State: Region=${currentRegion}, UrlType=${currentUrlType}`,
  );

  await triggerRealmListUpdate();
}

document.addEventListener('DOMContentLoaded', initializePage);
