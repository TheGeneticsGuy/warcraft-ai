// src/js/players-main.js
import {
  loadHeaderFooter,
  mapUrlTypeToApiNamespace,
  getPrimaryName,
} from './utils.mjs';
import { getAccessToken } from './blizzAPI.js'; // Now needed for realm list AND pre-check

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

// --- Helper: Simplified Fetch with Timeout for Pre-check ---
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
    throw error; // Re-throw other network errors
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
    console.error('Cannot fetch realm list: Missing access token.');
    throw new Error('Authentication token is missing.');
  }
  if (!region || !urlType) {
    console.error('Cannot fetch realm list: Missing region or urlType.');
    return [];
  }

  const apiNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'dynamic'); // Use dynamic for realm index
  if (!apiNamespacePrefix) {
    console.error(
      `Could not determine namespace prefix for urlType: ${urlType}`,
    );
    throw new Error(`Unsupported game version type: ${urlType}`);
  }

  const fullApiNamespace = `${apiNamespacePrefix}-${region}`;
  const apiUrl = `https://${region}.api.blizzard.com/data/wow/realm/index?namespace=${fullApiNamespace}&locale=en_US`;

  console.log(`Fetching realms from: ${apiUrl}`);

  try {
    // Use the basic fetch here, as we want the JSON directly
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${blizzardToken}` },
    });

    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: `HTTP Error ${response.status}` }));
      console.error('API Error fetching realm index:', errorBody);
      throw new Error(
        errorBody.title || `Failed to fetch realms (${response.status})`,
      );
    }
    const data = await response.json();

    if (!data.realms || data.realms.length === 0) {
      console.warn('No realms found in API response for:', fullApiNamespace);
      return [];
    }

    const realms = data.realms
      .map((realm) => ({
        name: getPrimaryName(realm.name),
        slug: realm.slug,
      }))
      .filter((realm) => realm.name !== 'N/A' && realm.slug)
      .filter(
        (realm) =>
          !realm.name?.startsWith('Test Realm') &&
          !realm.name?.startsWith('US PS'),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return realms;
  } catch (error) {
    console.error('Error in fetchRealmListForDropdown:', error);
    throw error;
  }
}

// Populates the realm dropdown
function populateRealmDropdown(realms) {
  realmDropdown.innerHTML = ''; // Clear

  if (!realms || realms.length === 0) {
    realmDropdown.innerHTML =
      '<option value="" disabled>-- No Realms Found --</option>';
    realmDropdown.disabled = true;
    return;
  }

  realmDropdown.innerHTML = '<option value="">-- Select a Realm --</option>'; // Default empty option

  realms.forEach((realm) => {
    const option = document.createElement('option');
    option.value = realm.slug;
    option.textContent = realm.name;
    realmDropdown.appendChild(option);
  });

  realmDropdown.disabled = false; // Enable
}

// Orchestrates fetching and displaying the realm list
async function triggerRealmListUpdate() {
  clearError();
  realmDropdown.disabled = true;
  realmLoadingMsg.style.display = 'inline';
  realmDropdown.innerHTML = '<option value="">Loading realms...</option>';

  try {
    if (!blizzardToken) {
      console.log('Fetching initial access token for realm list...');
      blizzardToken = await getAccessToken(); // Fetch token if needed
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
  // Make async
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

  // --- Pre-check if Character Exists ---
  searchButton.disabled = true; // Disable button during check
  searchButton.textContent = 'Verifying...'; // Provide feedback
  let characterExists = false;

  try {
    // Ensure token is available
    if (!blizzardToken) {
      console.log('Fetching access token for pre-check...');
      blizzardToken = await getAccessToken();
    }
    if (!blizzardToken) {
      throw new Error('Authentication failed. Cannot verify player.');
    }

    // Determine the correct profile namespace
    const profileNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'profile');
    if (!profileNamespacePrefix) {
      throw new Error(
        `Invalid game version type for profile check: ${urlType}`,
      );
    }
    const fullProfileNamespace = `${profileNamespacePrefix}-${region}`;

    // Construct the basic profile URL
    const checkUrl = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}?namespace=${fullProfileNamespace}&locale=en_US`;
    console.log(`Pre-checking player existence: ${checkUrl}`);

    // Use fetchWithTimeout to make the request
    const checkResponse = await fetchWithTimeout(checkUrl, {
      method: 'GET', // GET is fine, payload is small
      headers: { Authorization: `Bearer ${blizzardToken}` },
    });

    // Check the status
    if (checkResponse.ok) {
      // Status 200-299
      characterExists = true;
      console.log('Player found during pre-check.');
    } else if (checkResponse.status === 404) {
      characterExists = false;
      console.log('Player not found during pre-check (404).');
      showError(
        `Player "${rawCharacterName}" on realm "${realmDropdown.options[realmDropdown.selectedIndex].text}" (${region.toUpperCase()}) not found. Please check the spelling, realm, and region.`,
      );
    } else {
      // Handle other API errors during pre-check
      let errorDetail = `API Error ${checkResponse.status}`;
      try {
        const errorBody = await checkResponse.json();
        errorDetail = errorBody.detail || errorBody.title || errorDetail;
      } catch (e) {
        /* Ignore parsing error if body isn't JSON */
      }
      throw new Error(`Verification failed: ${errorDetail}`);
    }
  } catch (error) {
    console.error('Error during player pre-check:', error);
    showError(`Error verifying player: ${error.message}`);
    characterExists = false; // Assume not found if check fails
  } finally {
    searchButton.disabled = false; // Re-enable button
    searchButton.textContent = 'Search Player'; // Restore text
  }

  // --- Proceed to Redirect ONLY if Character Exists ---
  if (characterExists) {
    const params = new URLSearchParams();
    params.append('region', region);
    params.append('urlType', urlType);
    params.append('realmSlug', realmSlug);
    params.append('characterName', characterName); // Use normalized name

    const detailPageUrl = `/player-details/?${params.toString()}`;
    console.log(`Redirecting to: ${detailPageUrl}`);
    window.location.href = detailPageUrl;
  }
  // If character doesn't exist, the error message is already shown, and we don't redirect.
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

  // Trigger the first realm list load
  await triggerRealmListUpdate(); // This now handles token fetching internally if needed
}

document.addEventListener('DOMContentLoaded', initializePage);
