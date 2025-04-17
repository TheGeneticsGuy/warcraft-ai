// src/js/realm-detail.js
import {
  getParam,
  loadHeaderFooter,
  mapUrlTypeToApiNamespace,
  getPrimaryRealmName,
} from './utils.mjs';
import { getAccessToken } from './blizzAPI.js';

// --- Constants ---
const AI_CACHE_PREFIX = 'aiRealmSummary-';
const API_REQUEST_TIMEOUT = 15000;

// --- DOM Element Variables
let realmNameEl, realmRegionValueEl, realmStatusValueEl, realmPopulationValueEl;
let realmTypeValueEl, realmCategoryValueEl, realmTimezoneValueEl;
let includedRealmsEl, aiSummaryContainer, realmDetailSection;
let aiSummaryText, aiTimestamp, refreshAiButton;
let summaryDropdown, deleteSummaryButton;
let modal, confirmBtn, cancelBtn;

// --- Helper Functions ---
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
    if (response.status === 404) {
      throw new Error(
        `Resource not found: ${response.status} ${response.statusText}`,
      );
    }
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = {
          message: `HTTP error ${response.status} ${response.statusText}`,
        };
      }
      console.error('API Error Response:', errorData); // Keep commented for prod
      throw new Error(
        errorData.detail ||
          errorData.title ||
          errorData.message ||
          `API Error ${response.status}`,
      );
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeout / 1000} seconds.`);
    }
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(String(error));
    }
  }
}

// --- API Data Fetching ---
async function fetchRealmDetailsApi(
  region,
  apiNamespacePrefix,
  realmSlug,
  token,
) {
  if (!region || !apiNamespacePrefix || !realmSlug || !token) {
    console.error('Missing parameters for fetchRealmDetailsApi'); // Keep commented for prod
    return {
      error: 'Internal configuration error: Missing parameters for API call.',
    };
  }

  const fullApiNamespace = `${apiNamespacePrefix}-${region}`;
  const searchUrl = `https://${region}.api.blizzard.com/data/wow/search/connected-realm?namespace=${fullApiNamespace}&realms.slug=${realmSlug}&_pageSize=1&locale=en_US`;

  try {
    const searchResponseData = await fetchWithTimeout(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (
      !searchResponseData ||
      !searchResponseData.results ||
      searchResponseData.results.length === 0 ||
      !searchResponseData.results[0].data
    ) {
      console.warn(
        `Realm slug '${realmSlug}' not found via connected realm search...`,
      ); // Keep commented for prod
      // Removed the ReferenceError here
      return {
        name: realmSlug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        error: `Details for realm slug '${realmSlug}' could not be located in this region/version.`,
      };
    }

    const targetConnectedRealmData = searchResponseData.results[0].data;
    const specificRealmObject = targetConnectedRealmData.realms.find(
      (r) => r.slug === realmSlug,
    );

    if (!specificRealmObject) {
      console.error(
        `Logic error: Realm slug '${realmSlug}' found in search but not in result's realm list.`,
      ); // Keep commented for prod
      return {
        name: realmSlug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        error: `Internal data inconsistency for realm '${realmSlug}'.`,
      };
    }

    const realmDetails = {
      has_queue: targetConnectedRealmData.has_queue,
      status: targetConnectedRealmData.status.type,
      statusLocalized: getPrimaryRealmName(
        targetConnectedRealmData.status.name,
      ),
      population: targetConnectedRealmData.population.type,
      populationLocalized: getPrimaryRealmName(
        targetConnectedRealmData.population.name,
      ),
      realms: targetConnectedRealmData.realms.map((r) => ({
        name: getPrimaryRealmName(r.name),
        slug: r.slug,
        id: r.id,
      })),
      name: getPrimaryRealmName(specificRealmObject.name),
      slug: specificRealmObject.slug,
      id: specificRealmObject.id,
      timezone: specificRealmObject.timezone,
      type: getPrimaryRealmName(specificRealmObject.type.name),
      category: getPrimaryRealmName(specificRealmObject.category),
      locale: specificRealmObject.locale,
      region: getPrimaryRealmName(specificRealmObject.region.name),
    };

    return realmDetails;
  } catch (error) {
    console.error('Error fetching or processing realm details:', error); // Keep commented for prod
    const displayError = error.message.includes('timed out')
      ? error.message
      : error.message.includes('404') ||
          error.message.includes('Resource not found') // Catch 404s correctly
        ? `Realm '${realmSlug}' not found in region '${region}'.`
        : `Error loading realm details: ${error.message}`;

    return {
      name: realmSlug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      error: displayError,
    };
  }
}

