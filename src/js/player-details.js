import {
  loadHeaderFooter,
  getParam,
  mapUrlTypeToApiNamespace,
  getPrimaryName,
  slugify,
} from './utils.mjs';
import { getAccessToken } from './blizzAPI.js';

// --- Constants ---
const AI_CACHE_PREFIX = 'aiPlayerSummary-';
const API_REQUEST_TIMEOUT = 10000; // For Blizzard API, AI timeout is handled by Netlify/Gemini

// --- Declare DOM Element Variables (assigned IN initializePage) ---
let loadingMessageEl,
  contentEl,
  errorEl,
  nameTitleEl,
  avatarImgEl,
  avatarLoadingEl,
  avatarUnavailableEl,
  levelEl,
  raceEl,
  classEl,
  genderEl,
  factionEl,
  realmEl,
  regionEl,
  titleEl,
  guildEl,
  ilvlSection,
  ilvlEl,
  achievementsSection,
  achievementsEl,
  mountsSection,
  mountsEl,
  petsSection,
  petsEl,
  gameVersionEl,
  aiSummaryContainer,
  aiSummaryText,
  aiTimestamp,
  refreshAiButton,
  summaryDropdown,
  deleteSummaryButton;

// --- Helper Functions ---
// ... (showError, hideError, showContent, fetchWithTimeout remain the same) ...
function showError(message) {
  console.log('showError called. errorEl is:', errorEl);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  } else {
    console.error(
      'FATAL: Could not find #detail-error-message element in the DOM when trying to show error. Message:',
      message,
    );
    alert(
      `Page Error: Could not display error message correctly.\nDetails: ${message}`,
    );
  }
  if (loadingMessageEl) loadingMessageEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'none';
  if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
  console.error('Player Details Error:', message);
}

function hideError() {
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
}

