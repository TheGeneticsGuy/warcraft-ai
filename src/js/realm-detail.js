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

async function fetchAiSummaryDirectly(realmDetails) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return 'AI summary configuration error (missing key).';
  }

  const realmName = realmDetails.name || 'this realm';
  const region = realmDetails.region || 'its region';
  const realmType = realmDetails.type || 'unknown type';
  const category = realmDetails.category || 'standard';

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const prompt = `
Adopt the persona of a knowledgeable and eloquent Azerothian chronicler or historian, recounting tales of Azeroth, of stories of great adventurers... Do not reference anything indicating the digital nature of the game or the world. Do not present this in the first person or name yourself. Preset the summary of the specified realm below in a factual, but stylyzed role-playing demeanor.
Your task is to generate a detailed historical summary (approximately 2-3 paragraphs) for the World of Warcraft realm specified below.

**Realm Details Provided:**
*   **Realm Name:** ${realmName}
*   **Region:** ${region}
*   **Realm Type:** ${realmType} (${category})  // e.g., Normal (PvE), PvP, RP (Roleplaying)

if the realm type is normal, then identify it as a PVE realm, not a "normal" realm.

**Instructions for the Chronicler:**

1.  **Focus:** Craft a narrative history centered *specifically* on the "${realmName}" (${region}) realm.
2.  **Origin:** Discuss its origins. Based on your training data, mention the *general time period* or *expansion context* when "${realmName}" likely launched (e.g., "one of the original launch realms," "established during the original Vanilla Era, or during the Burning Crusade era," or WOTLK, or when the Cataclysm happened and so on. Do NOT state a specific month or year unless it is verifiable public knowledge for *this specific realm*. Avoid guessing or speculating on exact dates.** It is ok to be in the ballpark, but try to use events or seasons, like fall, spring, or "during the original Vanilla Classic game" or "One of the original first servers" and so on.
3.  **Realm Type Influence:** Explain how its designation as a **"${realmType}"** shapes its culture in the world of Azeroth
4.  **Notable History & Community:** Weave in any *widely known and verifiable* historical events, significant server-first achievements, renowned *long-standing guilds specifically associated with "${realmName}" or its connected group*, or famous player figures *if* your training data strongly supports their connection to *this specific realm*.
5.  **Famous Guilds - IMPORTANT CAVEAT:** Mention globally famous competitive guilds (like Liquid, Echo, Method, etc.) **ONLY IF** your training data strongly and accurately indicates they had a significant, well-documented historical presence, origin, or major achievement *directly tied to "${realmName}" or its specific connected realms*. **If there is no such direct, verifiable connection, DO NOT mention these famous guilds at all, not even to state they aren't present.** Focus on the realm's own history.
6.  **Tone & Style:** Write with narrative flair, evocative language, and the authority of an Azerothian historian. Maintain factual accuracy based on the provided details and your general knowledge base.
7.  **Handling Scarcity:** If significant historical details or notable events specific to "${realmName}" are scarce in your training data, acknowledge this humbly (e.g., "While specific chronicles are sparse...") rather than fabricating information. Prioritize accuracy and relevance to the provided realm details.
8. **Length:** Aim for 2-3 informative paragraphs. Either amount is appropriate. As long is it is informative and useful. You do not have to include every single aspect mentioned here, if it seems like maybe it is not relevant. Use your judgement on what to share based on this prompt. Weave these details (or lack thereof, omitting gracefully if details are sparse or insignificant) into a compelling narrative fitting the Warcraft universe. End with a sentence that sparks curiosity about the server's past exploits or future adventures. Avoid clichés like "gather 'round'"

Begin your chronicle now for "${realmName}" (${region}).
`;

  console.log(`[AI Prompt] ${prompt}`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
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

    if (data.promptFeedback?.blockReason) {
      console.warn(
        'AI content blocked:',
        data.promptFeedback.blockReason,
        data.promptFeedback.safetyRatings,
      );
      return `Summary generation was blocked. Reason: ${data.promptFeedback.blockReason}. Please try again or adjust settings if possible.`;
    } else if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0 &&
      data.candidates[0].content.parts[0].text
    ) {
      if (
        data.candidates[0].finishReason &&
        data.candidates[0].finishReason !== 'STOP'
      ) {
        console.warn(
          `AI generation finished with reason: ${data.candidates[0].finishReason}. Output may be incomplete or problematic.`,
        );
      }
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      console.warn('Unexpected AI response structure or empty content:', data);
      return 'Could not parse a valid AI summary from the response. The structure might be unexpected or the content empty.';
    }
  } catch (error) {
    console.error('Error fetching AI summary directly:', error);
    return `An error occurred while generating the realm summary: ${error.message}. Please try again later.`;
  }
}