// Render the fetched Blizzard realm details to the page
function renderBlizzardDetails(realm, regionParam) {
  if (
    !realmNameEl ||
    !realmRegionValueEl ||
    !realmStatusValueEl ||
    !realmPopulationValueEl ||
    !realmTypeValueEl ||
    !realmCategoryValueEl ||
    !realmTimezoneValueEl ||
    !includedRealmsEl ||
    !aiSummaryContainer
  ) {
    console.error(
      'One or more essential DOM elements missing for rendering realm details.',
    ); // Keep commented for prod
    if (realmDetailSection)
      realmDetailSection.innerHTML = `<p class="error-message">Page Error: Could not load display elements.</p>`;
    return;
  }

  if (!realm) {
    realmNameEl.textContent = 'Error';
    if (realmDetailSection)
      realmDetailSection.innerHTML = `<p class="error-message">Internal Error: No realm data received for rendering.</p>`;
    aiSummaryContainer.style.display = 'none';
    return;
  }

  realmNameEl.textContent = realm.name || realm.slug || 'Unknown Realm';
  document.title = `${realm.name || 'Realm'} Details | WoW Chronicler`;

  // Handle API error case gracefully
  if (realm.error) {
    const coreDetailsDiv = document.querySelector('#realm-core-details'); // Query it here again just in case
    const errorHtml = `<p class="error-message">Could not load details: ${realm.error}</p>`;
    // Try setting the error message directly in the main section if core details div is missing
    if (coreDetailsDiv) {
      coreDetailsDiv.innerHTML = errorHtml; // Overwrite the loading placeholders if error occurs
    } else if (realmDetailSection) {
      // Fallback: Put error in main section, but avoid overwriting title if possible
      const existingTitle = realmDetailSection.querySelector('h2');
      realmDetailSection.innerHTML = ''; // Clear previous content
      if (existingTitle) realmDetailSection.appendChild(existingTitle); // Put title back
      const errorP = document.createElement('p');
      errorP.className = 'error-message';
      errorP.textContent = `Could not load details: ${realm.error}`;
      realmDetailSection.appendChild(errorP);
    }

    const connectedRealmsDiv = document.querySelector(
      '#connected-realms-container',
    );
    if (connectedRealmsDiv) connectedRealmsDiv.style.display = 'none';
    aiSummaryContainer.style.display = 'none';
    return;
  }

  // --- Update Core Detail Values (only if no error) ---
  realmRegionValueEl.textContent = realm.region || regionParam || 'N/A';

  realmStatusValueEl.textContent =
    realm.statusLocalized || realm.status || 'N/A';
  realmStatusValueEl.className = 'detail-value status-unknown'; // Reset classes, default unknown
  if (realm.status === 'UP') {
    realmStatusValueEl.className = 'detail-value status-up';
  } else if (realm.status === 'DOWN') {
    realmStatusValueEl.className = 'detail-value status-down';
  }

  realmPopulationValueEl.textContent =
    realm.populationLocalized || realm.population || 'N/A';
  realmPopulationValueEl.className = 'detail-value pop-unknown'; // Reset classes, default unknown
  if (realm.population) {
    realmPopulationValueEl.className = `detail-value pop-${realm.population.toLowerCase()}`;
  }

  realmTypeValueEl.textContent = realm.type || 'N/A';
  realmCategoryValueEl.textContent = realm.category || 'N/A';
  realmTimezoneValueEl.textContent = realm.timezone || 'N/A';

  // --- Update Connected Realms ---
  const connectedRealmsDiv = document.querySelector(
    '#connected-realms-container',
  );
  if (includedRealmsEl && connectedRealmsDiv) {
    // Clear previous content like warnings
    includedRealmsEl.innerHTML = '';
    const strongEl = document.createElement('strong');
    strongEl.textContent = 'Connected Realms: ';
    includedRealmsEl.appendChild(strongEl);

    if (realm.realms && realm.realms.length > 1) {
      const connectedNames = realm.realms.map((r) => r.name).sort();
      includedRealmsEl.appendChild(
        document.createTextNode(connectedNames.join(', ')),
      );
      connectedRealmsDiv.style.display = 'block';
    } else if (realm.realms && realm.realms.length === 1) {
      includedRealmsEl.appendChild(
        document.createTextNode('This realm is not connected to others.'),
      );
      connectedRealmsDiv.style.display = 'block';
    } else {
      includedRealmsEl.appendChild(
        document.createTextNode('Information unavailable.'),
      );
      connectedRealmsDiv.style.display = 'block';
    }
    // Display warning if present
    if (realm.warning) {
      const warningEl = document.createElement('p');
      warningEl.classList.add('warning-message');
      warningEl.textContent = `Note: ${realm.warning}`;
      // Append warning within the container but after the includedRealms paragraph
      connectedRealmsDiv.appendChild(warningEl);
    }
  } else if (connectedRealmsDiv) {
    connectedRealmsDiv.style.display = 'none';
  }

  // --- Show AI Summary Container ---
  aiSummaryContainer.style.display = 'block';
}

