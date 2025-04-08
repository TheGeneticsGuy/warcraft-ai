import {
    loadHeaderFooter,
    getParam,
    mapUrlTypeToApiNamespace,
} from './utils.mjs';
import { getAccessToken } from './blizzAPI.js';

// --- Constants ---
const AI_CACHE_PREFIX = 'aiPlayerSummary-';
const API_REQUEST_TIMEOUT = 10000; // 10 seconds timeout for API requests -- just so it's not forever

// --- DOM Elements ---
const loadingMessageEl = document.querySelector('#loading-message');
const contentEl = document.querySelector('.player-detail-content');
const errorEl = document.querySelector('#detail-error-message');

// Detail Fields
const nameTitleEl = document.querySelector('#character-name-title');
const avatarContainerEl = document.querySelector('#player-avatar-container');
const avatarImgEl = document.querySelector('#player-avatar');
const avatarLoadingEl = document.querySelector('#avatar-loading');
const avatarUnavailableEl = document.querySelector('#avatar-unavailable');
const levelEl = document.querySelector('#player-level');
const raceEl = document.querySelector('#player-race');
const classEl = document.querySelector('#player-class');
const factionEl = document.querySelector('#player-faction');
const realmEl = document.querySelector('#player-realm');
const regionEl = document.querySelector('#player-region');
const titleEl = document.querySelector('#player-title');
const guildEl = document.querySelector('#player-guild');
const ilvlSection = document.querySelector('#item-level-section');
const ilvlEl = document.querySelector('#player-ilvl');
const achievementsSection = document.querySelector('#achievements-section');
const achievementsEl = document.querySelector('#player-achievements');
const mountsSection = document.querySelector('#mounts-section');
const mountsEl = document.querySelector('#player-mounts');
const petsSection = document.querySelector('#pets-section');
const petsEl = document.querySelector('#player-pets');
const gameVersionEl = document.querySelector('#player-game-version');

// AI Summary Elements
const aiSummaryContainer = document.querySelector('#ai-summary-container');
const aiSummaryText = document.querySelector('#ai-summary-text');
const aiTimestamp = document.querySelector('#ai-timestamp');
const refreshAiButton = document.querySelector('#refresh-ai-summary');

// --- Helper functions to keep the code clearner---

function showError(message) {
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
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

// Simple fetch wrapper with timeout
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
            // Try to parse Blizzard's error format
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
        // Potential empty body for 204 No Content etc.
        if (response.status === 204) {
            return null;
        }
        return await response.json();
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`API request timed out after ${timeout / 1000} seconds.`);
        }
        // Re-throw other errors (like the one above)
        throw error;
    }
}

