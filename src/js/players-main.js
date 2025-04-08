import { loadHeaderFooter, mapUrlTypeToApiNamespace, getPrimaryName } from './utils.mjs';
import { getAccessToken } from './blizzAPI.js';

// --- Constants ---
const DEFAULT_URL_TYPE = 'retail';
const DEFAULT_REGION = 'us';

// --- DOM Elements ---
const buttons = document.querySelectorAll('.filter-button');
const regionDropdown = document.querySelector('#region-select');
const realmDropdown = document.querySelector('#realm-select'); // The new dropdown
const realmLoadingMsg = document.querySelector('#realm-loading-message');
const characterNameInput = document.querySelector('#character-name-input');
const searchButton = document.querySelector('#search-player-button');
const errorMessageDiv = document.querySelector('#error-message');

// --- State Variables ---
let selectedButton = null; // Will be set during initialization
let currentUrlType = DEFAULT_URL_TYPE;
let currentRegion = DEFAULT_REGION;
let blizzardToken = null; // To store the fetched token

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

  // Remove selection from the previously selected button
  if (selectedButton) {
    selectedButton.classList.remove('selected');
  }

  // Add selection to the new button
  buttonToSelect.classList.add('selected');
  selectedButton = buttonToSelect;
  currentUrlType = selectedButton.dataset.urltype;

  // Trigger realm list update when game version changes
  triggerRealmListUpdate();
}

// Normalizes character name: lowercase, trims whitespace
function normalizeCharacterName(name) {
  return name.trim().toLowerCase();
}

