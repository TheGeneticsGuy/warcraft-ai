// src/js/realm-detail.js
import {
  getParam,
  loadHeaderFooter,
  mapUrlTypeToApiNamespace,
  getPrimaryRealmName,
} from './utils.mjs'; // Adjust path as needed
import { getAccessToken } from './blizzAPI.js'; // Adjust path as needed

// --- Constants ---
const AI_CACHE_PREFIX = 'aiSummary-';
// IMPORTANT: I will need  to replace this with my backend end point eventually...

// --- DOM Elements ---
const realmNameEl = document.querySelector('#realmName');
const realmRegionValueEl = document.querySelector('#realmRegionValue');
const realmStatusValueEl = document.querySelector('#realmStatusValue');
const realmPopulationValueEl = document.querySelector('#realmPopulationValue');
const realmTypeValueEl = document.querySelector('#realmTypeValue');
const realmCategoryValueEl = document.querySelector('#realmCategoryValue');
const realmTimezoneValueEl = document.querySelector('#realmTimezoneValue');
const includedRealmsEl = document.querySelector('#includedRealms');
const aiSummaryContainer = document.querySelector('#ai-summary-container');
const aiSummaryText = document.querySelector('#ai-summary-text');
const aiTimestamp = document.querySelector('#ai-timestamp');
const refreshAiButton = document.querySelector('#refresh-ai-summary');
const realmDetailSection = document.querySelector('.realm-detail');

async function fetchRealmDetailsApi(
  region,
  apiNamespacePrefix,
  realmSlug,
  token,
) {
  if (!region || !apiNamespacePrefix || !realmSlug || !token) {
    console.error('Missing parameters for fetchRealmDetailsApi');
    return null;
  }

  const fullApiNamespace = `${apiNamespacePrefix}-${region}`;
  // USE THE SEARCH ENDPOINT - it returns connected realm groups directly
  let searchUrl = `https://${region}.api.blizzard.com/data/wow/search/connected-realm?namespace=${fullApiNamespace}&_pageSize=1000`; // Use large page size

  // We only need en_US names generally for matching/displaying if locale fails
  searchUrl += `&locale=en_US`;

  try {
    // 1. Fetch the list of ALL connected realms for the namespace/region
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!searchResponse.ok) {
      const errorBody = await searchResponse.json().catch(() => ({
        message: `Search fetch failed: ${searchResponse.status}`,
      }));
      throw new Error(
        errorBody.message || `Search fetch failed: ${searchResponse.status}`,
      );
    }
    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      console.error(
        'No connected realm results found for namespace:',
        fullApiNamespace,
      );
      return {
        name: realmSlug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        error: 'No connected realms found for this game version/region.',
      };
    }

    // 2. Find the specific connected realm group that CONTAINS the target realmSlug
    let targetConnectedRealmData = null;
    for (const result of searchData.results) {
      // Check if the 'realms' array exists in the current result's data
      if (
        result.data &&
        result.data.realms &&
        Array.isArray(result.data.realms)
      ) {
        // Check if any realm within this connected group matches the slug
        const foundRealm = result.data.realms.find((r) => r.slug === realmSlug);
        if (foundRealm) {
          // Found the connected realm group! Use its data.
          targetConnectedRealmData = result.data;
          break; // Stop searching once found
        }
      } else {
        // Log if a result has an unexpected structure
        console.warn(
          'Skipping connected realm search result with unexpected data structure:',
          result,
        );
      }
    }

    if (!targetConnectedRealmData) {
      console.error(
        `Realm slug '${realmSlug}' not found within any connected realm group in region '${region}' namespace '${fullApiNamespace}'. Check if the slug and namespace are correct.`,
      );
      // Provide a more informative error, potentially listing available slugs if feasible (for debugging)
      return {
        name: realmSlug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        error: `Details for realm slug '${realmSlug}' could not be located in this region/version.`,
      };
    }

    // 3. Extract and format data directly from the found connected realm data
    // No need for a second fetch, the search result already has the details.
    const primaryRealm = targetConnectedRealmData.realms[0]; // Use first realm as representative
    const realmDetails = {
      has_queue: targetConnectedRealmData.has_queue,
      status: targetConnectedRealmData.status.type, // UP, DOWN
      statusLocalized: getPrimaryRealmName(
        targetConnectedRealmData.status.name,
      ),
      population: targetConnectedRealmData.population.type, // LOW, MEDIUM, HIGH, FULL etc.
      populationLocalized: getPrimaryRealmName(
        targetConnectedRealmData.population.name,
      ),
      realms: targetConnectedRealmData.realms.map((r) => ({
        name: getPrimaryRealmName(r.name), // Already correct
        slug: r.slug,
        id: r.id,
        timezone: r.timezone,
        type: getPrimaryRealmName(r.type.name), // Apply utility here
        category: getPrimaryRealmName(r.category), // Apply utility here
        locale: r.locale,
      })),
      // Use details from the first realm as representative for the connected group display
      name: getPrimaryRealmName(primaryRealm.name), // Already correct
      timezone: primaryRealm.timezone,
      type: getPrimaryRealmName(primaryRealm.type.name), // Apply utility here
      category: getPrimaryRealmName(primaryRealm.category), // Apply utility here
      locale: primaryRealm.locale,
      // Get the region name string using the utility function
      region: getPrimaryRealmName(primaryRealm.region.name), // Apply utility here
    };

    return realmDetails;
  } catch (error) {
    console.error(
      'Error fetching or processing connected realm details:',
      error,
    );
    // Display error within the main section
    realmDetailSection.innerHTML = `<p class="error-message">Error loading realm details: ${error.message}</p>`;
    return null; // Indicate failure
  }
}