// --- API Data Fetching ---

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
    const locale = 'en_US'; // Using a consistent locale for data processing

    const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}`;
    const headers = { Authorization: `Bearer ${token}` };
    const params = `?namespace=${fullApiNamespace}&locale=${locale}`;

    console.log(
        `Fetching data for: ${characterName}@${realmSlug} [${region}, ${urlType}]`,
    );
    console.log(`Using namespace: ${fullApiNamespace}`);

    try {
        const basicProfilePromise = fetchWithTimeout(`${baseUrl}${params}`, {
            headers,
        });
        const equipmentPromise = fetchWithTimeout(`${baseUrl}/equipment${params}`, {
            headers,
        }).catch((e) => {
            console.warn('Equipment fetch failed:', e);
            return null;
        }); // Optional
        const mediaPromise = fetchWithTimeout(
            `${baseUrl}/character-media${params}`,
            { headers },
        ).catch((e) => {
            console.warn('Media fetch failed:', e);
            return null;
        }); // Optional

        // Conditional fetching based on game type (Classic Era has limited endpoints)
        let statsPromise = null;
        let collectionsMountsPromise = null;
        let collectionsPetsPromise = null;

        if (urlType !== 'classicera') {
            // Assume Retail and Cata have these
            statsPromise = fetchWithTimeout(
                `${baseUrl}/achievements/statistics${params}`,
                { headers },
            ).catch((e) => {
                console.warn('Stats fetch failed:', e);
                return null;
            });
            collectionsMountsPromise = fetchWithTimeout(
                `${baseUrl}/collections/mounts${params}`,
                { headers },
            ).catch((e) => {
                console.warn('Mounts fetch failed:', e);
                return null;
            });
            collectionsPetsPromise = fetchWithTimeout(
                `${baseUrl}/collections/pets${params}`,
                { headers },
            ).catch((e) => {
                console.warn('Pets fetch failed:', e);
                return null;
            });
        } else {
            console.log('Skipping advanced stats/collections fetch for Classic Era.');
        }

        // Await all promises concurrently
        const [
            basicProfile,
            equipment,
            media,
            stats,
            mountsCollection,
            petsCollection,
        ] = await Promise.all([
            basicProfilePromise,
            equipmentPromise,
            mediaPromise,
            statsPromise,
            collectionsMountsPromise,
            collectionsPetsPromise,
        ]);

        // --- Process Data ---
        const playerData = {
            name: basicProfile.name,
            id: basicProfile.id,
            level: basicProfile.level,
            race: basicProfile.race.name,
            class: basicProfile.character_class.name,
            faction: basicProfile.faction.name,
            gender: basicProfile.gender.name,
            realm: basicProfile.realm.name,
            realmSlug: basicProfile.realm.slug, // Store slug for caching key
            region: region.toUpperCase(), // Display region
            title:
                basicProfile.active_title?.display_string.replace(
                    '{name}',
                    basicProfile.name,
                ) || 'N/A',
            guild: basicProfile.guild?.name || 'No Guild',
            // Optional data points
            averageItemLevel: equipment?.equipped_item_level || null,
            achievementPoints: stats?.total_points || null,
            mountsCollected: mountsCollection?.mounts?.length || null,
            petsCollected: petsCollection?.pets?.length || null,
            // Find avatar URL (prefer 'avatar' over 'inset' or 'main')
            avatarUrl:
                media?.assets?.find((a) => a.key === 'avatar')?.value ||
                media?.assets?.find((a) => a.key === 'inset')?.value ||
                media?.assets?.find((a) => a.key === 'main')?.value ||
                null,
            // Include for context and AI prompt
            urlType: urlType,
            gameVersionDisplay:
                urlType === 'retail'
                    ? 'Retail'
                    : urlType === 'classic'
                        ? 'Cataclysm'
                        : 'Classic Era',
        };

        return playerData;
    } catch (error) {
        console.error('Error fetching player data:', error);
        // Re-throw the specific error message we got from fetchWithTimeout or API
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
        // Fallback if not caught earlier
        showError(
            `Could not load details for ${characterNameParam} on ${realmSlugParam}.`,
        );
        return;
    }

    // Set page title
    document.title = `${playerData.name} | Player Details`;

    // Set main header
    nameTitleEl.textContent = `${playerData.name} - ${playerData.level} ${playerData.race} ${playerData.class}`;

    // Basic Info
    levelEl.textContent = playerData.level || 'N/A';
    raceEl.textContent = playerData.race || 'N/A';
    classEl.textContent = playerData.class || 'N/A';
    realmEl.textContent = playerData.realm || realmSlugParam; // Fallback to param if needed
    regionEl.textContent = regionParam.toUpperCase();
    titleEl.textContent = playerData.title || 'N/A';
    guildEl.textContent = playerData.guild || 'N/A';
    gameVersionEl.textContent = playerData.gameVersionDisplay || urlTypeParam; // Fallback

    // Faction with potential styling
    factionEl.textContent = playerData.faction || 'N/A';
    factionEl.classList.remove('faction-alliance', 'faction-horde'); // Clear previous
    if (playerData.faction?.toLowerCase() === 'alliance') {
        factionEl.classList.add('faction-alliance');
    } else if (playerData.faction?.toLowerCase() === 'horde') {
        factionEl.classList.add('faction-horde');
    }

    // Avatar
    if (playerData.avatarUrl) {
        avatarImgEl.src = playerData.avatarUrl;
        avatarImgEl.alt = `${playerData.name} Avatar`;
        avatarImgEl.style.display = 'block';
        avatarLoadingEl.style.display = 'none';
        avatarUnavailableEl.style.display = 'none';
        avatarImgEl.onerror = () => {
            // Handle image loading errors
            console.warn('Failed to load avatar image:', playerData.avatarUrl);
            avatarImgEl.style.display = 'none';
            avatarUnavailableEl.textContent = 'Avatar image failed to load.';
            avatarUnavailableEl.style.display = 'block';
        };
    } else {
        avatarImgEl.style.display = 'none';
        avatarLoadingEl.style.display = 'none';
        avatarUnavailableEl.style.display = 'block'; // Show unavailable message
    }

    //  show if data exists
    function renderOptional(sectionEl, valueEl, value) {
        if (value !== null && value !== undefined) {
            valueEl.textContent = value.toLocaleString(); // Format the numbers nicely
            sectionEl.style.display = 'flex'; //
        } else {
            sectionEl.style.display = 'none';
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

    // Show the main content area now that it's populated
    showContent();

    // Enable AI section (it handles its own loading message)
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'block';
}

// --- AI Summary Functions (Adapted from realm-detail.js) ---

async function fetchAiSummaryDirectly(playerData) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Gemini API key (VITE_GEMINI_API_KEY) is not set.');
        return 'AI summary configuration error (missing key).';
    }
    if (!playerData) return 'Cannot generate summary without player data.';

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`; // Use 2.0 Flash

    // Construct a detailed prompt using available data
    let prompt = `Adopt the persona of a seasoned Azerothian chronicler recounting tales of heroes of Azeroth, of stories of great adventurers. Write a moderate summary, no more than 4 or 5 paragraphs. Make it an engaging and flavorful summary of the adventurer known as "${playerData.name}".This ${playerData.race} ${playerData.class} of level ${playerData.level} hails from the ${playerData.realm} realm in the ${playerData.region} region and fights for the ${playerData.faction}. Please refrain from using gendered language. In your summary, act as if you do not know if the player is male or female.`;

    if (playerData.title && playerData.title !== 'N/A') {
        prompt += `They currently bear the title "${playerData.title}". `;
    }
    if (playerData.guild && playerData.guild !== 'No Guild') {
        // Could add more detail if guild rank was available
        prompt += `They are a member of the guild "${playerData.guild}". `;
    } else {
        prompt += `They currently wander Azeroth unaffiliated with a guild. `;
    }

    // Add optional details if available
    if (playerData.averageItemLevel) {
        prompt += `Their prowess in combat is reflected in their average equipment power of ${playerData.averageItemLevel}. `;
    }
    if (playerData.achievementPoints) {
        prompt += `Their long list of deeds across the world has earned them ${playerData.achievementPoints.toLocaleString()} achievement points. `;
    }
    if (
        playerData.mountsCollected !== null ||
        playerData.petsCollected !== null
    ) {
        prompt += `Their stables and menagerie are noteworthy, containing `;
        if (playerData.mountsCollected !== null) {
            prompt += `${playerData.mountsCollected.toLocaleString()} mounts${playerData.petsCollected !== null ? ' and ' : ''}`;
        }
        if (playerData.petsCollected !== null) {
            prompt += `${playerData.petsCollected.toLocaleString()} companion pets`;
        }
        prompt += `. `;
    }

    // Conclude the prompt
    prompt += `Weave these details into a narrative fitting the Warcraft universe. Be creative and evocative, but ground the summary in the provided facts. If some details (like collections or item level) are missing, omit them gracefully rather than stating "N/A". If their mount or pet collection is small, don't talk about it. A reasonable mount or pet collection is anything above 500 of each. Do not invent information not provided. End with a sentence that sparks curiosity about their future adventures. Try to avoid being too cheesy with things like "gather around weary travelers" and instead tell it as if you are sharing a tale of a legend and hero of Azeroth.`;

    console.log('AI Prompt:', prompt); // To copy and paste

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7, // Adjust creativity
                    maxOutputTokens: 1024,      // MAX NUMBER OF WORDS!!! Keep it to 1000 ish
                },
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

        // Handle potential safety blocks or empty responses - -This is Google's Recommended handling errors
        if (data.promptFeedback?.blockReason) {
            console.warn(
                'AI content blocked:',
                data.promptFeedback.blockReason,
                data.promptFeedback.safetyRatings,
            );
            return `Summary generation was blocked due to: ${data.promptFeedback.blockReason}. Please adjust the content or try again.`;
        }
        if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            console.warn(
                'AI content blocked due to safety during generation:',
                data.candidates[0].safetyRatings,
            );
            return `Summary generation was blocked for safety reasons.`;
        }

        // Extract text safely
        const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (summaryText) {
            return summaryText.trim();
        } else {
            console.warn('Unexpected AI response structure or empty content:', data);
            return 'Could not parse AI summary from the response.';
        }
    } catch (error) {
        console.error('Error fetching AI summary directly:', error);
        // Provide a user-friendly error message
        return `Error generating summary: ${error.message.includes('API key not valid') ? 'Invalid API Key' : error.message}`;
    }
}

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
        if (aiSummaryContainer) aiSummaryContainer.style.display = 'none'; // Ensure it's hidden
        return;
    }

    // Ensure container is visible before showing loading state
    aiSummaryContainer.style.display = 'block';

    const cacheKey = `${AI_CACHE_PREFIX}${playerData.region}-${playerData.realmSlug}-${playerData.name.toLowerCase()}`;
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
        aiSummaryText.textContent = 'Generating chronicle...';
        aiTimestamp.textContent = '';
        refreshAiButton.disabled = true;

        summary = await fetchAiSummaryDirectly(playerData); // Pass the whole object

        timestamp = new Date().toISOString();
        // Avoid caching error messages
        if (
            !summary.startsWith('Error') &&
            !summary.startsWith('AI summary configuration error') &&
            !summary.startsWith('Summary generation was blocked')
        ) {
            localStorage.setItem(cacheKey, JSON.stringify({ summary, timestamp }));
        } else {
            // If it's an error, don't update the timestamp display below
            timestamp = null;
        }

        refreshAiButton.disabled = false;
    }

    aiSummaryText.textContent =
        summary || 'No chronicle available for this adventurer.';
    if (timestamp) {
        aiTimestamp.textContent = `Chronicle generated: ${new Date(timestamp).toLocaleString()}`;
    } else {
        aiTimestamp.textContent = ''; // Clear timestamp if showing error or no cache
    }
}

