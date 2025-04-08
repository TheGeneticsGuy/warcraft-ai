import { getAccessToken } from './blizzAPI.js';
import { mapApiNamespaceToUrlType } from './utils.mjs';

// --- Global Variables ---
const locales = [
  'en_US',
  'ko_KR',
  'fr_FR',
  'de_DE',
  'zh_CN',
  'es_ES',
  'zh_TW',
  'es_MX',
  'ru_RU',
  'pt_BR',
  'it_IT',
];
const regions = ['us', 'eu', 'kr', 'tw'];
// Maps button IDs to API namespace prefixes
const namespace = {
  'retail-button': 'dynamic',
  'classic-button': 'dynamic-classic', // Assumes this is for Cata/Wrath/etc...
  'classicEra-button': 'dynamic-classic1x',
};

let currentRegion = '';
let currentLocale = '';
let currentNamespace = ''; // API namespace prefix (e.g., 'dynamic', 'dynamic-classic')
let currentUrlType = ''; // URL-friendly type (e.g., 'retail', 'classic', 'classicera')
let selectedButton = null; // Keep track of the visually selected filter button

// --- DOM Elements ---
const icons = document.querySelectorAll('.icon-menu');
const nav = document.querySelector('.navigation');
const buttons = document.querySelectorAll('.filter-button'); // Realm type filter buttons
const regionDropdown = document.querySelector('#region-select');
const localeDropdown = document.querySelector('#locale-select');
const realmGrid = document.querySelector('#lower_main_grid');
const realmCountEl = document.querySelector('#num-realms');
const realmDetailsModal = document.querySelector('#realm-details'); // For mobile modal

// --- Hamburger Menu Logic ---
icons.forEach((hamburger) => {
  hamburger.addEventListener('click', () => {
    nav.classList.toggle('open');
    hamburger.classList.toggle('open');
  });
});

// --- API Data Fetching ---

// Fetches realm list from Blizzard API based on current filters
async function getRealms(token) {
  if (!currentRegion || !currentNamespace || !currentLocale) {
    console.error('Missing required parameters for API call:', {
      currentRegion,
      currentNamespace,
      currentLocale,
    });
    return null; // Indicate failure
  }

  // Construct the full API namespace (e.g., dynamic-us, dynamic-classic-eu)
  const fullApiNamespace = `${currentNamespace}-${currentRegion}`;

  const url = new URL(
    `https://${currentRegion}.api.blizzard.com/data/wow/search/connected-realm`,
  );
  url.searchParams.append('namespace', fullApiNamespace);
  url.searchParams.append('locale', currentLocale); // Locale affects names returned

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Try to get more specific error from API response
      const errorBody = await response
        .json()
        .catch(() => ({ message: `HTTP Error! status: ${response.status}` }));
      console.error('API Error Response:', errorBody);
      throw new Error(errorBody.message || `Error! status: ${response.status}`);
    }

    const realmData = await response.json();

    // Filter and map realm data
    const realmDetails = realmData.results
      .map((realm) => {
        // Use English (en_US) as a reliable fallback for essential info like name
        const primaryRealmInfo = realm.data.realms[0];
        const name =
          primaryRealmInfo.name[currentLocale] ||
          primaryRealmInfo.name['en_US'];

        // Officla Blizz slug
        const slug = primaryRealmInfo.slug;

        // Return null if essential data (like name) is missing to filter it out later
        if (!name || !slug) return null;

        const statusType = realm.data.status.type; // UP/DOWN
        const statusLocalized =
          realm.data.status.name[currentLocale] ||
          realm.data.status.name['en_US'];
        const populationLocalized =
          realm.data.population.name[currentLocale] ||
          realm.data.population.name['en_US'];
        const typeLocalized =
          primaryRealmInfo.type.name[currentLocale] ||
          primaryRealmInfo.type.name['en_US'];
        const categoryLocalized =
          primaryRealmInfo.category[currentLocale] ||
          primaryRealmInfo.category['en_US'];

        return {
          name: name,
          slug: slug,
          status: statusType,
          statusLocalized: statusLocalized,
          popLocalized: populationLocalized,
          typeLocalized: typeLocalized,
          categoryLocalized: categoryLocalized,
        };
      })
      .filter(
        (realm) =>
          realm !== null && // Filter out any null entries from mapping
          !realm.name?.startsWith('US PS'),
      ); // Filter out known dummy realms

    // Sort realms alphabetically by name
    let sortedRealms = realmDetails.sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return sortedRealms;
  } catch (error) {
    console.error('Error fetching or processing realms:', error);
    return null; // Indicate failure
  }
}

// --- UI Update Functions ---

// Sets the visual state of the selected filter button and updates state
function setChoseButton(buttonIndex, isUserClick) {
  const chosenButton = buttons[buttonIndex];
  if (!chosenButton) return; // Safety check

  // Remove selection from the previously selected button
  if (selectedButton) {
    selectedButton.classList.remove('selected');
  }

  // Add selection to the new button
  chosenButton.classList.add('selected');
  selectedButton = chosenButton; // Update the reference

  // Update state based on the selected button
  currentNamespace = namespace[selectedButton.id];
  currentUrlType = mapApiNamespaceToUrlType(currentNamespace); // Use the mapping function

  // If triggered by a user click, save the choice and refresh the realm list
  if (isUserClick) {
    localStorage.setItem('selectedButtonId', selectedButton.id);
    displayRealms(); // Refresh the list based on the new selection
  }
}

