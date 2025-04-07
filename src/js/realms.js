import { getAccessToken } from './blizzAPI.js';

// Locales, reguions, and namespaces
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
const namespace = {
    'retail-button': 'dynamic',
    'classic-button': 'dynamic-classic',
    'classicEra-button': 'dynamic-classic1x',
}; // Button IDs matched to the namespace of the API for Realms.

let currentRegion = '';
let currentLocale = '';
let currentNamespace = '';

// HAMBURGER BUTTON LOGIC
const icons = document.querySelectorAll('.icon-menu');
const nav = document.querySelector('.navigation');

icons.forEach((hamburger) => {
    hamburger.addEventListener('click', () => {
        nav.classList.toggle('open');
        hamburger.classList.toggle('open');
    });
});

// Get the realms based on the filtered parameters...
async function getRealms(token) {
    // Manually constructing URL with query parameters as per Blizz documentation.
    const url = new URL(
        `https://${currentRegion}.api.blizzard.com/data/wow/search/connected-realm `,
    );
    url.searchParams.append('namespace', `${currentNamespace}-${currentRegion}`);
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
            throw new Error(`Error! status: ${response.status}`);
        }

        // To get full details, from the server, need more info need to fetch each connected realm
        const realmData = await response.json();

        // Now, let's build a table to sort the data
        // NOTE -- This falls back to English if there is no localized name as apparently not all realms have localized name options, notably the anniversary realms
        const realmDetails = realmData.results
            .filter(
                (realm) =>
                    !realm.data.realms[0].name[currentLocale]?.startsWith('US PS') && // Want to filter out any dummy realms
                    !realm.data.realms[0].name[locales[0]]?.startsWith('US PS'),
            )
            .map((realm) => ({
                name:
                    realm.data.realms[0].name[currentLocale] ||
                    realm.data.realms[0].name[locales[0]],
                status: realm.data.status.type, // need non-localized type for coloring Red or Green
                statusLocalized:
                    realm.data.status.name[currentLocale] ||
                    realm.data.status.name[locales[0]],
                popLocalized:
                    realm.data.population.name[currentLocale] ||
                    realm.data.population.name[locales[0]], // Don't actually need non-localized for population since no special coloring

                // EXTRA COLUMNS I COULD ADD - BUT WILL PROBABLY NOT FOR NOW - I will still store them
                typeLocalized:
                    realm.data.realms[0].type.name[currentLocale] ||
                    realm.data.realms[0].type.name[locales[0]], // Also don't need non-localized for type
                categoryLocalized:
                    realm.data.realms[0].category[currentLocale] ||
                    realm.data.realms[0].category[locales[0]], // Also don't need non-localized for type
            }));

        // Sort realms alphabetically by name
        let sortedRealms = realmDetails.sort((a, b) =>
            a.name.localeCompare(b.name),
        );

        // // Create a formatted table for console output
        // console.table(sortedRealms);
        return sortedRealms;
    } catch (error) {
        console.error('Error fetching realms:', error);
    }
}

// LOAD SETTINGS AND CONFIGURE BUTTON STATES
// Keep track of the currently selected button
let selectedButton = null;
const buttons = document.querySelectorAll('.filter-button'); // Sets all the class buttons to an array

// So the animation remains permanent of the selected realm type filter button
function setChoseButton(ind, isClick) {
    const chosenButton = buttons[ind];

    // If a button is already selected, remove the selected class
    if (selectedButton) {
        selectedButton.classList.remove('selected');
    }

    // Add the selected class to the newly clicked button
    chosenButton.classList.add('selected');

    // Update the selectedButton reference
    selectedButton = chosenButton;

    if (isClick) {
        localStorage.setItem('selectedButtonId', chosenButton.id);
        currentNamespace = namespace[chosenButton.id];
        displayRealms();
    }
}

