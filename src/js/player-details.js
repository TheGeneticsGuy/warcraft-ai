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
const API_REQUEST_TIMEOUT = 10000;

// For the AI Prompts
const ilvlThreshold = 500; // Only note the iLvl of the player in summary if 500 or higher iLvl as per expansion
const achievementThreshold = 20000; // Achievement points only note if > 20000
const mountThreshold = 400;
const petThreshold = 800;

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
async function fetchPlayerData(region, urlType, realmSlug, characterName, token) {
    const profileNamespacePrefix = mapUrlTypeToApiNamespace(urlType, 'profile');
    if (!profileNamespacePrefix) {
        throw new Error(`Unsupported game version type: ${urlType}`);
    }
    const fullProfileNamespace = `${profileNamespacePrefix}-${region}`;
    // NOTE: Guild roster uses 'profile' namespace too, like the realms page, but it's constructed slightly differently.
    const locale = 'en_US';

    const baseUrl = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}`;
    const headers = { Authorization: `Bearer ${token}` };
    const profileParams = `?namespace=${fullProfileNamespace}&locale=${locale}`;

    console.log(`Fetching data for: ${characterName}@${realmSlug} [${region}, ${urlType}]`);

    try {
        // --- Stage 1: Fetch Basic Profile First (needed for guild info) ---
        const basicProfile = await fetchWithTimeout(`${baseUrl}${profileParams}`, { headers });
        if (!basicProfile) {
            throw new Error("Failed to fetch basic character profile.");
        }
        console.log("Basic Profile Data:", basicProfile);

        // --- Stage 2: Prepare Conditional Fetches ---
        const promisesToAwait = {
            media: fetchWithTimeout(`${baseUrl}/character-media${profileParams}`, { headers })
                .catch(e => { console.warn("Media fetch failed (non-critical):", e); return null; }),
            mountsCollection: urlType !== 'classicera'
                ? fetchWithTimeout(`${baseUrl}/collections/mounts${profileParams}`, { headers })
                    .catch(e => { console.warn("Mounts fetch failed (non-critical):", e); return null; })
                : Promise.resolve(null),
            petsCollection: urlType !== 'classicera'
                ? fetchWithTimeout(`${baseUrl}/collections/pets${profileParams}`, { headers })
                    .catch(e => { console.warn("Pets fetch failed (non-critical):", e); return null; })
                : Promise.resolve(null),
            achievementSummary: fetchWithTimeout(`${baseUrl}/achievements${profileParams}`, { headers })
                .catch(e => { console.error("Achievements fetch error details:", e); return null; }),
            guildRoster: null // Initialize guildRoster promise
        };

        if (basicProfile.guild) {
            const guildNameSlug = slugify(basicProfile.guild.name);
            const guildRealmSlug = basicProfile.guild.realm.slug; // Use the realm slug from the character's guild data
            const guildNamespace = `profile-${region}`; // Guild API uses profile namespace
            const guildRosterUrl = `https://${region}.api.blizzard.com/data/wow/guild/${guildRealmSlug}/${guildNameSlug}/roster?namespace=${guildNamespace}&locale=${locale}`;
            promisesToAwait.guildRoster = fetchWithTimeout(guildRosterUrl, { headers })
                .catch(e => { console.error("Guild Roster fetch error details:", e); return null; });
        } else {
            promisesToAwait.guildRoster = Promise.resolve(null); // Resolve immediately if no guild
        }

        // --- Stage 3: Await all remaining fetches ---
        const results = await Promise.all(Object.values(promisesToAwait));
        const [
            media,
            mountsCollection,
            petsCollection,
            achievementSummary,
            guildRoster // Will be null if no guild or fetch failed
        ] = results; // Order matches Object.values(promisesToAwait)

        // --- Stage 4: Process Data ---
        const averageItemLevel = basicProfile.average_item_level ?? null;
        const characterAchievementPoints = basicProfile.achievement_points ?? null; // Character specific points

        // Calculate unique pet count (not total as that is less useful)
        let uniquePetCount = null;
        if (petsCollection?.pets && Array.isArray(petsCollection.pets)) {
            const uniqueSpeciesIds = new Set(petsCollection.pets.map(pet => pet?.species?.id).filter(id => id));
            uniquePetCount = uniqueSpeciesIds.size;
        } else if (petsCollection === null && urlType !== 'classicera') { uniquePetCount = null; }
        else { uniquePetCount = 0; }

        // Mount count
        const mountCount = mountsCollection?.mounts?.length ?? (mountsCollection === null && urlType !== 'classicera' ? null : 0);

        // Find Guild Rank
        let guildRank = null;
        if (guildRoster?.members) {
            const memberInfo = guildRoster.members.find(member => member.character.id === basicProfile.id && member.character.realm.slug === basicProfile.realm.slug);
            if (memberInfo) {
                guildRank = memberInfo.rank;
            } else {
                // console.warn("Character not found in fetched guild roster.");
            }
        }

        // Check for specific PvP Achievements
        let has100kHKs = false;
        let has250kHKs = false;
        let isBattlemaster = false;
        if (achievementSummary?.achievements) {
            const completedAchieveIds = new Set(
                achievementSummary.achievements
                    .filter(ach => ach.completed_timestamp) // Only completed achievements
                    .map(ach => ach.id)
            );
            // Let's check some cool PVP achievements!!! Achievement IDs confiremd wowhead.com
            has250kHKs = completedAchieveIds.has(2336); // 250,000 Honorable Kills ID
            has100kHKs = completedAchieveIds.has(583);  // 100,000 Honorable Kills ID (only relevant if 250k is false)
            isBattlemaster = completedAchieveIds.has(783); // Battlemaster ID
        }


        const playerData = {
            name: basicProfile.name, id: basicProfile.id, level: basicProfile.level,
            race: getPrimaryName(basicProfile.race.name), class: getPrimaryName(basicProfile.character_class.name),
            faction: getPrimaryName(basicProfile.faction.name), gender: getPrimaryName(basicProfile.gender.name),
            realm: getPrimaryName(basicProfile.realm.name), realmSlug: basicProfile.realm.slug,
            region: region.toUpperCase(),
            title: basicProfile.active_title?.display_string.replace('{name}', basicProfile.name) || null,
            guild: basicProfile.guild?.name || null, // Store name, rank is separate
            guildRank: guildRank, // Store the rank (number or null)
            averageItemLevel: averageItemLevel,
            achievementPoints: characterAchievementPoints, // Using character-specific for now
            mountsCollected: mountCount,
            petsCollected: uniquePetCount,
            avatarUrl: media?.assets?.find(a => a.key === 'avatar')?.value || media?.assets?.find(a => a.key === 'inset')?.value || media?.assets?.find(a => a.key === 'main')?.value || null,
            urlType: urlType, gameVersionDisplay: urlType === 'retail' ? 'Retail' : urlType === 'classic' ? 'Cataclysm' : 'Classic Era',
            // Add PvP achievement flags
            has100kHKs: has100kHKs,
            has250kHKs: has250kHKs,
            isBattlemaster: isBattlemaster
        };

        console.log("Processed Player Data:", playerData);
        return playerData; // Return only the processed player data object

    } catch (error) {
        console.error('Error during player data fetching/processing:', error);
        throw error; // Re-throw to be caught by initializePage
    }
}