// --- AI Summary Functions ---
async function fetchAiSummaryDirectly(realmDetails) {
  if (
    !realmDetails ||
    !realmDetails.name ||
    !realmDetails.region ||
    !realmDetails.type ||
    !realmDetails.category
  ) {
    console.error(
      'Cannot generate realm summary without essential realm details...',
      realmDetails,
    ); // Keep commented for prod
    return 'Error: Missing essential realm details to generate summary.';
  }

  const API_URL = '/.netlify/functions/generateGeminiSummary';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ realmData: realmDetails }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('AI Server Error Response:', data); // Keep commented for prod
      throw new Error(
        data.error ||
          data.details ||
          `AI service request failed: ${response.status}`,
      );
    }

    if (data.promptFeedback?.blockReason) {
      return `Summary generation was blocked (prompt issue): ${data.promptFeedback.blockReason}.`;
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.warn('No candidate returned from AI.', data); // Keep commented for prod
      return 'The AI chronicler seems to be unavailable or speechless.';
    }

    const finishReason = candidate.finishReason;

    if (finishReason === 'SAFETY') {
      return `Summary generation was blocked for safety reasons during writing.`;
    }
    if (finishReason === 'RECITATION') {
      return `Summary generation stopped: Resembled existing sources too closely.`;
    }
    if (finishReason === 'OTHER') {
      return `The chronicle writing stopped unexpectedly.`;
    }

    const summaryText = candidate.content?.parts?.[0]?.text;

    if (summaryText) {
      let finalText = summaryText.trim();
      if (finishReason === 'MAX_TOKENS') {
        console.warn(`AI response truncated because MAX_TOKENS was reached.`); // Keep commented for prod
        finalText +=
          '\n\n*[...The chronicle trails off, limited by the constraints of this telling...]*';
      }
      return finalText;
    } else {
      console.warn('Unexpected AI response structure or empty content:', data); // Keep commented for prod
      return 'Could not parse AI summary from the response.';
    }
  } catch (error) {
    console.error('Error fetching AI realm summary from server:', error); // Keep commented for prod
    let displayError = `Error generating realm summary: ${error.message}`;
    if (error.message.includes('Failed to fetch')) {
      displayError = 'Error: Could not connect to the AI summary service.';
    } else if (error.message.includes('AI service request failed')) {
      displayError = `Error: The AI summary service reported an issue (${error.message.split(': ')[1] || 'Unknown'}).`;
    }
    return displayError;
  }
}