async function displayAiSummary(
  realmDetails, // The whole realm object
  realmSlug,
  forceRefresh = false,
) {
  const realmName = realmDetails?.name;
  const region = realmDetails?.region;

  if (!aiSummaryContainer || !realmName || !region || !realmSlug) {
    console.warn('displayAiSummary called with incomplete data. Aborting.', {
      realmName,
      region,
      realmSlug,
    });
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    return;
  }

  const cacheKey = `${AI_CACHE_PREFIX}${region}-${realmSlug}`;
  const cachedData = localStorage.getItem(cacheKey);
  let summary = '';
  let timestamp = null;

  if (forceRefresh || !cachedData) {
    aiSummaryText.textContent = 'Generating realm summary...';
    aiTimestamp.textContent = '';
    if (refreshAiButton) refreshAiButton.disabled = true;
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'block';
  }

  if (cachedData && !forceRefresh) {
    try {
      const parsed = JSON.parse(cachedData);
      summary = parsed.summary;
      timestamp = parsed.timestamp;
    } catch (e) {
      console.error('Failed to parse cached AI summary', e);
      localStorage.removeItem(cacheKey);
      summary = '';
      timestamp = null;
    }
  }

  if (!summary || forceRefresh) {
    aiSummaryText.textContent = 'Generating realm summary...';
    aiTimestamp.textContent = '';
    if (refreshAiButton) refreshAiButton.disabled = true;

    summary = await fetchAiSummaryDirectly(realmDetails);

    timestamp = new Date().toISOString();
    localStorage.setItem(cacheKey, JSON.stringify({ summary, timestamp }));

    if (refreshAiButton) refreshAiButton.disabled = false;
  }

  aiSummaryText.textContent =
    summary || 'No summary could be generated or retrieved.';
  if (timestamp) {
    aiTimestamp.textContent = `Summary generated: ${new Date(
      timestamp,
    ).toLocaleString()}`;
  } else {
    aiTimestamp.textContent = '';
  }
  if (aiSummaryContainer) aiSummaryContainer.style.display = 'block';
}

// --- Initialization ---
async function initializePage() {
  await loadHeaderFooter();

  const regionParam = getParam('region');
  const urlType = getParam('urlType');
  const realmSlug = getParam('realmSlug');

  if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';

  const token = await getAccessToken();

  const apiNamespacePrefix = mapUrlTypeToApiNamespace(urlType);
  const realmDetails = await fetchRealmDetailsApi(
    regionParam,
    apiNamespacePrefix,
    realmSlug,
    token,
  );

  renderBlizzardDetails(realmDetails, regionParam);

  // --- AI Summary Logic ---
  if (
    realmDetails &&
    !realmDetails.error &&
    realmDetails.name &&
    realmDetails.region &&
    realmSlug
  ) {
    displayAiSummary(realmDetails, realmSlug); // Initial load

    if (refreshAiButton) {
      refreshAiButton.addEventListener('click', () => {
        displayAiSummary(realmDetails, realmSlug, true);
      });
    }
  } else {
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    console.log('Skipping AI summary due to missing/error in realm details.');
  }
}

document.addEventListener('DOMContentLoaded', initializePage);