// --- UI Rendering ---
function renderPlayerData(playerData, regionParam, urlTypeParam, realmSlugParam, characterNameParam) {
    if (!playerData) { showError(`Could not load details for ${characterNameParam} on ${realmSlugParam}.`); return; }
    if (!nameTitleEl || !levelEl || !raceEl || !classEl || !genderEl || !realmEl || !regionEl || !titleEl || !guildEl || !gameVersionEl || !factionEl || !avatarImgEl || !avatarLoadingEl || !avatarUnavailableEl) {
        console.error("One or more core player detail DOM elements not found during render!");
        showError("Internal page error: Could not find elements to display player data."); return;
    }
    document.title = `${playerData.name} | Player Details`;
    nameTitleEl.textContent = `${playerData.name} - ${playerData.level} ${playerData.race} ${playerData.class}`;
    levelEl.textContent = playerData.level ?? 'N/A'; raceEl.textContent = playerData.race ?? 'N/A';
    classEl.textContent = playerData.class ?? 'N/A'; genderEl.textContent = playerData.gender ?? 'N/A';
    realmEl.textContent = playerData.realm ?? realmSlugParam; regionEl.textContent = regionParam.toUpperCase();
    titleEl.textContent = playerData.title ?? 'N/A'; guildEl.textContent = playerData.guild ?? 'No Guild';
    gameVersionEl.textContent = playerData.gameVersionDisplay ?? urlTypeParam;
    factionEl.textContent = playerData.faction ?? 'N/A';
    factionEl.classList.remove('faction-alliance', 'faction-horde');
    if (playerData.faction?.toLowerCase() === 'alliance') factionEl.classList.add('faction-alliance');
    else if (playerData.faction?.toLowerCase() === 'horde') factionEl.classList.add('faction-horde');
    if (playerData.avatarUrl) {
        avatarImgEl.src = playerData.avatarUrl; avatarImgEl.alt = `${playerData.name} Avatar`;
        avatarImgEl.style.display = 'block'; avatarLoadingEl.style.display = 'none'; avatarUnavailableEl.style.display = 'none';
        avatarImgEl.onerror = () => { console.warn("Failed to load avatar image:", playerData.avatarUrl); avatarImgEl.style.display = 'none'; avatarUnavailableEl.textContent = 'Avatar image failed to load.'; avatarUnavailableEl.style.display = 'block'; };
    } else { avatarImgEl.style.display = 'none'; avatarLoadingEl.style.display = 'none'; avatarUnavailableEl.style.display = 'block'; }
    function renderOptional(sectionEl, valueEl, value) {
        if (value !== null && value !== undefined && sectionEl && valueEl) {
            valueEl.textContent = value.toLocaleString(); sectionEl.classList.add('visible');
        }
    }
    renderOptional(ilvlSection, ilvlEl, playerData.averageItemLevel);
    renderOptional(achievementsSection, achievementsEl, playerData.achievementPoints);
    renderOptional(mountsSection, mountsEl, playerData.mountsCollected);
    renderOptional(petsSection, petsEl, playerData.petsCollected);
    showContent();
    if (aiSummaryContainer) aiSummaryContainer.style.display = 'block';
}


