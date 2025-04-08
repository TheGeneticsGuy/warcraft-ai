// src/js/player-details.js
import {
    loadHeaderFooter,
    getParam,
    mapUrlTypeToApiNamespace,
    getPrimaryName, // Ensure getPrimaryName is imported
} from './utils.mjs';
import { getAccessToken } from './blizzAPI.js';

// --- Constants ---
const AI_CACHE_PREFIX = 'aiPlayerSummary-';
const API_REQUEST_TIMEOUT = 10000;

// --- Declare DOM Element Variables (assigned IN initializePage) ---
let loadingMessageEl,
    contentEl,
    errorEl,
    nameTitleEl,
    avatarContainerEl,
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
    refreshAiButton;

// --- Helper Functions ---
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
// Simplified: removed unnecessary fetches for equipment & stats summaries
async function fetchPlayerData(
    region,
    urlType,
    realmSlug,
    characterName,
    token,
) {
    const apiNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'profile');
    if (!apiNamespacePrefix) {
        throw new Error(`Unsupported game version type: ${urlType}`);
    }
    const fullApiNamespace = `${apiNamespacePrefix}-${region}`;
    const locale = 'en_US';

    const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}`;
    const headers = { Authorization: `Bearer ${token}` };
    const params = `?namespace=${fullApiNamespace}&locale=${locale}`;

    try {
        // Fetch required and optional data concurrently
        const [
            basicProfile, // Main profile - contains iLvl, achievement points
            media, // For avatar
            // Conditional fetches for collections (keep these)
            mountsCollection,
            petsCollection,
        ] = await Promise.all([
            fetchWithTimeout(`${baseUrl}${params}`, { headers }), // REQUIRED

            fetchWithTimeout(`${baseUrl}/character-media${params}`, { headers }) // For avatar
                .catch((e) => {
                    console.warn('Media fetch failed (non-critical):', e);
                    return null;
                }),

            urlType !== 'classicera' // Fetch collections only if not Classic Era
                ? fetchWithTimeout(`${baseUrl}/collections/mounts${params}`, {
                    headers,
                }).catch((e) => {
                    console.warn('Mounts fetch failed (non-critical):', e);
                    return null;
                })
                : Promise.resolve(null),

            urlType !== 'classicera'
                ? fetchWithTimeout(`${baseUrl}/collections/pets${params}`, {
                    headers,
                }).catch((e) => {
                    console.warn('Pets fetch failed (non-critical):', e);
                    return null;
                })
                : Promise.resolve(null),
        ]);

        // Log results to see what we got
        console.log('API Fetch Results:', {
            basicProfile,
            media,
            mountsCollection,
            petsCollection,
        });

        if (!basicProfile) {
            // If the basic profile itself failed, we can't proceed meaningfully.
            throw new Error('Failed to fetch basic character profile.');
        }

        // --- Process Data ---
        // Extract iLvl and Achievement points DIRECTLY from basicProfile
        const averageItemLevel = basicProfile.average_item_level ?? null; // From main profile
        const achievementPoints = basicProfile.achievement_points ?? null; // From main profile

        // Calculate unique pet count
        let uniquePetCount = null;
        if (petsCollection?.pets && Array.isArray(petsCollection.pets)) {
            const uniqueSpeciesIds = new Set();
            petsCollection.pets.forEach((pet) => {
                if (pet?.species?.id) uniqueSpeciesIds.add(pet.species.id);
            });
            uniquePetCount = uniqueSpeciesIds.size;
        } else if (petsCollection === null && urlType !== 'classicera') {
            uniquePetCount = null;
        } else {
            uniquePetCount = 0;
        }

        // Mount count
        const mountCount =
            mountsCollection?.mounts?.length ??
            (mountsCollection === null && urlType !== 'classicera' ? null : 0);

        const playerData = {
            name: basicProfile.name,
            id: basicProfile.id,
            level: basicProfile.level,
            race: getPrimaryName(basicProfile.race.name),
            class: getPrimaryName(basicProfile.character_class.name),
            faction: getPrimaryName(basicProfile.faction.name),
            gender: getPrimaryName(basicProfile.gender.name),
            realm: getPrimaryName(basicProfile.realm.name),
            realmSlug: basicProfile.realm.slug,
            region: region.toUpperCase(),
            title:
                basicProfile.active_title?.display_string.replace(
                    '{name}',
                    basicProfile.name,
                ) || null,
            guild: basicProfile.guild?.name || null,
            averageItemLevel: averageItemLevel, // Use direct value
            achievementPoints: achievementPoints, // Use direct value
            mountsCollected: mountCount,
            petsCollected: uniquePetCount,
            avatarUrl:
                media?.assets?.find((a) => a.key === 'avatar')?.value ||
                media?.assets?.find((a) => a.key === 'inset')?.value ||
                media?.assets?.find((a) => a.key === 'main')?.value ||
                null,
            urlType: urlType,
            gameVersionDisplay:
                urlType === 'retail'
                    ? 'Retail'
                    : urlType === 'classic'
                        ? 'Cataclysm'
                        : 'Classic Era',
        };

        console.log('Processed Player Data:', playerData);
        return playerData;
    } catch (error) {
        console.error('Error during player data fetching/processing:', error);
        throw error;
    }
}

// --- UI Rendering ---
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

    // Safety check elements needed for basic display
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
    nameTitleEl.textContent = `${playerData.name} - ${playerData.level} ${playerData.race} ${playerData.class}`;

    levelEl.textContent = playerData.level ?? 'N/A';
    raceEl.textContent = playerData.race ?? 'N/A';
    classEl.textContent = playerData.class ?? 'N/A';
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

    // CORRECTED renderOptional function using CSS classes
    function renderOptional(sectionEl, valueEl, value) {
        const sectionId = sectionEl ? sectionEl.id : 'null_section';
        // Always remove first in case of re-render
        if (sectionEl) sectionEl.classList.remove('visible');
        else {
            console.warn(
                `renderOptional: Section element missing for potential value:`,
                value,
            );
            return;
        }

        // Log inputs for debugging specific sections
        if (
            [
                'mounts-section',
                'pets-section',
                'item-level-section',
                'achievements-section',
            ].includes(sectionId)
        )

            // Check BOTH elements exist AND value is valid (including 0)
            if (value !== null && value !== undefined && sectionEl && valueEl) {
                valueEl.textContent = value.toLocaleString();
                sectionEl.classList.add('visible'); // USE CLASS TO SHOW
                if (
                    [
                        'mounts-section',
                        'pets-section',
                        'item-level-section',
                        'achievements-section',
                    ].includes(sectionId)
                ) {
                }
            } else {
                if (
                    [
                        'mounts-section',
                        'pets-section',
                        'item-level-section',
                        'achievements-section',
                    ].includes(sectionId)
                ) {
                    let reason = [];
                    if (value === null || value === undefined)
                        reason.push('value is null/undefined');
                    if (!sectionEl) reason.push('sectionEl is null');
                    if (!valueEl) reason.push('valueEl is null');
                    console.warn(
                        `renderOptional: Did NOT add 'visible' to ${sectionId}. Reason(s): ${reason.join(', ')}`,
                    );
                }
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
async function fetchAiSummaryDirectly(playerData) {
    // ... (Keep AI fetch function exactly as it was in the previous correct version) ...
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Gemini API key (VITE_GEMINI_API_KEY) is not set.');
        return 'AI summary configuration error (missing key).';
    }
    if (!playerData) return 'Cannot generate summary without player data.';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    let prompt = `Adopt the persona of a seasoned Azerothian chronicler recounting tales of heroes of Azeroth, of stories of great adventurers. Write a moderate summary, aiming for 4 to 5 paragraphs. Make it an engaging and flavorful summary of the adventurer known as "${playerData.name}".\n\nThis ${playerData.race} ${playerData.class} of level ${playerData.level} hails from the ${playerData.realm} realm in the ${playerData.region} region and fights for the ${playerData.faction}. Please refrain from using gendered language. In your summary, act as if you do not know if the player is male or female.`;
    if (playerData.title) {
        prompt += ` They currently bear the title "${playerData.title}".`;
    }
    if (playerData.guild) {
        prompt += ` They are a member of the guild "${playerData.guild}".`;
    } else {
        prompt += ` They currently wander Azeroth unaffiliated with a guild.`;
    }
    if (playerData.averageItemLevel) {
        prompt += ` Their prowess in combat is reflected in their average equipment power of ${playerData.averageItemLevel}.`;
    }
    if (playerData.achievementPoints) {
        prompt += ` Their long list of deeds across the world has earned them ${playerData.achievementPoints.toLocaleString()} achievement points.`;
    }
    const mentionMounts =
        playerData.mountsCollected !== null && playerData.mountsCollected >= 500;
    const mentionPets =
        playerData.petsCollected !== null && playerData.petsCollected >= 500;
    if (mentionMounts || mentionPets) {
        prompt += ` Their stables and menagerie are noteworthy, containing`;
        if (mentionMounts) {
            prompt += ` ${playerData.mountsCollected.toLocaleString()} mounts`;
            if (mentionPets) prompt += ` and`;
        }
        if (mentionPets) {
            prompt += ` ${playerData.petsCollected.toLocaleString()} unique companion pets`;
        }
        prompt += `.`;
    }
    prompt += ` Weave these details into a narrative fitting the Warcraft universe. Mention their game version context (${playerData.gameVersionDisplay}). Be creative and evocative, but ground the summary in the provided facts. If some details (like collections or item level) are missing, omit them gracefully rather than stating "N/A". Do not invent information not provided. Ensure the response contains 4 to 5 distinct paragraphs. End with a sentence that sparks curiosity about their future adventures. Try to avoid being too cheesy with things like "gather around weary travelers" and instead tell it as if you are sharing a tale of a legend and hero of Azeroth.`;
    console.log('AI Prompt:', prompt);
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
            return `Summary generation was blocked due to: ${data.promptFeedback.blockReason}. Please adjust the content or try again.`;
        }
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'MAX_TOKENS') {
            console.warn(`AI response truncated because MAX_TOKENS was reached.`);
        }
        if (finishReason === 'SAFETY') {
            console.warn(
                'AI content blocked due to safety during generation:',
                data.candidates[0].safetyRatings,
            );
            return `Summary generation was blocked for safety reasons.`;
        }
        const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (summaryText) {
            let finalText = summaryText.trim();
            if (finishReason === 'MAX_TOKENS') {
                finalText += '\n\n[...Chronicle truncated due to length limit.]';
            }
            return finalText;
        } else {
            console.warn('Unexpected AI response structure or empty content:', data);
            return 'Could not parse AI summary from the response.';
        }
    } catch (error) {
        console.error('Error fetching AI summary directly:', error);
        return `Error generating summary: ${error.message.includes('API key not valid') ? 'Invalid API Key' : error.message}`;
    }
}

async function displayAiSummary(playerData, forceRefresh = false) {
    // ... (Keep this function exactly as it was in the previous correct version) ...
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
    if (!aiSummaryText || !aiTimestamp || !refreshAiButton) {
        console.error('AI Summary DOM elements missing!');
        return;
    }
    aiSummaryContainer.style.display = 'block';
    const cacheKey = `${AI_CACHE_PREFIX}${playerData.region}-${playerData.realmSlug}-${playerData.name.toLowerCase()}`;
    const cachedData = localStorage.getItem(cacheKey);
    let summary = '',
        timestamp = null;
    if (cachedData && !forceRefresh) {
        try {
            const parsed = JSON.parse(cachedData);
            summary = parsed.summary;
            timestamp = parsed.timestamp;
        } catch (e) {
            console.error('Failed to parse cached AI summary', e);
            localStorage.removeItem(cacheKey);
        }
    }
    if (!summary || forceRefresh) {
        aiSummaryText.textContent = 'Generating chronicle...';
        aiTimestamp.textContent = '';
        refreshAiButton.disabled = true;
        summary = await fetchAiSummaryDirectly(playerData);
        timestamp = new Date().toISOString();
        if (
            !summary.startsWith('Error') &&
            !summary.startsWith('AI summary configuration error') &&
            !summary.startsWith('Summary generation was blocked')
        ) {
            localStorage.setItem(cacheKey, JSON.stringify({ summary, timestamp }));
        } else {
            timestamp = null;
        }
        refreshAiButton.disabled = false;
    }
    aiSummaryText.textContent =
        summary || 'No chronicle available for this adventurer.';
    if (timestamp) {
        aiTimestamp.textContent = `Chronicle generated: ${new Date(timestamp).toLocaleString()}`;
    } else {
        aiTimestamp.textContent = '';
    }
}

// --- Initialization ---
async function initializePage() {
    await loadHeaderFooter();

    // *** ASSIGN DOM ELEMENTS HERE ***
    loadingMessageEl = document.querySelector('#loading-message');
    contentEl = document.querySelector('.player-detail-content');
    errorEl = document.querySelector('#detail-error-message');
    nameTitleEl = document.querySelector('#character-name-title');
    avatarContainerEl = document.querySelector('#player-avatar-container');
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

    // Check critical elements IMMEDIATELY after selecting them
    if (!errorEl || !loadingMessageEl || !contentEl) {
        console.error(
            'CRITICAL: Could not find essential layout elements (#loading-message, .player-detail-content, #detail-error-message). Aborting.',
        );
        alert(
            'A critical error occurred loading the page components. Please try refreshing.',
        );
        return; // Stop if essential layout is broken
    }

    if (!ilvlSection || !ilvlEl || !achievementsSection || !achievementsEl || !mountsSection || !mountsEl || !petsSection || !petsEl) {
        console.warn("One or more optional detail DOM elements were not found. Check IDs in HTML and JS.");
        // Don't necessarily stop execution, but be aware.
    }

    // --- Get URL Params ---
    const region = getParam('region');
    const urlType = getParam('urlType');
    const realmSlug = getParam('realmSlug');
    const characterName = getParam('characterName');

    if (!region || !urlType || !realmSlug || !characterName) {
        showError(
            'Error: Missing required player details in URL. Please perform a search again.',
        );
        return;
    }

    // Initial UI State
    loadingMessageEl.style.display = 'block';
    contentEl.style.display = 'none';
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    hideError(); // Safe now

    // --- Fetch Token ---
    let token;
    try {
        token = await getAccessToken();
        if (!token) throw new Error('Could not authenticate with Blizzard API.');
    } catch (authError) {
        showError(`Authentication Error: ${authError.message}`);
        return;
    }

    // --- Fetch and Render Player Data ---
    let playerData;
    try {
        playerData = await fetchPlayerData(
            region,
            urlType,
            realmSlug,
            characterName,
            token,
        );
        // The fetchPlayerData function now throws if basicProfile fails, so we don't need a separate check here.
        renderPlayerData(playerData, region, urlType, realmSlug, characterName);
        await displayAiSummary(playerData);

        if (refreshAiButton) {
            refreshAiButton.addEventListener('click', () => {
                if (playerData) {
                    displayAiSummary(playerData, true);
                } else {
                    console.warn('Cannot refresh AI summary, player data is missing.');
                }
            });
        } else {
            console.warn('Refresh AI button not found.');
        }
    } catch (fetchError) {
        // This will catch errors from fetchPlayerData or renderPlayerData
        showError(`Error loading player data: ${fetchError.message}`);
        if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    }
}

// --- Page Load Execution ---
document.addEventListener('DOMContentLoaded', initializePage);