function showContent() {
  hideError();
  if (loadingMessageEl) loadingMessageEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';
}

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
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = {
          type: response.status,
          title: response.statusText,
          detail: `HTTP error ${response.status}`,
        };
      }
      console.error('API Error Response:', errorData);
      let errorMessage = `API Error ${errorData.type || response.status}: ${errorData.title || response.statusText}`;
      if (errorData.detail) errorMessage += ` - ${errorData.detail}`;
      if (response.status === 404)
        errorMessage = `Character or realm not found (${response.status}). Please check spelling and region.`;
      throw new Error(errorMessage);
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeout / 1000} seconds.`);
    }
    throw error;
  }
}

// --- API Data Fetching ---
// fetchPlayerData remains IDENTICAL to your version that fetches guild rank and member count
// Make sure this function correctly returns all fields needed by the server-side prompt builder
async function fetchPlayerData(
  region,
  urlType,
  realmSlug,
  characterName,
  token,
) {
  const profileNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'profile');
  if (!profileNamespacePrefix) {
    throw new Error(`Unsupported game version type: ${urlType}`);
  }
  const fullProfileNamespace = `${profileNamespacePrefix}-${region}`;
  const locale = 'en_US';

  const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}`;
  const headers = { Authorization: `Bearer ${token}` };
  const profileParams = `?namespace=${fullProfileNamespace}&locale=${locale}`;

  try {
    const basicProfile = await fetchWithTimeout(`${baseUrl}${profileParams}`, {
      headers,
    });
    if (!basicProfile) {
      throw new Error('Failed to fetch basic character profile.');
    }

    const promisesToAwait = {
      media: fetchWithTimeout(`${baseUrl}/character-media${profileParams}`, {
        headers,
      }).catch((e) => {
        console.warn('Media fetch failed (non-critical):', e);
        return null;
      }),
      mountsCollection:
        urlType !== 'classicera'
          ? fetchWithTimeout(`${baseUrl}/collections/mounts${profileParams}`, {
              headers,
            }).catch((e) => {
              console.warn('Mounts fetch failed (non-critical):', e);
              return null;
            })
          : Promise.resolve(null),
      petsCollection:
        urlType !== 'classicera'
          ? fetchWithTimeout(`${baseUrl}/collections/pets${profileParams}`, {
              headers,
            }).catch((e) => {
              console.warn('Pets fetch failed (non-critical):', e);
              return null;
            })
          : Promise.resolve(null),
      achievementSummary: fetchWithTimeout(
        `${baseUrl}/achievements${profileParams}`,
        { headers },
      ).catch((e) => {
        console.error('Achievements fetch error details:', e);
        return null;
      }),
      guildRoster: null,
    };

    let guildInfo = null;

    if (basicProfile.guild) {
      const guildNameSlug = slugify(basicProfile.guild.name);
      const guildRealmSlug = basicProfile.guild.realm.slug;
      const guildNamespace = `profile-${region}`;
      const guildRosterUrl = `https://${region}.api.blizzard.com/data/wow/guild/${guildRealmSlug}/${guildNameSlug}/roster?namespace=${guildNamespace}&locale=${locale}`;

      guildInfo = {
        name: basicProfile.guild.name,
        realmSlug: guildRealmSlug,
        nameSlug: guildNameSlug,
      };

      promisesToAwait.guildRoster = fetchWithTimeout(guildRosterUrl, {
        headers,
      }).catch((e) => {
        console.error(
          `Guild Roster fetch failed for ${guildInfo.name} on ${guildInfo.realmSlug}:`,
          e.message,
        );
        return null;
      });
    } else {
      promisesToAwait.guildRoster = Promise.resolve(null);
    }

    const results = await Promise.all(Object.values(promisesToAwait));
    const [
      media,
      mountsCollection,
      petsCollection,
      achievementSummary,
      guildRoster,
    ] = results;

    const averageItemLevel = basicProfile.average_item_level ?? null;
    const characterAchievementPoints = basicProfile.achievement_points ?? null;

    let uniquePetCount = null;
    if (petsCollection?.pets && Array.isArray(petsCollection.pets)) {
      const uniqueSpeciesIds = new Set(
        petsCollection.pets.map((pet) => pet?.species?.id).filter((id) => id),
      );
      uniquePetCount = uniqueSpeciesIds.size;
    } else if (petsCollection === null && urlType !== 'classicera') {
      uniquePetCount = null;
    } else {
      uniquePetCount = 0;
    }

    const mountCount =
      mountsCollection?.mounts?.length ??
      (mountsCollection === null && urlType !== 'classicera' ? null : 0);

    let guildRank = null;
    let guildMemberCount = null;

    if (guildRoster?.members && Array.isArray(guildRoster.members)) {
      guildMemberCount = guildRoster.members.length;

      const memberInfo = guildRoster.members.find(
        (member) =>
          member.character.id === basicProfile.id &&
          member.character.realm.slug === basicProfile.realm.slug,
      );
      if (memberInfo) {
        guildRank = memberInfo.rank;
      } else {
        console.warn(
          `Character ${basicProfile.name} (ID: ${basicProfile.id}) not found in fetched roster for guild ${guildInfo?.name || 'unknown'}.`,
        );
      }
    } else if (guildInfo && guildRoster === null) {
      console.warn(
        `Could not retrieve roster details for guild ${guildInfo.name}. Rank and member count unknown.`,
      );
    }

    let has100kHKs = false;
    let has250kHKs = false;
    let isBattlemaster = false;
    if (achievementSummary?.achievements) {
      const completedAchieveIds = new Set(
        achievementSummary.achievements
          .filter((ach) => ach.completed_timestamp)
          .map((ach) => ach.id),
      );
      has250kHKs = completedAchieveIds.has(2336);
      has100kHKs = completedAchieveIds.has(583);
      isBattlemaster = completedAchieveIds.has(783);
    }

    const playerData = {
      name: basicProfile.name,
      id: basicProfile.id, // Keep ID for potential future use, maybe cache keys?
      level: basicProfile.level,
      race: getPrimaryName(basicProfile.race.name),
      // Send the class name expected by the prompt builder
      character_class: getPrimaryName(basicProfile.character_class.name),
      faction: getPrimaryName(basicProfile.faction.name),
      gender: getPrimaryName(basicProfile.gender.name),
      realm: getPrimaryName(basicProfile.realm.name),
      realmSlug: basicProfile.realm.slug, // Keep for cache keys
      region: region.toUpperCase(), // Keep for cache keys / display
      title:
        basicProfile.active_title?.display_string.replace(
          '{name}',
          basicProfile.name,
        ) || null,
      guild: guildInfo?.name || null,
      guildRank: guildRank,
      guildMemberCount: guildMemberCount, // Send count
      averageItemLevel: averageItemLevel,
      achievementPoints: characterAchievementPoints,
      mountsCollected: mountCount,
      petsCollected: uniquePetCount,
      // Still needed for display
      avatarUrl:
        media?.assets?.find((a) => a.key === 'avatar')?.value ||
        media?.assets?.find((a) => a.key === 'inset')?.value ||
        media?.assets?.find((a) => a.key === 'main')?.value ||
        null,
      urlType: urlType, // Still needed for display logic
      gameVersionDisplay:
        urlType === 'retail'
          ? 'Retail'
          : urlType === 'classic'
            ? 'Cataclysm'
            : 'Classic Era',
      has100kHKs: has100kHKs,
      has250kHKs: has250kHKs,
      isBattlemaster: isBattlemaster,
    };

    return playerData;
  } catch (error) {
    console.error('Error during player data fetching/processing:', error);
    throw error;
  }
}