// --- AI Summary Functions ---
async function fetchAiSummaryDirectly(playerData) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) { console.error('Gemini API key (VITE_GEMINI_API_KEY) is not set.'); return 'AI summary configuration error (missing key).'; }
    if (!playerData) return 'Cannot generate summary without player data.';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // --- Build the Prompt Conditionally ---
    let prompt = `Adopt the persona of a seasoned Azerothian chronicler recounting tales of heroes of Azeroth, of stories of great adventurers. Write a moderate summary, aiming for 4 to 5 paragraphs. Make it an engaging and flavorful summary of the adventurer known as "${playerData.name}".\n\n`;
    prompt += `This ${playerData.race} ${playerData.class} of level ${playerData.level} hails from the ${playerData.realm} realm in the ${playerData.region} region and fights for the ${playerData.faction}. In your summary, act as if you do not know if the player is male or female.`;

    if (playerData.title) { prompt += ` They currently bear the title "${playerData.title}".`; }

    if (playerData.guild && playerData.guildRank === 0) { // Check rank 0 for GM
        prompt += ` They stand as a pillar of their community, leading the guild "${playerData.guild}" as Guild Master.`;
    } else if (playerData.guild && (playerData.guildRank === 1 || playerData.guildRank === 2)) { // Check ranks 1 or 2 for Officer
        prompt += ` Within the guild "${playerData.guild}", they hold a position of authority as an Officer.`;
    } else if (playerData.guild) {
        prompt += ` They are a member of the guild "${playerData.guild}".`;
    } else {
        prompt += ` They currently wander Azeroth unaffiliated with a guild.`;
    }

    // Combat Prowess (Only mention if significant)
    if (playerData.averageItemLevel && playerData.averageItemLevel >= ilvlThreshold) {
        prompt += ` Their prowess in combat is reflected in their formidable average equipment power of ${playerData.averageItemLevel}.`;
    }

    // Achievements (Points & Specific PvP)

    if (playerData.isBattlemaster) {
        prompt += ` Known across the battlegrounds of Azeroth, they have earned the prestigious and hard-won title of Battlemaster.`;
    }
    // Only mentions 100k if they don't have 250k
    if (playerData.has250kHKs) {
        prompt += ` Their prowess in the theater of war is undeniable, having claimed over 250,000 honorable kills against foes of the opposing faction.`;
    } else if (playerData.has100kHKs) {
        prompt += ` A veteran of countless skirmishes, they have amassed over 100,000 honorable kills in service to their faction.`;
    }
    if (playerData.achievementPoints && playerData.achievementPoints >= achievementThreshold) {
        prompt += ` Their long list of deeds across the world has earned them a significant ${playerData.achievementPoints.toLocaleString()} achievement points.`;
    }

    // Collections
    const mentionMounts = playerData.mountsCollected !== null && playerData.mountsCollected >= mountThreshold;
    const mentionPets = playerData.petsCollected !== null && playerData.petsCollected >= petThreshold;
    if (mentionMounts || mentionPets) {
        prompt += ` Their dedication extends to collecting the wonders of Azeroth; their stables and menagerie are noteworthy, containing`;
        if (mentionMounts) { prompt += ` around ${playerData.mountsCollected.toLocaleString()} mounts`; if (mentionPets) prompt += ` and`; }
        if (mentionPets) { prompt += ` roughly ${playerData.petsCollected.toLocaleString()} unique companion pets`; }
        prompt += `.`;
    }

    prompt += `\n\nWeave these details (or lack thereof, omitting gracefully if details are sparse or insignificant) into a compelling narrative fitting the Warcraft universe. You do not need to use the exact sentences as I used above, it is merely to provide useful information for your narrative summary of the character. Mention their game version context (${playerData.gameVersionDisplay}) if they are playing on a Classic or Classic Era server. Do not mention this gameversion detail if they are on retail. Focus on making them sound like a notable figure or hero of Azeroth that stands for a righteous cause of not just their own faction, but of the people of Azeroth. End with a sentence that sparks curiosity about their past exploits or future adventures. Avoid clichés like "gather 'round".`;

    console.log("AI Prompt:", prompt);

    try {
        // Error protection generated by Gemini 2.5 to assist in their own prompt gen
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024, } }), });
        if (!response.ok) { const errorBody = await response.json().catch(() => ({ error: { message: `HTTP error ${response.status}` } })); console.error('Gemini API Error Response:', errorBody); throw new Error(errorBody.error?.message || `Gemini API request failed: ${response.status}`); }
        const data = await response.json();
        if (data.promptFeedback?.blockReason) { console.warn('AI content blocked:', data.promptFeedback.blockReason, data.promptFeedback.safetyRatings); return `Summary generation was blocked due to: ${data.promptFeedback.blockReason}. Please adjust the content or try again.`; }
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === "MAX_TOKENS") { console.warn(`AI response truncated because MAX_TOKENS was reached.`); }
        if (finishReason === "SAFETY") { console.warn('AI content blocked due to safety during generation:', data.candidates[0].safetyRatings); return `Summary generation was blocked for safety reasons.`; }
        const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (summaryText) { let finalText = summaryText.trim(); if (finishReason === "MAX_TOKENS") { finalText += "\n\n[...Chronicle truncated due to length limit.]"; } return finalText; }
        else { console.warn('Unexpected AI response structure or empty content:', data); return 'Could not parse AI summary from the response.'; }
    } catch (error) { console.error('Error fetching AI summary directly:', error); return `Error generating summary: ${error.message.includes('API key not valid') ? 'Invalid API Key' : error.message}`; }
}


