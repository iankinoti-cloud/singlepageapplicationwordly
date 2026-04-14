const API_BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const FAVORITES_KEY = "wordly-favorite-words";
const THEME_KEY = "wordly-theme";
const SEARCH_DEBOUNCE_MS = 350;

const searchForm = document.getElementById("searchForm");
const wordInput = document.getElementById("wordInput");
const statusText = document.getElementById("status");
const errorBox = document.getElementById("errorBox");
const resultCard = document.getElementById("resultCard");
const resultWord = document.getElementById("resultWord");
const resultMeta = document.getElementById("resultMeta");
const resultDefinition = document.getElementById("resultDefinition");
const resultExample = document.getElementById("resultExample");
const resultSynonyms = document.getElementById("resultSynonyms");
const resultSource = document.getElementById("resultSource");
const audioBtn = document.getElementById("audioBtn");
const audioPlayer = document.getElementById("audioPlayer");
const favoriteBtn = document.getElementById("favoriteBtn");
const favoritesList = document.getElementById("favoritesList");
const themeToggle = document.getElementById("themeToggle");

let favorites = loadFavorites();
let currentWord = "";
let currentAudioUrl = "";
let searchDebounceTimer = null;
let activeController = null;
let latestRequestToken = 0;
const dictionaryCache = new Map();

initializeApp();

function initializeApp() {
	applyStoredTheme();
	renderFavorites();

	searchForm.addEventListener("submit", onSearchSubmit);
	wordInput.addEventListener("input", onSearchInput);
	favoriteBtn.addEventListener("click", onToggleFavorite);
	favoritesList.addEventListener("click", onFavoriteListClick);
	themeToggle.addEventListener("click", onToggleTheme);
	audioBtn.addEventListener("click", onPlayAudio);
}

function onSearchInput() {
	const query = normalizeQuery(wordInput.value);
	clearTimeout(searchDebounceTimer);

	if (!query) {
		clearError();
		statusText.textContent = "Type a word to begin.";
		clearResult();
		return;
	}

	statusText.textContent = `Preparing search for "${query}"...`;
	searchDebounceTimer = setTimeout(() => {
		fetchAndRenderWord(query);
	}, SEARCH_DEBOUNCE_MS);
}

async function onSearchSubmit(event) {
	event.preventDefault();
	const query = normalizeQuery(wordInput.value);
	clearTimeout(searchDebounceTimer);

	if (!query) {
		showError("Please enter a word before searching.");
		return;
	}

	await fetchAndRenderWord(query);
}

async function fetchAndRenderWord(query) {
	const normalizedQuery = normalizeQuery(query);

	if (!normalizedQuery) {
		showError("Please enter a word before searching.");
		return;
	}

	clearError();
	statusText.textContent = `Searching for "${normalizedQuery}"...`;

	if (activeController) {
		activeController.abort();
	}

	if (dictionaryCache.has(normalizedQuery)) {
		const cachedEntry = dictionaryCache.get(normalizedQuery);
		currentWord = cachedEntry.word.toLowerCase();
		renderResult(cachedEntry);
		statusText.textContent = `Showing cached results for "${cachedEntry.word}".`;
		return;
	}

	const requestToken = ++latestRequestToken;
	activeController = new AbortController();

	try {
		const response = await fetch(`${API_BASE_URL}${encodeURIComponent(normalizedQuery)}`, {
			signal: activeController.signal,
			headers: {
				Accept: "application/json"
			}
		});

		if (!response.ok) {
			throw new Error("Word not found.");
		}

		const payload = await response.json();
		if (requestToken !== latestRequestToken) {
			return;
		}

		const entry = payload[0];

		if (!entry || !entry.meanings || entry.meanings.length === 0) {
			throw new Error("No definition data available for this word.");
		}

		dictionaryCache.set(normalizedQuery, entry);
		currentWord = entry.word.toLowerCase();
		renderResult(entry);
		statusText.textContent = `Showing results for "${entry.word}".`;
	} catch (error) {
		if (error.name === "AbortError") {
			return;
		}

		if (requestToken !== latestRequestToken) {
			return;
		}

		clearResult();
		showError(error.message || "Unable to fetch dictionary data. Please try again.");
		statusText.textContent = "Search failed. Please try a different word.";
	} finally {
		if (requestToken === latestRequestToken) {
			activeController = null;
		}
	}
}

function normalizeQuery(value) {
	return String(value || "").trim().toLowerCase();
}