async function displayAiSummary(realmDetails, forceRefresh = false) {
  if (
    !aiSummaryContainer ||
    !aiSummaryText ||
    !aiTimestamp ||
    !summaryDropdown ||
    !deleteSummaryButton ||
    !refreshAiButton
  ) {
    console.error(
      'Cannot display AI summary - essential UI elements are missing.',
    ); // Keep commented for prod
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    return;
  }
  if (!realmDetails || !realmDetails.region || !realmDetails.slug) {
    console.warn(
      'Cannot display AI summary - missing realm region or slug for cache key.',
      realmDetails,
    ); // Keep commented for prod
    aiSummaryText.textContent =
      'Cannot load summary: Realm identifier missing.';
    aiTimestamp.textContent = '';
    aiSummaryContainer.style.display = 'block';
    summaryDropdown.disabled = true;
    deleteSummaryButton.disabled = true;
    refreshAiButton.disabled = true;
    return;
  }

  const region = realmDetails.region;
  const realmSlug = realmDetails.slug;
  const cacheKey = `${AI_CACHE_PREFIX}${region}-${realmSlug}-list`;
  let summaries = [];

  try {
    summaries = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    if (!Array.isArray(summaries)) summaries = [];
  } catch (e) {
    console.error('Error reading realm summary cache:', e); // Keep commented for prod
    localStorage.removeItem(cacheKey);
  }

  let selectedSummary = null;

  if (forceRefresh || summaries.length === 0) {
    aiSummaryText.textContent = 'Generating realm chronicle...';
    aiTimestamp.textContent = '';
    refreshAiButton?.setAttribute('disabled', 'true');
    summaryDropdown.disabled = true;
    deleteSummaryButton.disabled = true;
    aiSummaryContainer.style.display = 'block';

    const summaryTextResult = await fetchAiSummaryDirectly(realmDetails);
    const timestamp = Date.now();

    const isErrorResult =
      summaryTextResult.startsWith('Error:') ||
      summaryTextResult.startsWith('Summary generation was blocked') ||
      summaryTextResult.startsWith('The AI chronicler seems') ||
      summaryTextResult.startsWith('Could not parse');

    if (isErrorResult) {
      aiSummaryText.textContent = summaryTextResult;
      aiTimestamp.textContent = 'Generation failed.';
      selectedSummary = null;
    } else {
      const newEntry = { text: summaryTextResult, timestamp };
      summaries.unshift(newEntry);
      summaries = summaries.slice(0, 52);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(summaries));
      } catch (e) {
        console.error('Error writing realm summary cache:', e); // Keep commented for prod
      }
      selectedSummary = newEntry;
    }

    refreshAiButton?.removeAttribute('disabled');
  } else {
    selectedSummary = summaries[0];
  }

  if (selectedSummary) {
    aiSummaryText.textContent = selectedSummary.text;
    aiTimestamp.textContent = selectedSummary.timestamp
      ? `Chronicle generated: ${new Date(selectedSummary.timestamp).toLocaleString()}`
      : '';
    summaryDropdown.disabled = summaries.length <= 1; // Also disable if only 1 summary
    deleteSummaryButton.disabled = summaries.length === 0;
  } else if (!forceRefresh && summaries.length === 0) {
    aiSummaryText.textContent = 'No chronicles available for this realm.';
    aiTimestamp.textContent = '';
    summaryDropdown.disabled = true;
    deleteSummaryButton.disabled = true;
  }
  // If forceRefresh failed, error message is already set

  populateDropdown(summaries, 0);
  aiSummaryContainer.style.display = 'block';
}