async function displayAiSummary(playerData, forceRefresh = false) {
    // ... (Keep this function exactly as it was in the previous correct version) ...
    if (!aiSummaryContainer || !playerData?.name || !playerData?.realmSlug || !playerData?.region) { console.log("Skipping AI summary: Missing required elements or player data."); if (aiSummaryContainer) aiSummaryContainer.style.display = 'none'; return; }
    if (!aiSummaryText || !aiTimestamp || !refreshAiButton) { console.error("AI Summary DOM elements missing!"); return; }
    aiSummaryContainer.style.display = 'block'; const cacheKey = `${AI_CACHE_PREFIX}${playerData.region}-${playerData.realmSlug}-${playerData.name.toLowerCase()}`;
    const cachedData = localStorage.getItem(cacheKey); let summary = '', timestamp = null;
    if (cachedData && !forceRefresh) { try { const parsed = JSON.parse(cachedData); summary = parsed.summary; timestamp = parsed.timestamp; } catch (e) { console.error('Failed to parse cached AI summary', e); localStorage.removeItem(cacheKey); } }
    if (!summary || forceRefresh) {
        aiSummaryText.textContent = 'Generating chronicle...'; aiTimestamp.textContent = ''; refreshAiButton.disabled = true;
        summary = await fetchAiSummaryDirectly(playerData); // Pass enhanced playerData
        timestamp = new Date().toISOString();
        if (!summary.startsWith('Error') && !summary.startsWith('AI summary configuration error') && !summary.startsWith('Summary generation was blocked')) { localStorage.setItem(cacheKey, JSON.stringify({ summary, timestamp })); }
        else { timestamp = null; }
        refreshAiButton.disabled = false;
    }
    aiSummaryText.textContent = summary || 'No chronicle available for this adventurer.';
    if (timestamp) { aiTimestamp.textContent = `Chronicle generated: ${new Date(timestamp).toLocaleString()}`; }
    else { aiTimestamp.textContent = ''; }
}