// Builds the HTML grid for the realms
function buildRealms(sortedRealms) {
  realmGrid.innerHTML = ''; // Clear previous grid content

  if (!sortedRealms || sortedRealms.length === 0) {
    realmGrid.innerHTML =
      '<p class="error-message">No realms found matching your criteria, or an error occurred.</p>';
    realmCountEl.textContent = '0';
    return;
  }

  // Add Header Row
  const headerItem = document.createElement('div');
  headerItem.classList.add('realm-item', 'grid-header');
  headerItem.innerHTML = `
      <div class="realm-name">REALM</div>
      <div class="realm-status">STATUS</div>
      <div class="realm-population">POPULATION</div>
    `;
  realmGrid.appendChild(headerItem);

  // Add Data Rows
  sortedRealms.forEach((realm) => {
    const realmItem = document.createElement('div');
    realmItem.classList.add('realm-item');

    // Create name column as a LINK with query parameters
    const nameElement = document.createElement('a');
    nameElement.classList.add('realm-name', 'realm-link');
    nameElement.textContent = realm.name;
    nameElement.href = `/realm-detail/?region=${currentRegion}&urlType=${currentUrlType}&realmSlug=${realm.slug}`;

    // Create status column
    const statusElement = document.createElement('div');
    statusElement.classList.add('realm-status');
    statusElement.textContent = realm.statusLocalized;
    statusElement.classList.toggle('status-up', realm.status === 'UP');
    statusElement.classList.toggle('status-down', realm.status === 'DOWN');

    // Create population column
    const populationElement = document.createElement('div');
    populationElement.classList.add('realm-population');
    populationElement.textContent = realm.popLocalized;

    // Append columns to realm item
    realmItem.appendChild(nameElement);
    realmItem.appendChild(statusElement);
    realmItem.appendChild(populationElement);

    realmItem.addEventListener('click', (event) => {
      if (event.target === nameElement) {
        return; // Let the link handle navigation
      }
      if (window.innerWidth <= 768) {
        displayRealmDetailsModal(realm);
      }
    });

    realmGrid.appendChild(realmItem);
  });

  realmCountEl.textContent = sortedRealms.length;
}

// Displays the modal (primarily for smaller screens)
function displayRealmDetailsModal(realm) {
  if (!realmDetailsModal) return; // Safety check if element doesn't exist

  const colorClass = realm.status === 'UP' ? 'status-up' : 'status-down';

  realmDetailsModal.innerHTML = `
        <button id="closeModal" aria-label="Close modal">❌</button>
        <h2>${realm.name}</h2>
        <div id="modal-divider"></div>
        <div id="modal-wrapper">
            <div id="modal-left">
                <p>STATUS:</p>
                <p>POPULATION:</p>
                <!-- Optionally add more details here -->
                <p>TYPE:</p>
                <p>COMMUNITY:</p>
            </div>
            <div id="modal-right">
                <p class="${colorClass}">${realm.statusLocalized}</p>
                <p>${realm.popLocalized}</p>
                <!-- Corresponding values -->
                <p>${realm.typeLocalized}</p>
                <p>${realm.categoryLocalized}</p>
            </div>
        </div>
    `;

  realmDetailsModal.showModal();

  // Add listener to the new close button within the modal
  const closeButton = realmDetailsModal.querySelector('#closeModal');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      realmDetailsModal.close();
    });
  }
}

// --- Initialization and Event Listeners ---

// Loads saved selections from localStorage and sets initial state
function configureSaveSelection() {
  // Restore saved button selection or default
  let savedButtonId =
    localStorage.getItem('selectedButtonId') || 'retail-button'; // Default to retail
  const savedButton = document.querySelector(`#${savedButtonId}`);
  if (savedButton) {
    const savedIndex = Array.from(buttons).indexOf(savedButton);
    if (savedIndex !== -1) {
      // Set initial state WITHOUT triggering refresh (isUserClick = false)
      setChoseButton(savedIndex, false);
    } else {
      // Fallback if saved ID is invalid, use default
      setChoseButton(0, false);
    }
  } else {
    // Fallback if element not found, use default
    setChoseButton(0, false);
  }

  // Restore region or default
  currentRegion = localStorage.getItem('selectedRegion') || regions[0]; // Default to first region
  regionDropdown.value = currentRegion;

  // Restore locale or default
  currentLocale = localStorage.getItem('selectedLocale') || locales[0]; // Default to en_US
  localeDropdown.value = currentLocale;

  // Add event listeners to filter buttons
  buttons.forEach((button, index) => {
    // Trigger state update AND refresh on click (isUserClick = true)
    button.addEventListener('click', () => setChoseButton(index, true));
  });

  // Add event listeners to dropdowns
  regionDropdown.addEventListener('change', () => {
    currentRegion = regionDropdown.value;
    localStorage.setItem('selectedRegion', currentRegion);
    displayRealms(); // Refresh list on change
  });

  localeDropdown.addEventListener('change', () => {
    currentLocale = localeDropdown.value;
    localStorage.setItem('selectedLocale', currentLocale);
    displayRealms(); // Refresh list on change
  });
}

// Fetches token and realm data, then builds the UI
async function displayRealms() {
  realmGrid.innerHTML = '<p>Loading realms...</p>'; // Show loading state
  realmCountEl.textContent = '...';

  const token = await getAccessToken();
  if (!token) {
    console.error('Failed to get access token. Cannot display realms.');
    buildRealms(null); // Build with null to show error message
    return;
  }

  const sortedRealms = await getRealms(token);
  // buildRealms handles null/empty array internally now
  buildRealms(sortedRealms);
}

// --- Page Load Execution ---
document.addEventListener('DOMContentLoaded', () => {
  configureSaveSelection(); // Load settings and set initial state FIRST
  displayRealms(); // THEN fetch and display data based on state
});