// Render the fetched Blizzard realm details to the page
function renderBlizzardDetails(realm, regionParam) {
  if (!realm) {
    return; // Error handled elsewhere
  }
  // Handle API error case
  if (realm.error) {
    realmNameEl.textContent = realm.name || 'Unknown Realm';
    // Clear or hide the structured details if there's a fundamental error
    const coreDetailsDiv = document.querySelector('#realm-core-details');
    if (coreDetailsDiv)
      coreDetailsDiv.innerHTML = `<p class="error-message">Could not load details: ${realm.error}</p>`;
    const connectedRealmsDiv = document.querySelector(
      '#connected-realms-container',
    );
    if (connectedRealmsDiv) connectedRealmsDiv.style.display = 'none';
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    return;
  }

  // Update Realm Name
  realmNameEl.textContent = realm.name || 'Unknown Realm';

  // Update Core Detail Values
  if (realmRegionValueEl)
    realmRegionValueEl.textContent = realm.region || regionParam;
  if (realmStatusValueEl) {
    realmStatusValueEl.textContent = realm.statusLocalized || realm.status;
    realmStatusValueEl.className = 'detail-value'; // Reset classes first
    if (realm.status === 'UP') {
      realmStatusValueEl.classList.add('status-up');
    } else if (realm.status) {
      // Check if status exists before adding down class
      realmStatusValueEl.classList.add('status-down');
    }
  }
  if (realmPopulationValueEl)
    realmPopulationValueEl.textContent =
      realm.populationLocalized || realm.population;
  if (realmTypeValueEl) realmTypeValueEl.textContent = realm.type;
  if (realmCategoryValueEl) realmCategoryValueEl.textContent = realm.category; // Changed label to 'Category' to match JS
  if (realmTimezoneValueEl) realmTimezoneValueEl.textContent = realm.timezone;

  // Update Connected Realms (in its separate container)
  const connectedRealmsDiv = document.querySelector(
    '#connected-realms-container',
  );
  if (includedRealmsEl && connectedRealmsDiv) {
    if (realm.realms && realm.realms.length > 1) {
      includedRealmsEl.innerHTML = `<strong>Connected Realms:</strong> ${realm.realms.map((r) => r.name).join(', ')}`;
      connectedRealmsDiv.style.display = 'block'; // Ensure it's visible
    } else {
      includedRealmsEl.innerHTML =
        '<strong>Connected Realms:</strong> This is a single realm.';
      connectedRealmsDiv.style.display = 'block'; // Same
    }
  } else if (connectedRealmsDiv) {
    connectedRealmsDiv.style.display = 'none'; // Hide if element not found
  }

  // Enable AI section now that we have data
  if (aiSummaryContainer) aiSummaryContainer.style.display = 'block';
}

// --- AI Summary Functions ---

/**
 * Fetches AI summary from the backend (SECURE WAY)
 */
// async function fetchAiSummaryFromBackend(realmName, region) {
//     try {
//         const response = await fetch(AI_API_ENDPOINT, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ realmName, region }),
//         });
//         if (!response.ok) {
//             const errorData = await response
//                 .json()
//                 .catch(() => ({ message: response.statusText }));
//             throw new Error(
//                 `Backend AI request failed: ${errorData.message || response.status}`,
//             );
//         }
//         const data = await response.json();
//         return data.summary; // Assuming your backend returns { summary: "..." }
//     } catch (error) {
//         console.error('Error fetching AI summary from backend:', error);
//         return `Error generating summary: ${error.message}`;
//     }
// }