function renderResult(entry) {
	const primaryMeaning = entry.meanings[0] || {};
	const firstDefinition = (primaryMeaning.definitions || [])[0] || {};
	const pronunciationData = findPronunciationData(entry);
	const pronunciation = pronunciationData.text || "N/A";
	const partOfSpeech = primaryMeaning.partOfSpeech || "Unknown";
	const synonyms = firstDefinition.synonyms || primaryMeaning.synonyms || [];
	const sourceUrl = (entry.sourceUrls || [])[0] || "N/A";

	resultWord.textContent = entry.word || "Unknown";

	resultMeta.innerHTML = "";
	appendChip(`Pronunciation: ${pronunciation}`);
	appendChip(`Part of Speech: ${partOfSpeech}`);

	resultDefinition.textContent = `Definition: ${firstDefinition.definition || "No definition provided."}`;
	resultExample.textContent = `Example: ${firstDefinition.example || "No example available."}`;
	resultSynonyms.textContent = `Synonyms: ${synonyms.length ? synonyms.slice(0, 8).join(", ") : "No synonyms listed."}`;
	renderSource(sourceUrl);

	currentAudioUrl = pronunciationData.audio || "";
	audioBtn.classList.toggle("hidden", !currentAudioUrl);
	audioBtn.disabled = !currentAudioUrl;
	audioBtn.textContent = "Play Pronunciation";
	audioPlayer.pause();
	audioPlayer.currentTime = 0;
	audioPlayer.src = currentAudioUrl;

	const isSaved = favorites.includes(currentWord);
	favoriteBtn.textContent = isSaved ? "Remove from Favorites" : "Save to Favorites";
	resultCard.classList.toggle("saved", isSaved);
	resultCard.classList.remove("hidden");
}

function findPronunciationData(entry) {
	const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
	const withAudio = phonetics.find((item) => item && typeof item.audio === "string" && item.audio.trim());
	const withText = phonetics.find((item) => item && typeof item.text === "string" && item.text.trim());

	return {
		text: entry.phonetic || withText?.text || "",
		audio: withAudio?.audio || ""
	};
}

function renderSource(sourceUrl) {
	resultSource.innerHTML = "";

	const label = document.createElement("span");
	label.textContent = "Source: ";
	resultSource.appendChild(label);

	if (sourceUrl === "N/A") {
		const fallback = document.createElement("span");
		fallback.textContent = "N/A";
		resultSource.appendChild(fallback);
		return;
	}

	const link = document.createElement("a");
	link.href = sourceUrl;
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.textContent = sourceUrl;
	resultSource.appendChild(link);
}

function appendChip(label) {
	const chip = document.createElement("span");
	chip.className = "chip";
	chip.textContent = label;
	resultMeta.appendChild(chip);
}

function clearResult() {
	currentWord = "";
	currentAudioUrl = "";
	audioPlayer.pause();
	audioPlayer.currentTime = 0;
	audioPlayer.src = "";
	audioBtn.classList.add("hidden");
	audioBtn.disabled = true;
	audioBtn.textContent = "Play Pronunciation";
	resultCard.classList.add("hidden");
	resultCard.classList.remove("saved");
}

function onPlayAudio() {
	if (!currentAudioUrl) {
		showError("No pronunciation audio is available for this word.");
		return;
	}

	clearError();
	audioBtn.textContent = "Playing...";

	audioPlayer
		.play()
		.catch(() => {
			showError("Unable to play pronunciation audio on this device/browser.");
		})
		.finally(() => {
			audioBtn.textContent = "Play Pronunciation";
		});
}

function showError(message) {
	errorBox.textContent = message;
	errorBox.classList.remove("hidden");
}

function clearError() {
	errorBox.textContent = "";
	errorBox.classList.add("hidden");
}

function onToggleFavorite() {
	if (!currentWord) {
		return;
	}

	const isSaved = favorites.includes(currentWord);

	if (isSaved) {
		favorites = favorites.filter((word) => word !== currentWord);
	} else {
		favorites.push(currentWord);
		favorites.sort();
	}

	persistFavorites();
	renderFavorites();

	favoriteBtn.textContent = isSaved ? "Save to Favorites" : "Remove from Favorites";
	resultCard.classList.toggle("saved", !isSaved);
}

function onFavoriteListClick(event) {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const selectedWord = target.dataset.word;
	if (!selectedWord) {
		return;
	}

	wordInput.value = selectedWord;
	fetchAndRenderWord(selectedWord);
}

function renderFavorites() {
	favoritesList.innerHTML = "";

	if (!favorites.length) {
		const placeholder = document.createElement("li");
		placeholder.textContent = "No favorites yet";
		placeholder.className = "favorites-empty";
		favoritesList.appendChild(placeholder);
		return;
	}

	favorites.forEach((word) => {
		const item = document.createElement("li");
		item.textContent = word;
		item.dataset.word = word;
		favoritesList.appendChild(item);
	});
}

function loadFavorites() {
	try {
		const raw = localStorage.getItem(FAVORITES_KEY);
		const parsed = raw ? JSON.parse(raw) : [];

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter((word) => typeof word === "string");
	} catch {
		return [];
	}
}

function persistFavorites() {
	localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function onToggleTheme() {
	const isNight = document.body.classList.toggle("theme-night");

	localStorage.setItem(THEME_KEY, isNight ? "night" : "day");
	themeToggle.textContent = isNight ? "Switch to Day Theme" : "Switch Theme";
}

function applyStoredTheme() {
	const theme = localStorage.getItem(THEME_KEY);
	if (theme === "night") {
		document.body.classList.add("theme-night");
		themeToggle.textContent = "Switch to Day Theme";
	}
}