// --- Initialization ---
// --- MODIFIED initializePage to pass full result to displayAiSummary ---
async function initializePage() {
    await loadHeaderFooter();

    // *** ASSIGN DOM ELEMENTS HERE ***
    loadingMessageEl = document.querySelector('#loading-message'); contentEl = document.querySelector('.player-detail-content'); errorEl = document.querySelector('#detail-error-message');
    nameTitleEl = document.querySelector('#character-name-title'); avatarContainerEl = document.querySelector('#player-avatar-container'); avatarImgEl = document.querySelector('#player-avatar');
    avatarLoadingEl = document.querySelector('#avatar-loading'); avatarUnavailableEl = document.querySelector('#avatar-unavailable'); levelEl = document.querySelector('#player-level');
    raceEl = document.querySelector('#player-race'); classEl = document.querySelector('#player-class'); genderEl = document.querySelector('#player-gender'); factionEl = document.querySelector('#player-faction');
    realmEl = document.querySelector('#player-realm'); regionEl = document.querySelector('#player-region'); titleEl = document.querySelector('#player-title'); guildEl = document.querySelector('#player-guild');
    ilvlSection = document.querySelector('#item-level-section'); ilvlEl = document.querySelector('#player-ilvl'); achievementsSection = document.querySelector('#achievements-section');
    achievementsEl = document.querySelector('#player-achievements'); mountsSection = document.querySelector('#mounts-section'); mountsEl = document.querySelector('#player-mounts');
    petsSection = document.querySelector('#pets-section'); petsEl = document.querySelector('#player-pets'); gameVersionEl = document.querySelector('#player-game-version');
    aiSummaryContainer = document.querySelector('#ai-summary-container'); aiSummaryText = document.querySelector('#ai-summary-text'); aiTimestamp = document.querySelector('#ai-timestamp'); refreshAiButton = document.querySelector('#refresh-ai-summary');

    if (!errorEl || !loadingMessageEl || !contentEl) { console.error("CRITICAL: Could not find essential layout elements. Aborting."); alert("A critical error occurred loading page components."); return; }
    if (!ilvlSection || !ilvlEl || !achievementsSection || !achievementsEl || !mountsSection || !mountsEl || !petsSection || !petsEl) { console.warn("One or more optional detail DOM elements were not found."); }

    const region = getParam('region'); const urlType = getParam('urlType'); const realmSlug = getParam('realmSlug'); const characterName = getParam('characterName');
    if (!region || !urlType || !realmSlug || !characterName) { showError('Error: Missing required player details in URL.'); return; }

    loadingMessageEl.style.display = 'block'; contentEl.style.display = 'none'; if (aiSummaryContainer) aiSummaryContainer.style.display = 'none'; hideError();

    let token;
    try { token = await getAccessToken(); if (!token) throw new Error('Could not authenticate with Blizzard API.'); }
    catch (authError) { showError(`Authentication Error: ${authError.message}`); return; }

    // --- Fetch and Render Player Data ---
    let playerDataResult; // Store the whole result temporarily
    try {
        playerDataResult = await fetchPlayerData(region, urlType, realmSlug, characterName, token); // Fetch ENHANCED data
        // Pass only the core display data to renderPlayerData
        renderPlayerData(playerDataResult, region, urlType, realmSlug, characterName);
        // Pass the full enhanced data to displayAiSummary
        await displayAiSummary(playerDataResult); // Uses enhanced data for prompt

        if (refreshAiButton) {
            refreshAiButton.addEventListener('click', () => {
                // Use the playerDataResult captured in the closure
                if (playerDataResult) { displayAiSummary(playerDataResult, true); }
                else { console.warn("Cannot refresh AI summary, player data is missing."); }
            });
        } else { console.warn("Refresh AI button not found."); }

    } catch (fetchError) {
        showError(`Error loading player data: ${fetchError.message}`);
        if (aiSummaryContainer) aiSummaryContainer.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', initializePage);