// --- Initialization ---

async function initializePage() {
    await loadHeaderFooter();

    const region = getParam('region');
    const urlType = getParam('urlType');
    const realmSlug = getParam('realmSlug');
    const characterName = getParam('characterName'); // Raw name from URL

    // --- Validate Parameters ---
    if (!region || !urlType || !realmSlug || !characterName) {
        showError(
            'Error: Missing required player details in URL. Please perform a search again.',
        );
        return;
    }

    // Show loading state immediately
    if (loadingMessageEl) loadingMessageEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    hideError();

    let token;
    try {
        token = await getAccessToken();
        if (!token) {
            throw new Error('Could not authenticate with Blizzard API.');
        }
    } catch (authError) {
        showError(`Authentication Error: ${authError.message}`);
        return;
    }

    let playerData;
    try {
        playerData = await fetchPlayerData(
            region,
            urlType,
            realmSlug,
            characterName,
            token,
        );

        if (!playerData) {
            // This case might happen if fetchPlayerData returns null unexpectedly
            throw new Error('Received no data from the API.');
        }

        renderPlayerData(playerData, region, urlType, realmSlug, characterName); // Pass params for context/fallbacks

        // --- AI Summary Logic ---
        // Use the processed data from playerData for consistency
        await displayAiSummary(playerData); // Initial load (cached or new)

        // Add listener for the refresh button *after* initial load attempt
        if (refreshAiButton) {
            refreshAiButton.addEventListener('click', () => {
                // Ensure we have the latest playerData (though it shouldn't change without page reload)
                if (playerData) {
                    displayAiSummary(playerData, true); // Force refresh
                } else {
                    console.warn('Cannot refresh AI summary, player data is missing.');
                }
            });
        }
    } catch (fetchError) {
        // fetchPlayerData throws specific errors now, display them
        showError(`Error loading player data: ${fetchError.message}`);
        // Ensure AI section is hidden on fetch error
        if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    }
}

// --- Page Load Execution ---
document.addEventListener('DOMContentLoaded', initializePage);