// --- UI Rendering ---
// renderPlayerData remains IDENTICAL - it only uses data for display
function renderPlayerData(
  playerData,
  regionParam,
  urlTypeParam,
  realmSlugParam,
  characterNameParam,
) {
  if (!playerData) {
    showError(
      `Could not load details for ${characterNameParam} on ${realmSlugParam}.`,
    );
    return;
  }
  if (
    !nameTitleEl ||
    !levelEl ||
    !raceEl ||
    !classEl ||
    !genderEl ||
    !realmEl ||
    !regionEl ||
    !titleEl ||
    !guildEl ||
    !gameVersionEl ||
    !factionEl ||
    !avatarImgEl ||
    !avatarLoadingEl ||
    !avatarUnavailableEl
  ) {
    console.error(
      'One or more core player detail DOM elements not found during render!',
    );
    showError(
      'Internal page error: Could not find elements to display player data.',
    );
    return;
  }
  document.title = `${playerData.name} | Player Details`;
  // Use character_class here if that's the property name you settled on in playerData
  nameTitleEl.textContent = `${playerData.name} - ${playerData.level} ${playerData.race} ${playerData.character_class}`;
  levelEl.textContent = playerData.level ?? 'N/A';
  raceEl.textContent = playerData.race ?? 'N/A';
  classEl.textContent = playerData.character_class ?? 'N/A'; // Update if needed
  genderEl.textContent = playerData.gender ?? 'N/A';
  realmEl.textContent = playerData.realm ?? realmSlugParam;
  regionEl.textContent = regionParam.toUpperCase();
  titleEl.textContent = playerData.title ?? 'N/A';
  guildEl.textContent = playerData.guild ?? 'No Guild';
  gameVersionEl.textContent = playerData.gameVersionDisplay ?? urlTypeParam;
  factionEl.textContent = playerData.faction ?? 'N/A';
  factionEl.classList.remove('faction-alliance', 'faction-horde');
  if (playerData.faction?.toLowerCase() === 'alliance')
    factionEl.classList.add('faction-alliance');
  else if (playerData.faction?.toLowerCase() === 'horde')
    factionEl.classList.add('faction-horde');
  if (playerData.avatarUrl) {
    avatarImgEl.src = playerData.avatarUrl;
    avatarImgEl.alt = `${playerData.name} Avatar`;
    avatarImgEl.style.display = 'block';
    avatarLoadingEl.style.display = 'none';
    avatarUnavailableEl.style.display = 'none';
    avatarImgEl.onerror = () => {
      console.warn('Failed to load avatar image:', playerData.avatarUrl);
      avatarImgEl.style.display = 'none';
      avatarUnavailableEl.textContent = 'Avatar image failed to load.';
      avatarUnavailableEl.style.display = 'block';
    };
  } else {
    avatarImgEl.style.display = 'none';
    avatarLoadingEl.style.display = 'none';
    avatarUnavailableEl.style.display = 'block';
  }
  function renderOptional(sectionEl, valueEl, value) {
    if (value !== null && value !== undefined && sectionEl && valueEl) {
      valueEl.textContent = value.toLocaleString();
      sectionEl.classList.add('visible');
    } else if (sectionEl) {
      // Ensure section is hidden if value is null/undefined
      sectionEl.classList.remove('visible');
    }
  }
  renderOptional(ilvlSection, ilvlEl, playerData.averageItemLevel);
  renderOptional(
    achievementsSection,
    achievementsEl,
    playerData.achievementPoints,
  );
  renderOptional(mountsSection, mountsEl, playerData.mountsCollected);
  renderOptional(petsSection, petsEl, playerData.petsCollected);
  showContent();
  if (aiSummaryContainer) aiSummaryContainer.style.display = 'block';
}