function populateDropdown(summaries, selectedIdx = 0) {
  if (!summaryDropdown) return;

  summaryDropdown.innerHTML = '';
  if (summaries && summaries.length > 0) {
    summaries.forEach((entry, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Chronicle ${index + 1} (${new Date(entry.timestamp).toLocaleString()})`;
      if (index === selectedIdx) option.selected = true;
      summaryDropdown.appendChild(option);
    });
    summaryDropdown.disabled = summaries.length <= 1; // Disable if only one option
    if (deleteSummaryButton)
      deleteSummaryButton.disabled = summaries.length === 0;
  } else {
    const option = document.createElement('option');
    option.textContent = 'No saved chronicles';
    option.disabled = true;
    summaryDropdown.appendChild(option);
    summaryDropdown.disabled = true;
    if (deleteSummaryButton) deleteSummaryButton.disabled = true;
  }
}

function handleDeleteSummary(realmDetails) {
  if (!realmDetails || !realmDetails.region || !realmDetails.slug) {
    console.error('Cannot delete summary, missing realm identifiers.'); // Keep commented for prod
    return;
  }
  if (!summaryDropdown) {
    console.error('Cannot delete summary, dropdown element missing.'); // Keep commented for prod
    return;
  }

  const key = `${AI_CACHE_PREFIX}${realmDetails.region}-${realmDetails.slug}-list`;
  const summaries = JSON.parse(localStorage.getItem(key) || '[]');
  const selectedIdx = parseInt(summaryDropdown.value);

  if (
    summaries.length > 0 &&
    !isNaN(selectedIdx) &&
    selectedIdx >= 0 &&
    selectedIdx < summaries.length
  ) {
    summaries.splice(selectedIdx, 1);
    localStorage.setItem(key, JSON.stringify(summaries));
    displayAiSummary(realmDetails, summaries.length === 0);
  } else {
    console.warn(
      'Could not delete summary - index out of bounds or no summaries exist.',
    ); // Keep commented for prod
  }
}

// --- Initialization ---
async function initializePage() {
  await loadHeaderFooter();

  // DOM Elements Assignment
  realmNameEl = document.querySelector('#realmName');
  realmRegionValueEl = document.querySelector('#realmRegionValue');
  realmStatusValueEl = document.querySelector('#realmStatusValue');
  realmPopulationValueEl = document.querySelector('#realmPopulationValue');
  realmTypeValueEl = document.querySelector('#realmTypeValue');
  realmCategoryValueEl = document.querySelector('#realmCategoryValue');
  realmTimezoneValueEl = document.querySelector('#realmTimezoneValue');
  includedRealmsEl = document.querySelector('#includedRealms'); // This is the <p> tag
  aiSummaryContainer = document.querySelector('#ai-summary-container');
  realmDetailSection = document.querySelector('.realm-detail');
  aiSummaryText = document.querySelector('#ai-summary-text');
  aiTimestamp = document.querySelector('#ai-timestamp');
  refreshAiButton = document.querySelector('#refresh-ai-summary');
  summaryDropdown = document.querySelector('#summary-select');
  deleteSummaryButton = document.querySelector('#delete-summary');
  modal = document.querySelector('#delete-confirm-modal');
  confirmBtn = document.querySelector('#confirm-delete');
  cancelBtn = document.querySelector('#cancel-delete');

  if (!realmNameEl || !realmDetailSection) {
    console.error(
      'CRITICAL: Realm name display or main detail section missing. Aborting.',
    ); // Keep commented for prod
    document.body.innerHTML =
      '<p>Error: Page structure is broken. Cannot display realm details.</p>';
    return;
  }
  if (
    !aiSummaryContainer ||
    !aiSummaryText ||
    !aiTimestamp ||
    !refreshAiButton ||
    !summaryDropdown ||
    !deleteSummaryButton
  ) {
    console.warn(
      'One or more AI summary elements not found. AI features may be disabled.',
    ); // Keep commented for prod
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
  }

  const realmSlug = getParam('realmSlug');
  const region = getParam('region');
  const urlType = getParam('urlType');

  if (!realmSlug || !region || !urlType) {
    console.error(
      'Missing required parameters (realmSlug, region, urlType) in URL',
    ); // Keep commented for prod
    realmNameEl.textContent = 'Error';
    if (realmDetailSection)
      realmDetailSection.innerHTML = `<p class="error-message">Error: Missing realm, region, or game version information in the URL.</p>`; // Use innerHTML here to clear potential loading messages
    return;
  }

  const namespacePrefix = mapUrlTypeToApiNamespace(urlType);
  if (!namespacePrefix) {
    console.error(`Unsupported urlType: ${urlType}`); // Keep commented for prod
    realmNameEl.textContent = 'Error';
    if (realmDetailSection)
      realmDetailSection.innerHTML = `<p class="error-message">Error: Unsupported game version specified.</p>`;
    return;
  }

  // --- Set Initial Loading State ---
  // Set title immediately
  realmNameEl.textContent = `${realmSlug.replace(/-/g, ' ')} (${region.toUpperCase()})`;

  let token;
  try {
    token = await getAccessToken();
    if (!token) throw new Error('Authentication token was empty.');
  } catch (error) {
    console.error('Failed to retrieve access token:', error); // Keep commented for prod
    realmNameEl.textContent = 'Authentication Error';
    // Overwrite the whole details section with the auth error
    if (realmDetailSection) {
      realmDetailSection.innerHTML = ''; // Clear section
      const titleH2 = document.createElement('h2'); // Recreate title
      titleH2.id = 'realmName';
      titleH2.textContent = 'Authentication Error';
      const errorP = document.createElement('p');
      errorP.className = 'error-message';
      errorP.textContent = `Error: Could not authenticate with the Blizzard API. ${error.message}`;
      realmDetailSection.appendChild(titleH2);
      realmDetailSection.appendChild(errorP);
    }
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    return;
  }

  let realmDetailsResult;
  try {
    realmDetailsResult = await fetchRealmDetailsApi(
      region,
      namespacePrefix,
      realmSlug,
      token,
    );
    // renderBlizzardDetails will now correctly update the 'Loading...' text in the spans
    renderBlizzardDetails(realmDetailsResult, region.toUpperCase());

    // Display AI summary only if core data fetch didn't return an error object
    if (realmDetailsResult && !realmDetailsResult.error && aiSummaryContainer) {
      await displayAiSummary(realmDetailsResult, false);
    } else {
      if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    }
  } catch (fetchError) {
    // This catches errors thrown by fetchRealmDetailsApi itself (e.g., network errors)
    console.error(
      'Unhandled error during realm detail fetch/render process:',
      fetchError,
    ); // Keep commented for prod
    realmNameEl.textContent = 'Error';
    const errorMsg = `<p class="error-message">A critical error occurred loading realm data: ${fetchError.message}</p>`;
    // Replace content of core details div or section
    const coreDetailsDiv = document.querySelector('#realm-core-details');
    if (coreDetailsDiv) {
      coreDetailsDiv.innerHTML = errorMsg;
    } else if (realmDetailSection) {
      // Fallback if core details div isn't found
      realmDetailSection.innerHTML = ''; // Clear first
      const titleH2 = document.createElement('h2');
      titleH2.id = 'realmName';
      titleH2.textContent = 'Error';
      realmDetailSection.appendChild(titleH2);
      realmDetailSection.insertAdjacentHTML('beforeend', errorMsg); // Add error after title
    }
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    return;
  }

  // --- Event Listeners ---
  if (refreshAiButton && realmDetailsResult && !realmDetailsResult.error) {
    refreshAiButton.addEventListener('click', () => {
      displayAiSummary(realmDetailsResult, true);
    });
  } else if (!refreshAiButton) {
    console.warn('Refresh AI button not found.'); // Keep commented for prod
  }

  const copyWrapper = document.querySelector('#copy-ai-wrapper');
  const copyLabel = copyWrapper?.querySelector('.copy-label');

  if (copyWrapper && aiSummaryText && copyLabel) {
    const doCopy = () => {
      const summary = aiSummaryText.textContent;
      if (
        !summary ||
        summary.startsWith('Generating') ||
        summary.startsWith('Error:') ||
        summary.startsWith('No chronicle') ||
        summary.startsWith('Cannot load')
      )
        return;

      navigator.clipboard
        .writeText(summary)
        .then(() => {
          copyLabel.textContent = 'Copied!';
          copyWrapper.classList.add('copied');
          setTimeout(() => {
            copyLabel.textContent = 'Copy';
            copyWrapper.classList.remove('copied');
          }, 1500);
        })
        .catch((err) => {
          console.error('Clipboard copy failed:', err); // Keep commented for prod
          copyLabel.textContent = 'Error';
          copyWrapper.classList.add('error');
          setTimeout(() => {
            copyLabel.textContent = 'Copy';
            copyWrapper.classList.remove('error');
          }, 1500);
        });
    };
    copyWrapper.addEventListener('click', doCopy);
    copyWrapper.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doCopy();
      }
    });
  } else {
    console.warn('Copy button elements not found.'); // Keep commented for prod
  }

  if (
    summaryDropdown &&
    aiSummaryText &&
    aiTimestamp &&
    realmDetailsResult &&
    !realmDetailsResult.error
  ) {
    summaryDropdown.addEventListener('change', () => {
      const selectedIdx = parseInt(summaryDropdown.value);
      const key = `${AI_CACHE_PREFIX}${realmDetailsResult.region}-${realmDetailsResult.slug}-list`;
      const summaries = JSON.parse(localStorage.getItem(key) || '[]');
      const selected = summaries[selectedIdx];
      if (selected) {
        aiSummaryText.textContent = selected.text;
        aiTimestamp.textContent = `Chronicle generated: ${new Date(selected.timestamp).toLocaleString()}`;
      }
    });
  } else if (!summaryDropdown) {
    console.warn('Summary dropdown not found.'); // Keep commented for prod
  }

  if (
    deleteSummaryButton &&
    modal &&
    confirmBtn &&
    cancelBtn &&
    realmDetailsResult &&
    !realmDetailsResult.error
  ) {
    deleteSummaryButton.addEventListener('click', () => {
      if (deleteSummaryButton.disabled) return;
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';
      confirmBtn.focus();
    });

    confirmBtn.addEventListener('click', () => {
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      handleDeleteSummary(realmDetailsResult);
      if (refreshAiButton) refreshAiButton.focus();
    });

    cancelBtn.addEventListener('click', () => {
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
      if (deleteSummaryButton) deleteSummaryButton.focus();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        if (deleteSummaryButton) deleteSummaryButton.focus();
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (modal.getAttribute('aria-hidden') === 'true') return;
      const focusableElements = modal.querySelectorAll('button');
      if (!focusableElements || focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });
  } else if (!modal || !confirmBtn || !cancelBtn) {
    console.warn('Delete confirmation modal elements not found.'); // Keep commented for prod
    if (deleteSummaryButton) deleteSummaryButton.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', initializePage);