// This will hold all of the local storage configuration at the start
function configureSaveSelection() {
    let savedButtonId = localStorage.getItem('selectedButtonId');
    const regionDropdown = document.querySelector('#region-select');
    const localeDropdown = document.querySelector('#locale-select');

    buttons.forEach((button, index) => {
        button.addEventListener('click', () => setChoseButton(index, true));
    });

    if (!savedButtonId) {
        savedButtonId = 'retail-button';
    }

    // Retail, Cata, or Classic Era Buttons
    if (savedButtonId) {
        const savedButton = document.querySelector(`#${savedButtonId}`);
        if (savedButton) {
            const savedIndex = Array.from(buttons).indexOf(savedButton);
            currentNamespace = namespace[savedButtonId];
            setChoseButton(savedIndex, false);
        }
    }

    // Restore previous selections from localStorage
    currentRegion = localStorage.getItem('selectedRegion');
    currentLocale = localStorage.getItem('selectedLocale');

    if (currentRegion) {
        regionDropdown.value = currentRegion;
    } else {
        currentRegion = regions[0];
        regionDropdown.value = regions[0];
    }

    if (currentLocale) {
        localeDropdown.value = currentLocale;
    } else {
        currentLocale = locales[0];
        localeDropdown.value = locales[0];
    }

    // Add event listeners to store selections in localStorage
    regionDropdown.addEventListener('change', () => {
        const selectedRegion = regionDropdown.value;
        localStorage.setItem('selectedRegion', selectedRegion);
        currentRegion = selectedRegion;
        displayRealms();
    });

    localeDropdown.addEventListener('change', () => {
        const selectedLocale = localeDropdown.value;
        localStorage.setItem('selectedLocale', selectedLocale);
        currentLocale = selectedLocale;
        displayRealms();
    });
}

// Main function to build the grid
// 3 columns - Name, Status, Population
function buildRealms(sortedRealms) {
    const realmGrid = document.querySelector('#lower_main_grid');
    realmGrid.innerHTML = ''; // Reset the grid

    for (let i = -1; i < sortedRealms.length; i++) {
        let realm = null;

        if (i === -1) {
            realm = {
                name: 'REALM',
                statusLocalized: 'STATUS',
                status: 'UP',
                popLocalized: 'POPULATION',
            };
        } else {
            realm = sortedRealms[i];
        }
        // Create the realm item container
        const realmItem = document.createElement('div');
        realmItem.classList.add('realm-item');
        if (i === -1) {
            realmItem.classList.add('grid-header');
        }

        // Create name column
        const nameElement = document.createElement('div');
        nameElement.classList.add('realm-name');
        nameElement.textContent = realm.name;

        // Create status column
        const statusElement = document.createElement('div');
        statusElement.classList.add('realm-status');
        statusElement.textContent = realm.statusLocalized;

        // Set status color based on status
        if (realm.status === 'UP') {
            statusElement.classList.add('status-up');
        } else if (realm.status === 'DOWN') {
            statusElement.classList.add('status-down');
        }

        // Create population column
        const populationElement = document.createElement('div');
        populationElement.classList.add('realm-population');
        populationElement.textContent = realm.popLocalized;

        // Append columns to realm item
        realmItem.appendChild(nameElement);
        realmItem.appendChild(statusElement);
        realmItem.appendChild(populationElement);

        // Adding event listener for modal
        if (i > -1) {
            realmItem.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    displayRealmDetailsModal(realm); // Only run modal on smaller screen
                }
            });
        }

        // Append realm item to grid
        realmGrid.appendChild(realmItem);
    }

    document.querySelector('#num-realms').textContent = sortedRealms.length;
}

// Core load function
async function displayRealms() {
    const token = await getAccessToken(); // Your existing token retrieval method
    const sortedRealms = await getRealms(token);
    buildRealms(sortedRealms);
}

// MODAL LOGIC

const realmDetails = document.querySelector('#realm-details');

function displayRealmDetailsModal(realm) {
    let colorClass = 'status-up';

    if (realm.status === 'DOWN') {
        colorClass = 'status-down';
    }
    // Reset when displaying
    realmDetails.innerHTML = '';
    realmDetails.innerHTML = `
        <button id="closeModal">❌</button>
        <h2>${realm.name}</h2>
        <div id="modal-divider"></div>
        <div id="modal-wrapper">
            <div id="modal-left">
                <p>STATUS:</p>
                <p>POPULATION:</p>
            </div>
            <div id="modal-right">
                <p class=${colorClass}>${realm.statusLocalized}</p>
                <p>${realm.popLocalized}</p>
            </div>
        </div>
    `;

    realmDetails.showModal();
    const closeButton = document.querySelector('#closeModal');
    closeButton.addEventListener('click', () => {
        realmDetails.close();
    });
}

document.addEventListener('DOMContentLoaded', configureSaveSelection);
document.addEventListener('DOMContentLoaded', displayRealms);