// --- AI Summary Functions ---
// SIMPLIFIED: Sends data to server, handles response
async function fetchAiSummaryDirectly(playerData) {
  if (!playerData) return 'Cannot generate summary without player data.';

  const API_URL = '/.netlify/functions/generateGeminiSummary'; // Your function endpoint

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // *** Send ONLY the playerData object ***
      body: JSON.stringify({ playerData: playerData }),
    });

    const data = await response.json(); // Always parse JSON response

    if (!response.ok) {
      // Handle errors reported by the Netlify function / Gemini
      console.error('AI Server Error Response:', data);
      throw new Error(
        data.error || `AI service request failed: ${response.status}`,
      );
    }

    // --- Process SUCCESSFUL response from Gemini (forwarded by Netlify) ---

    // Check for content blocking (using structure returned by Gemini via your function)
    if (data.promptFeedback?.blockReason) {
      console.warn(
        'AI content blocked (prompt):',
        data.promptFeedback.blockReason,
        data.promptFeedback.safetyRatings,
      );
      return `Summary generation was blocked (prompt issue): ${data.promptFeedback.blockReason}.`;
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.warn('No candidate returned from AI.', data);
      return 'The AI chronicler seems to be unavailable or speechless.';
    }

    const finishReason = candidate.finishReason;
    const safetyRatings = candidate.safetyRatings;

    if (finishReason === 'SAFETY') {
      console.warn(
        'AI content blocked (generation):',
        finishReason,
        safetyRatings,
      );
      return `Summary generation was blocked for safety reasons during writing.`;
    }
    if (finishReason === 'RECITATION') {
      console.warn(
        'AI content generation stopped due to recitation:',
        safetyRatings,
      );
      return `Summary generation stopped: Resembled existing sources too closely.`;
    }
    if (finishReason === 'OTHER') {
      console.warn(
        'AI content generation stopped for other reasons:',
        safetyRatings,
      );
      return `The chronicle writing stopped unexpectedly.`;
    }

    const summaryText = candidate.content?.parts?.[0]?.text;

    if (summaryText) {
      let finalText = summaryText.trim();
      if (finishReason === 'MAX_TOKENS') {
        console.warn(`AI response truncated because MAX_TOKENS was reached.`);
        finalText +=
          '\n\n*[...The chronicle trails off, limited by the constraints of this telling...]*';
      }
      return finalText;
    } else {
      console.warn('Unexpected AI response structure or empty content:', data);
      return 'Could not parse AI summary from the response.';
    }
  } catch (error) {
    console.error('Error fetching AI summary from server:', error);
    // Make error message slightly more user-friendly
    let displayError = `Error generating summary: ${error.message}`;
    if (error.message.includes('Failed to fetch')) {
      displayError = 'Error: Could not connect to the AI summary service.';
    } else if (error.message.includes('AI service request failed')) {
      displayError = `Error: The AI summary service reported an issue (${error.message.split(': ')[1] || 'Unknown'}).`;
    }
    return displayError;
  }
}