async function fetchRealmListForDropdown(region, urlType) {
  if (!blizzardToken) {
    console.error("Cannot fetch realm list: Missing access token.");
    throw new Error("Authentication token is missing."); // Throw error to be caught
  }
  if (!region || !urlType) {
    console.error("Cannot fetch realm list: Missing region or urlType.");
    return []; // Return empty array if params missing
  }

  const apiNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'dynamic');

  if (!apiNamespacePrefix) {
    console.error(`Could not determine namespace prefix for urlType: ${urlType}`);
    throw new Error(`Unsupported game version type: ${urlType}`);
  }

  const fullApiNamespace = `${apiNamespacePrefix}-${region}`;
  // The endpoint remains /data/wow/realm/index
  const apiUrl = `https://${region}.api.blizzard.com/data/wow/realm/index?namespace=${fullApiNamespace}&locale=en_US`; // Using en_US for consistency

  console.log(`Fetching realms from: ${apiUrl}`); // Debug log should now show dynamic-*

  try {
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${blizzardToken}` },
    });

    if (!response.ok) {
      // Error handling remains the same, but hopefully won't hit 404 - keeps happening!!
      const errorBody = await response.json().catch(() => ({ message: `HTTP Error ${response.status}` }));
      console.error("API Error fetching realm index:", errorBody);
      throw new Error(errorBody.title || `Failed to fetch realms (${response.status})`);
    }

    const data = await response.json();

    if (!data.realms || data.realms.length === 0) {
      console.warn("No realms found in API response for:", fullApiNamespace);
      return []; // Return empty if no realms listed
    }

    // Mapping and sorting logic remains the same
    const realms = data.realms
      .map(realm => ({
        name: getPrimaryName(realm.name), // Use the utility function
        slug: realm.slug,
      }))
      .filter(realm => realm.name !== 'N/A' && realm.slug) // Ensure valid data
      .filter(realm => !realm.name?.startsWith('Test Realm') && !realm.name?.startsWith('US PS')) // Filter known test realms
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name

    return realms;

  } catch (error) {
    console.error('Error in fetchRealmListForDropdown:', error);
    // Re-throw the error so the calling function knows it failed
    throw error; // Pass the specific error up
  }
}

/**
 * Populates the realm dropdown with the provided list of realms.
 */
function populateRealmDropdown(realms) {
  realmDropdown.innerHTML = ''; // Clear existing options

  if (!realms || realms.length === 0) {
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "-- No Realms Found --";
    option.disabled = true;
    realmDropdown.appendChild(option);
    realmDropdown.disabled = true; // Keep disabled if none found
    return;
  }

  // Add a default "Select" option
  const defaultOption = document.createElement('option');
  defaultOption.value = ""; // Important: value is empty string
  defaultOption.textContent = "-- Select a Realm --";
  realmDropdown.appendChild(defaultOption);

  // Add realm options
  realms.forEach(realm => {
    const option = document.createElement('option');
    option.value = realm.slug; // The value is the slug
    option.textContent = realm.name; // The text is the user-friendly name
    realmDropdown.appendChild(option);
  });

  realmDropdown.disabled = false; // Enable the dropdown
}

/**
 * Orchestrates fetching and displaying the realm list based on current filters.
 */
async function triggerRealmListUpdate() {
  clearError(); // Clear previous errors
  realmDropdown.disabled = true; // Disable dropdown while loading
  realmLoadingMsg.style.display = 'inline'; // Show loading message
  realmDropdown.innerHTML = '<option value="">Loading realms...</option>'; // Placeholder

  try {
    // Ensure token is available, fetch if not (might happen on initial load)
    if (!blizzardToken) {
      console.log("Fetching initial access token...");
      blizzardToken = await getAccessToken();
      if (!blizzardToken) {
        throw new Error("Failed to get access token. Cannot load realms.");
      }
    }

    const realms = await fetchRealmListForDropdown(currentRegion, currentUrlType);
    populateRealmDropdown(realms);

  } catch (error) {
    console.error("Failed to update realm list:", error);
    showError(`Error loading realms: ${error.message}`);
    // Keep dropdown disabled and show an error state
    realmDropdown.innerHTML = '<option value="">-- Error Loading Realms --</option>';
    realmDropdown.disabled = true;
  } finally {
    realmLoadingMsg.style.display = 'none'; // Hide loading message regardless of outcome
  }
}


// --- Event Listeners ---

// Game Version Button Clicks
buttons.forEach(button => {
  button.addEventListener('click', () => {
    selectGameVersionButton(button); // This now triggers realm update
  });
});

// Region Dropdown Change
regionDropdown.addEventListener('change', () => {
  currentRegion = regionDropdown.value;
  // Trigger realm list update when region changes
  triggerRealmListUpdate();
});


// Search Button Click
searchButton.addEventListener('click', () => {
  clearError(); // Clear previous errors

  const region = currentRegion; // Already tracked
  const urlType = currentUrlType; // Already tracked
  const realmSlug = realmDropdown.value; // Get value (slug) from dropdown
  const rawCharacterName = characterNameInput.value;

  // --- Input Validation ---
  if (!urlType) {
    // Should not happen if buttons work, but good failsafe
    showError('Internal error: Game version not selected.');
    return;
  }
  if (!region) {
    // Should not happen if dropdown works
    showError('Internal error: Region not selected.');
    return;
  }
  if (!realmSlug) { // Check if a realm is selected (value is not "")
    showError('Please select a realm from the dropdown.');
    realmDropdown.focus();
    return;
  }
  if (!rawCharacterName) {
    showError('Please enter the character name.');
    characterNameInput.focus();
    return;
  }

  // --- Data Normalization ---
  const characterName = normalizeCharacterName(rawCharacterName);
  if (!characterName) { // Check after normalization
    showError('Character name cannot be empty or just spaces.');
    characterNameInput.focus();
    return;
  }

  // --- Construct Redirect URL ---
  const params = new URLSearchParams();
  params.append('region', region);
  params.append('urlType', urlType);
  params.append('realmSlug', realmSlug); // Use the selected slug
  params.append('characterName', characterName);

  const detailPageUrl = `/player-details/?${params.toString()}`;
  console.log(`Redirecting to: ${detailPageUrl}`);
  window.location.href = detailPageUrl;
});

// --- Initialization ---
async function initializePage() {
  loadHeaderFooter(); // Load header/footer first

  // Set initial default selections in the UI
  regionDropdown.value = DEFAULT_REGION;
  const defaultButton = document.querySelector(`.filter-button[data-urltype="${DEFAULT_URL_TYPE}"]`);
  if (defaultButton) {
    // Select the button visually *without* triggering the event listener's realm update yet
    defaultButton.classList.add('selected');
    selectedButton = defaultButton;
  } else {
    console.error("Could not find default game version button!");
    // Fallback: select the first button if default isn't found
    if (buttons.length > 0) {
      buttons[0].classList.add('selected');
      selectedButton = buttons[0];
      currentUrlType = selectedButton.dataset.urltype;
    }
  }

  console.log('Player search page initialized.');
  console.log(`Initial State: Region=${currentRegion}, UrlType=${currentUrlType}`);

  // Now trigger the first realm list load based on defaults
  await triggerRealmListUpdate();
}

// Initialize the page when the DOM is ready
document.addEventListener('DOMContentLoaded', initializePage);