async function fetchAiSummaryDirectly(realmName, region) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // Access Vite env var

  if (!apiKey) {
    console.error('API key is not set. Cannot fetch AI summary directly.');
    return 'AI summary configuration error (missing key).';
  }

  // For expaneded AI use one day.
  // const bestGuilds = 'https://www.esportsbets.com/wow/best-guilds/'
  // const bestdps = 'https://raider.io/mythic-plus-character-rankings/season-tww-2/world/all/dps'
  // const besthealer = 'https://raider.io/mythic-plus-character-rankings/season-tww-2/world/all/healer'
  // const bestRaidGuild = 'https://raider.io/liberation-of-undermine/realm-rankings/world/all/mythic'

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const prompt = `Adopt the persona of a knowledgeable Azerothian chronicler. Provide a brief (3-6 sentences) yet evocative historical summary of the World of Warcraft realm "${realmName}" in the "${region}" region. Be explicit in including the month and/or year if that is known, but do not speculate when the realm was established. Give a general timeframe, but don't say the specific month unless that is known and not speculated. It is ok to add additional flair to the warcraft events around that time, but be sure to mention the real-world time period. Weave in details about its origin, be accurate about the type of realm (PvP/PvE/RP), and any widely known historical events, legendary guilds (like Liquid, Echo, Method, etc., if applicable and known for this realm), or renowned figures connected to it, drawing from established Warcraft history and community knowledge (similar to information found on sites like Raider.io or Esportsbets). Only mention the famous guilds if they are absolutely connected to this realm. Maintain factual accuracy where possible, but present the information with a touch of narrative flair appropriate for Warcraft lore. If verifiable history or notable tales are scarce for this realm, acknowledge this humbly. Avoid pure speculation.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ error: { message: `HTTP error ${response.status}` } }));
      console.error('Gemini API Error Response:', errorBody);
      throw new Error(
        errorBody.error?.message ||
        `Gemini API request failed: ${response.status}`,
      );
    }

    const data = await response.json();

    // Basic check for response structure
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text;
    } else if (data.promptFeedback?.blockReason) {
      console.warn('AI content blocked:', data.promptFeedback.blockReason);
      return `Summary generation was blocked due to: ${data.promptFeedback.blockReason}.`;
    } else {
      console.warn('Unexpected AI response structure:', data);
      return 'Could not parse AI summary from the response.';
    }
  } catch (error) {
    console.error('Error fetching AI summary directly:', error);
    return `Error generating summary: ${error.message}`;
  }
}

async function displayAiSummary(
  realmName,
  region,
  realmSlug,
  forceRefresh = false,
) {
  if (!aiSummaryContainer || !realmName || !region || !realmSlug) return; // Don't run if elements or data missing

  const cacheKey = `${AI_CACHE_PREFIX}${region}-${realmSlug}`;
  const cachedData = localStorage.getItem(cacheKey);
  let summary = '';
  let timestamp = null;

  if (cachedData && !forceRefresh) {
    try {
      const parsed = JSON.parse(cachedData);
      summary = parsed.summary;
      timestamp = parsed.timestamp;
    } catch (e) {
      console.error('Failed to parse cached AI summary', e);
      localStorage.removeItem(cacheKey); // Clear invalid cache item
    }
  }

  if (!summary || forceRefresh) {
    aiSummaryText.textContent = 'Generating realm summary...';
    aiTimestamp.textContent = '';
    refreshAiButton.disabled = true; // Disable button while generating

    // SECURE BACKEND which I will implement eventually
    // summary = await fetchAiSummaryFromBackend(realmName, region);

    summary = await fetchAiSummaryDirectly(realmName, region);

    timestamp = new Date().toISOString();
    localStorage.setItem(cacheKey, JSON.stringify({ summary, timestamp }));

    refreshAiButton.disabled = false; // Re-enable button
  }

  aiSummaryText.textContent = summary || 'No summary available.'; // Display fetched/cached summary
  if (timestamp) {
    aiTimestamp.textContent = `Summary generated: ${new Date(
      timestamp,
    ).toLocaleString()}`;
  } else {
    aiTimestamp.textContent = '';
  }
}

// --- Initialization ---

async function initializePage() {
  await loadHeaderFooter(); // Load header/footer first

  const region = getParam('region');
  const urlType = getParam('urlType');
  const realmSlug = getParam('realmSlug');

  if (!region || !urlType || !realmSlug) {
    realmDetailSection.innerHTML =
      '<p class="error-message">Error: Missing realm details in URL.</p>';
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none'; // Hide AI if params missing
    return;
  }

  if (aiSummaryContainer) aiSummaryContainer.style.display = 'none'; // Hide AI initially

  const token = await getAccessToken();
  if (!token) {
    realmDetailSection.innerHTML =
      '<p class="error-message">Error: Could not authenticate with Blizzard API.</p>';
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none'; // Hide AI if auth fails
    return;
  }

  const apiNamespacePrefix = mapUrlTypeToApiNamespace(urlType);
  const realmDetails = await fetchRealmDetailsApi(
    region,
    apiNamespacePrefix,
    realmSlug,
    token,
  );

  renderBlizzardDetails(realmDetails, region, urlType, realmSlug); // Pass original params too for context if API fails partially

  // --- AI Summary Logic ---
  // Only proceed if we successfully got realm details (specifically name and region)
  if (
    realmDetails &&
    !realmDetails.error &&
    realmDetails.name &&
    realmDetails.region
  ) {
    displayAiSummary(realmDetails.name, realmDetails.region, realmSlug); // Initial load (cached or new)

    // Add listener for the refresh button
    if (refreshAiButton) {
      refreshAiButton.addEventListener('click', () => {
        displayAiSummary(
          realmDetails.name,
          realmDetails.region,
          realmSlug,
          true,
        ); // Force refresh
      });
    }
  } else {
    // Ensure AI section is hidden if realm details failed or were incomplete
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    console.log('Skipping AI summary due to missing realm details.');
  }
}

// Run initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', initializePage);