// displayAiSummary remains mostly the same, but relies on the simplified fetchAiSummaryDirectly
// Ensure cache keys use the same player data fields as before
async function displayAiSummary(playerData, forceRefresh = false) {
  if (
    !aiSummaryContainer ||
    !playerData?.name ||
    !playerData?.realmSlug ||
    !playerData?.region
  ) {
    console.log(
      'Skipping AI summary: Missing required elements or player data.',
    );
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    return;
  }

  // Use consistent fields for the cache key
  const baseKey = `${AI_CACHE_PREFIX}${playerData.region}-${playerData.realmSlug}-${playerData.name.toLowerCase()}`;
  const summaryListKey = `${baseKey}-list`;

  let allSummaries = [];
  try {
    allSummaries = JSON.parse(localStorage.getItem(summaryListKey) || '[]');
    if (!Array.isArray(allSummaries)) allSummaries = []; // Handle corrupt cache data
  } catch (e) {
    console.error('Error reading summary cache:', e);
    localStorage.removeItem(summaryListKey); // Clear corrupt cache
    allSummaries = [];
  }

  let summaryObj = null;

  if (forceRefresh || allSummaries.length === 0) {
    aiSummaryText.textContent = 'Generating chronicle...';
    aiTimestamp.textContent = '';
    refreshAiButton.disabled = true;
    summaryDropdown.disabled = true;
    deleteSummaryButton.disabled = true;

    // Call the *simplified* function which now talks to your Netlify function
    const newText = await fetchAiSummaryDirectly(playerData);
    const timestamp = new Date().toISOString();

    // Check if the result indicates an error before caching/displaying
    const isErrorResult =
      newText.startsWith('Error:') ||
      newText.startsWith('Summary generation was blocked') ||
      newText.startsWith('The AI chronicler seems') ||
      newText.startsWith('Could not parse') ||
      newText.startsWith('Summary generation stopped');

    if (isErrorResult) {
      // Display the error message directly
      aiSummaryText.textContent = newText;
      aiTimestamp.textContent = 'Generation failed.';
      summaryObj = null; // Ensure we don't try to use an old summary
    } else {
      // Success - Cache and prepare to display
      const newSummary = { text: newText.trim(), timestamp };
      allSummaries.unshift(newSummary); // Add new valid summary to top
      try {
        localStorage.setItem(summaryListKey, JSON.stringify(allSummaries));
      } catch (e) {
        console.error('Error writing summary cache:', e);
        // Potentially handle quota exceeded errors here if needed
      }
      summaryObj = newSummary; // Use the newly generated summary
    }

    refreshAiButton.disabled = false; // Re-enable button after attempt
  }

  // If not regenerating, or if regeneration failed BUT there are old ones, use most recent *valid* one
  if (!summaryObj && allSummaries.length > 0) {
    summaryObj = allSummaries[0]; // Load the most recent from cache
  }

  // Update UI based on whether we have a valid summaryObj
  if (summaryObj) {
    aiSummaryText.textContent = summaryObj.text;
    aiTimestamp.textContent = `Chronicle generated: ${new Date(summaryObj.timestamp).toLocaleString()}`;
    summaryDropdown.disabled = false;
    deleteSummaryButton.disabled = false;
  } else if (!forceRefresh && allSummaries.length === 0) {
    // Only show "No chronicle" if not actively trying to refresh and cache is empty
    aiSummaryText.textContent = 'No chronicle available for this adventurer.';
    aiTimestamp.textContent = '';
    summaryDropdown.disabled = true;
    deleteSummaryButton.disabled = true;
  }
  // If forceRefresh failed, the error message is already displayed

  // Populate dropdown (even if refresh failed, show old ones)
  if (summaryDropdown) {
    summaryDropdown.innerHTML = ''; // Clear existing options
    if (allSummaries.length > 0) {
      allSummaries.forEach((s, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        // Select the first option (most recent) by default
        if (index === 0) opt.selected = true;
        opt.textContent = `Chronicle ${index + 1} (${new Date(s.timestamp).toLocaleString()})`;
        summaryDropdown.appendChild(opt);
      });
      summaryDropdown.disabled = false;
    } else {
      // Add a placeholder if empty
      const opt = document.createElement('option');
      opt.textContent = 'No saved chronicles';
      opt.disabled = true;
      summaryDropdown.appendChild(opt);
      summaryDropdown.disabled = true;
    }
  }

  // Enable delete button if there are summaries to delete
  if (deleteSummaryButton) {
    deleteSummaryButton.disabled = allSummaries.length === 0;
  }

  aiSummaryContainer.style.display = 'block';
}

