import { getAccessToken } from './blizzAPI.js';
import { mapApiNamespaceToUrlType, getPrimaryName } from './utils.mjs';

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
let currentNamespace = ''; // API namespace prefix 'dynamic', 'dynamic-classic')
let currentUrlType = ''; // URL-friendly type (retail', 'classic', 'classicera')
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

  const fullApiNamespace = `${currentNamespace}-${currentRegion}`;
  const url = new URL(
    `https://${currentRegion}.api.blizzard.com/data/wow/search/connected-realm`,
  );
  url.searchParams.append('namespace', fullApiNamespace);
  url.searchParams.append('locale', currentLocale);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: `HTTP Error! status: ${response.status}` }));
      console.error('API Error Response:', errorBody);
      throw new Error(errorBody.message || `Error! status: ${response.status}`);
    }

    const realmData = await response.json();

    const realmDetails = realmData.results
      .map((connectedRealmGroup) => {
        // Focus on the primary realm within the connected group
        const primaryRealmInfo = connectedRealmGroup.data.realms[0];
        if (!primaryRealmInfo) return null;

        const name = getPrimaryName(primaryRealmInfo.name); // Standardized name extraction
        const slug = primaryRealmInfo.slug;

        // Return null if essential data is missing to filter it out later
        if (!name || !slug) return null;

        const statusType = connectedRealmGroup.data.status.type;
        const statusLocalized =
          connectedRealmGroup.data.status.name[currentLocale] ||
          connectedRealmGroup.data.status.name['en_US'];
        const populationLocalized =
          connectedRealmGroup.data.population.name[currentLocale] ||
          connectedRealmGroup.data.population.name['en_US'];
        const typeLocalized =
          primaryRealmInfo.type.name[currentLocale] ||
          primaryRealmInfo.type.name['en_US'];
        const categoryLocalized =
          primaryRealmInfo.category[currentLocale] ||
          primaryRealmInfo.category['en_US'];

        return {
          name: name, // Use the standardized name
          slug: slug,
          status: statusType,
          statusLocalized: statusLocalized,
          popLocalized: populationLocalized,
          typeLocalized: typeLocalized,
          categoryLocalized: categoryLocalized,
        };
      })
      // 1. Filter out any null entries from mapping (missing name/slug)
      .filter((realm) => realm !== null)
      // 2. Apply standardized name-based filters
      .filter(
        (realm) =>
          !realm.name.startsWith('Test Realm') &&
          !realm.name.startsWith('US') &&
          !realm.name.includes('CWOW'),
      );

    // Sort realms alphabetically by the standardized name
    let sortedRealms = realmDetails.sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    console.log(
      `[Realms Page] Found ${sortedRealms.length} valid realm groups after filtering.`,
    );
    return sortedRealms;
  } catch (error) {
    console.error('Error fetching or processing realms:', error);
    return null;
  }
}

// Sets the visual state of the selected filter button and updates state
function setChoseButton(buttonIndex, isUserClick) {
  const chosenButton = buttons[buttonIndex];
  if (!chosenButton) return; // Safety check

  if (selectedButton) {
    selectedButton.classList.remove('selected');
  }

  chosenButton.classList.add('selected');
  selectedButton = chosenButton;

  currentNamespace = namespace[selectedButton.id];
  currentUrlType = mapApiNamespaceToUrlType(currentNamespace);

  if (isUserClick) {
    localStorage.setItem('selectedButtonId', selectedButton.id);
    displayRealms();
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

function configureSaveSelection() {
  let savedButtonId =
    localStorage.getItem('selectedButtonId') || 'retail-button'; // Default to retail
  const savedButton = document.querySelector(`#${savedButtonId}`);
  if (savedButton) {
    const savedIndex = Array.from(buttons).indexOf(savedButton);
    if (savedIndex !== -1) {
      setChoseButton(savedIndex, false);
    } else {
      setChoseButton(0, false);
    }
  } else {
    setChoseButton(0, false);
  }

  currentRegion = localStorage.getItem('selectedRegion') || regions[0];
  regionDropdown.value = currentRegion;

  currentLocale = localStorage.getItem('selectedLocale') || locales[0];
  localeDropdown.value = currentLocale;

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => setChoseButton(index, true));
  });

  regionDropdown.addEventListener('change', () => {
    currentRegion = regionDropdown.value;
    localStorage.setItem('selectedRegion', currentRegion);
    displayRealms();
  });

  localeDropdown.addEventListener('change', () => {
    currentLocale = localeDropdown.value;
    localStorage.setItem('selectedLocale', currentLocale);
    displayRealms();
  });
}

async function displayRealms() {
  realmGrid.innerHTML = '<p>Loading realms...</p>';
  realmCountEl.textContent = '...';

  const token = await getAccessToken();
  if (!token) {
    console.error('Failed to get access token. Cannot display realms.');
    buildRealms(null);
    return;
  }

  const sortedRealms = await getRealms(token);
  buildRealms(sortedRealms);
}

document.addEventListener('DOMContentLoaded', () => {
  configureSaveSelection();
  displayRealms();
});