// --- Initialization ---
// initializePage remains mostly the same, just calls the updated functions
async function initializePage() {
  await loadHeaderFooter();

  // *** ASSIGN DOM ELEMENTS HERE ***
  loadingMessageEl = document.querySelector('#loading-message');
  contentEl = document.querySelector('.player-detail-content');
  errorEl = document.querySelector('#detail-error-message');
  nameTitleEl = document.querySelector('#character-name-title');
  avatarImgEl = document.querySelector('#player-avatar');
  avatarLoadingEl = document.querySelector('#avatar-loading');
  avatarUnavailableEl = document.querySelector('#avatar-unavailable');
  levelEl = document.querySelector('#player-level');
  raceEl = document.querySelector('#player-race');
  classEl = document.querySelector('#player-class');
  genderEl = document.querySelector('#player-gender');
  factionEl = document.querySelector('#player-faction');
  realmEl = document.querySelector('#player-realm');
  regionEl = document.querySelector('#player-region');
  titleEl = document.querySelector('#player-title');
  guildEl = document.querySelector('#player-guild');
  ilvlSection = document.querySelector('#item-level-section');
  ilvlEl = document.querySelector('#player-ilvl');
  achievementsSection = document.querySelector('#achievements-section');
  achievementsEl = document.querySelector('#player-achievements');
  mountsSection = document.querySelector('#mounts-section');
  mountsEl = document.querySelector('#player-mounts');
  petsSection = document.querySelector('#pets-section');
  petsEl = document.querySelector('#player-pets');
  gameVersionEl = document.querySelector('#player-game-version');
  aiSummaryContainer = document.querySelector('#ai-summary-container');
  aiSummaryText = document.querySelector('#ai-summary-text');
  aiTimestamp = document.querySelector('#ai-timestamp');
  refreshAiButton = document.querySelector('#refresh-ai-summary');
  summaryDropdown = document.querySelector('#summary-select');
  deleteSummaryButton = document.querySelector('#delete-summary');

  if (!errorEl || !loadingMessageEl || !contentEl) {
    console.error(
      'CRITICAL: Could not find essential layout elements. Aborting.',
    );
    alert('A critical error occurred loading page components.');
    return;
  }
  // Warning for optional elements is fine
  if (
    !ilvlSection ||
    !ilvlEl ||
    !achievementsSection ||
    !achievementsEl ||
    !mountsSection ||
    !mountsEl ||
    !petsSection ||
    !petsEl ||
    !aiSummaryContainer ||
    !aiSummaryText ||
    !aiTimestamp ||
    !refreshAiButton ||
    !summaryDropdown ||
    !deleteSummaryButton
  ) {
    console.warn(
      'One or more optional detail or AI control DOM elements were not found.',
    );
  }

  const region = getParam('region');
  const urlType = getParam('urlType');
  const realmSlug = getParam('realmSlug');
  const characterName = getParam('characterName');
  if (!region || !urlType || !realmSlug || !characterName) {
    showError('Error: Missing required player details in URL.');
    return;
  }

  loadingMessageEl.style.display = 'block';
  contentEl.style.display = 'none';
  if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
  hideError();

  let token;
  try {
    token = await getAccessToken();
    if (!token) throw new Error('Could not authenticate with Blizzard API.');
  } catch (authError) {
    showError(`Authentication Error: ${authError.message}`);
    return;
  }

  // Moved handleDeleteSummary definition earlier for clarity
  function handleDeleteSummary(playerDataForCacheKey) {
    if (!playerDataForCacheKey) {
      console.error('Cannot delete summary, player data missing.');
      return;
    }
    const selectedIdx = parseInt(summaryDropdown.value);
    // Use same key logic as displayAiSummary
    const key = `${AI_CACHE_PREFIX}${playerDataForCacheKey.region}-${playerDataForCacheKey.realmSlug}-${playerDataForCacheKey.name.toLowerCase()}-list`;
    const summaries = JSON.parse(localStorage.getItem(key) || '[]');

    if (
      summaries.length > 0 &&
      selectedIdx >= 0 &&
      selectedIdx < summaries.length
    ) {
      summaries.splice(selectedIdx, 1); // Remove the selected summary
      localStorage.setItem(key, JSON.stringify(summaries));

      // After deleting, refresh the display to show the new latest summary or empty state
      // Pass the original playerData object which is still valid for cache keys etc.
      displayAiSummary(playerDataForCacheKey, false); // false = don't force regen, just reload cache
    } else {
      console.warn(
        'Could not delete summary - index out of bounds or no summaries exist.',
      );
    }
  }

  let playerDataResult;
  try {
    playerDataResult = await fetchPlayerData(
      region,
      urlType,
      realmSlug,
      characterName,
      token,
    );

    renderPlayerData(
      playerDataResult,
      region,
      urlType,
      realmSlug,
      characterName,
    );

    // Initial display of AI summary (will load from cache or trigger generation)
    await displayAiSummary(playerDataResult, false); // false = don't force regen on initial load

    // --- Event Listeners ---
    // Ensure elements exist before adding listeners
    if (refreshAiButton) {
      refreshAiButton.addEventListener('click', () => {
        if (playerDataResult) {
          displayAiSummary(playerDataResult, true); // true = force regeneration
        } else {
          console.warn('Cannot refresh AI summary, player data is missing.');
        }
      });
    }

    const copyWrapper = document.querySelector('#copy-ai-wrapper');
    const copyLabel = copyWrapper?.querySelector('.copy-label');

    if (copyWrapper && aiSummaryText && copyLabel) {
      const doCopy = () => {
        // Get text *directly* from the display element at time of click
        const summary = aiSummaryText.textContent;
        // Basic check to not copy placeholders/errors
        if (
          !summary ||
          summary.startsWith('Generating chronicle...') ||
          summary.startsWith('Error:') ||
          summary.startsWith('No chronicle')
        )
          return;

        navigator.clipboard
          .writeText(summary)
          .then(() => {
            copyLabel.textContent = 'Copied!';
            copyWrapper.classList.add('copied'); // Add class for visual feedback
            setTimeout(() => {
              copyLabel.textContent = 'Copy';
              copyWrapper.classList.remove('copied');
            }, 1500);
          })
          .catch((err) => {
            console.error('Clipboard copy failed:', err);
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
      console.warn('Copy button elements not found.');
    }

    if (summaryDropdown && aiSummaryText && aiTimestamp) {
      summaryDropdown.addEventListener('change', () => {
        const selectedIdx = parseInt(summaryDropdown.value);
        // Use the playerDataResult captured in the closure for the cache key
        if (!playerDataResult) return;

        const key = `${AI_CACHE_PREFIX}${playerDataResult.region}-${playerDataResult.realmSlug}-${playerDataResult.name.toLowerCase()}-list`;
        const summaries = JSON.parse(localStorage.getItem(key) || '[]');
        const selected = summaries[selectedIdx];
        if (selected) {
          aiSummaryText.textContent = selected.text;
          aiTimestamp.textContent = `Chronicle generated: ${new Date(selected.timestamp).toLocaleString()}`;
        }
      });
    } else {
      console.warn('Summary dropdown or display elements not found.');
    }

    const modal = document.querySelector('#delete-confirm-modal');
    const confirmBtn = document.querySelector('#confirm-delete');
    const cancelBtn = document.querySelector('#cancel-delete');

    if (deleteSummaryButton && modal && confirmBtn && cancelBtn) {
      deleteSummaryButton.addEventListener('click', () => {
        if (deleteSummaryButton.disabled) return; // Don't show modal if button is disabled
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex'; // Or 'block', ensure it's visible
        confirmBtn.focus(); // Focus first focusable element in modal
      });

      confirmBtn.addEventListener('click', () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        handleDeleteSummary(playerDataResult); // Use captured playerDataResult
        if (refreshAiButton) refreshAiButton.focus(); // Return focus reasonably
      });

      cancelBtn.addEventListener('click', () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        if (deleteSummaryButton) deleteSummaryButton.focus(); // Return focus to trigger button
      });

      // Close modal on Escape key
      document.addEventListener('keydown', (e) => {
        if (
          e.key === 'Escape' &&
          modal.getAttribute('aria-hidden') === 'false'
        ) {
          modal.setAttribute('aria-hidden', 'true');
          modal.style.display = 'none';
          if (deleteSummaryButton) deleteSummaryButton.focus(); // Return focus
        }
      });

      // Basic Focus Trap for Modal
      modal.addEventListener('keydown', (e) => {
        if (modal.getAttribute('aria-hidden') === 'true') return; // Ignore if modal hidden

        const focusableElements = modal.querySelectorAll('button');
        if (!focusableElements || focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.key === 'Tab') {
          if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            // Tab
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      });
    } else {
      console.warn('Delete confirmation modal elements not found.');
    }
  } catch (fetchError) {
    showError(`Error loading player data: ${fetchError.message}`);
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', initializePage);
