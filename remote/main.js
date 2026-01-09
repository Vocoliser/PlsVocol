(() => {
	"use strict";

	const CONFIG = {
		maxDisplayedDonations: 20,
		maxDisplayedReach: 20,
		feedExpiryMs: 5 * 60 * 1000,
		autoJoinEnabled: false,
		autoJoinMinRobux: 1000,
		autoJoinGameFilters: ["Main"],
		autoJoinSkipFull: false,
		autoJoinMuted: false,
	};

	const GameName = {
		"8737602449": "Main",
		"8943844393": "Voice Chat",
		"8943846005": "Legacy Map",
		"15611066348": "Deluxe Voice Chat",
		"18852429314": "17+"
	};

	let isConnected = false;
	let reachEntries = [];
	let foundEntries = [];
	let mergedDonations = [];
	let lastAutoJoinEntry = null;
	let notificationAudio = null;
	let clientCount = 0;
	let userData = null;

	const DISCORD_CLIENT_ID = "1096363011524018256";
	const DISCORD_REDIRECT_URI = "https://fern.wtf/api/auth";
	const DISCORD_SCOPES = "identify guilds guilds.join";

	function isLoggedIn() {
		const token = localStorage.getItem("Cotton_auth_token");
		return !!token;
	}

	function getAuthToken() {
		return localStorage.getItem("Cotton_auth_token");
	}

	function saveLogin(token) {
		localStorage.setItem("Cotton_auth_token", token);
	}

	function logout() {
		localStorage.removeItem("Cotton_auth_token");
		showLoginPopup();
	}

	function showAuthError(message) {
		const loginBody = document.querySelector(".pls-login-body");
		if (!loginBody) return;

		const existing = document.getElementById("pls-auth-error");
		if (existing) existing.remove();

		const errorDiv = document.createElement("div");
		errorDiv.id = "pls-auth-error";
		errorDiv.className = "pls-auth-error";
		errorDiv.innerHTML = `
			<span class="pls-auth-error-icon">⚠️</span>
			<span class="pls-auth-error-text">${escapeHtml(message)}</span>
		`;
		
		loginBody.insertBefore(errorDiv, loginBody.firstChild);
	}

	function getDiscordAuthUrl() {
		const params = new URLSearchParams({
			client_id: DISCORD_CLIENT_ID,
			redirect_uri: DISCORD_REDIRECT_URI,
			response_type: "code",
			scope: DISCORD_SCOPES,
			state: btoa(JSON.stringify({ cotton: true }))
		});
		return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
	}

	function showLoginPopup() {
		const existing = document.getElementById("pls-login-overlay");
		if (existing) existing.remove();

		const overlay = document.createElement("div");
		overlay.id = "pls-login-overlay";
		overlay.innerHTML = `
			<div class="rbx-panel rbx-panel-default pls-login-modal">
				<div class="rbx-panel-body pls-login-body">
					<p class="text-lead pls-login-title">Sign in to Pls Cotton</p>
					<p class="text-description pls-login-desc">:p</p>
					<button id="pls-discord-login-btn" class="pls-discord-btn">
						<svg class="pls-discord-icon" viewBox="0 0 24 24" fill="currentColor">
							<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
						</svg>
						Login with Discord
					</button>
				</div>
			</div>
		`;

		document.body.appendChild(overlay);

		document.getElementById("pls-discord-login-btn").addEventListener("click", () => {
			window.open(getDiscordAuthUrl(), "_blank", "width=500,height=700");
		});
	}

	function hideLoginPopup() {
		const overlay = document.getElementById("pls-login-overlay");
		if (overlay) overlay.remove();
	}

	function connectSocket() {
		const authToken = getAuthToken();
		window.dispatchEvent(new CustomEvent("cotton_connect_socket", { 
			detail: { authToken } 
		}));
	}

	window.addEventListener("message", (event) => {
		if (event.data && event.data.type === "COTTON_AUTH_SUCCESS") {
			const { token } = event.data;
			saveLogin(token);
			connectSocket();
		}
	});

	function loadSettings() {
		try {
			const saved = localStorage.getItem("Cotton_settings");
			if (saved) {
				const parsed = JSON.parse(saved);
				if (parsed.feedExpiryMs) CONFIG.feedExpiryMs = parsed.feedExpiryMs;
				if (parsed.maxDisplayedDonations) CONFIG.maxDisplayedDonations = parsed.maxDisplayedDonations;
				if (parsed.maxDisplayedReach) CONFIG.maxDisplayedReach = parsed.maxDisplayedReach;
				if (typeof parsed.autoJoinEnabled === 'boolean') CONFIG.autoJoinEnabled = parsed.autoJoinEnabled;
				if (typeof parsed.autoJoinMinRobux === 'number') CONFIG.autoJoinMinRobux = parsed.autoJoinMinRobux;
				if (Array.isArray(parsed.autoJoinGameFilters)) CONFIG.autoJoinGameFilters = parsed.autoJoinGameFilters;
				if (typeof parsed.autoJoinSkipFull === 'boolean') CONFIG.autoJoinSkipFull = parsed.autoJoinSkipFull;
				if (typeof parsed.autoJoinMuted === 'boolean') CONFIG.autoJoinMuted = parsed.autoJoinMuted;
			}
		} catch (e) {
			console.error("[Cotton] Failed to load settings:", e);
		}
	}

	function saveSettings() {
		try {
			localStorage.setItem("Cotton_settings", JSON.stringify({
				feedExpiryMs: CONFIG.feedExpiryMs,
				maxDisplayedDonations: CONFIG.maxDisplayedDonations,
				maxDisplayedReach: CONFIG.maxDisplayedReach,
				autoJoinEnabled: CONFIG.autoJoinEnabled,
				autoJoinMinRobux: CONFIG.autoJoinMinRobux,
				autoJoinGameFilters: CONFIG.autoJoinGameFilters,
				autoJoinSkipFull: CONFIG.autoJoinSkipFull,
				autoJoinMuted: CONFIG.autoJoinMuted
			}));
		} catch (e) {
			console.error("[Cotton] Failed to save settings:", e);
		}
	}

	function waitForElement(selector, timeoutMs = 15000) {
		return new Promise((resolve, reject) => {
			const start = Date.now();
			const observer = new MutationObserver(() => {
				const el = document.querySelector(selector);
				if (el) {
					observer.disconnect();
					resolve(el);
				}
				if (Date.now() - start > timeoutMs) {
					observer.disconnect();
					reject(new Error("Timeout waiting for element: " + selector));
				}
			});
			observer.observe(document.documentElement, { childList: true, subtree: true });
			const immediate = document.querySelector(selector);
			if (immediate) {
				observer.disconnect();
				resolve(immediate);
			}
		});
	}

	function formatTimeAgo(timestamp) {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function formatRobux(amount) {
		return Number(amount).toLocaleString();
	}

	function getGameBadge(placeId) {
		if (!placeId) return "";
		const pid = String(placeId);
		const gameName = GameName[pid] || null;
		if (!gameName) return "";
		
		const badgeClass = {
			"Main": "pls-badge-main",
			"Voice Chat": "pls-badge-vc",
			"Legacy Map": "pls-badge-legacy",
			"Deluxe Voice Chat": "pls-badge-deluxe",
			"17+": "pls-badge-17plus"
		}[gameName] || "pls-badge-default";
		
		return `<span class="pls-game-badge ${badgeClass}">${gameName}</span>`;
	}

	function cleanExpiredEntries() {
		const now = Date.now();
		const expiryTime = CONFIG.feedExpiryMs;

		reachEntries = reachEntries.filter(entry => (now - entry.timestamp) < expiryTime);
		foundEntries = foundEntries.filter(entry => (now - entry.timestamp) < expiryTime);
		rebuildMergedDonations();
	}

	function findReceiverFromReach(donatorUsername) {
		const normalizedDonator = (donatorUsername || '').replace(/^@+/, '').toLowerCase();
		
		for (const reach of reachEntries) {
			const reachDonator = (reach.donator || '').replace(/^@+/, '').toLowerCase();
			const reachReceiver = (reach.gotrobux || '').replace(/^@+/, '');
			
			if (reachDonator === normalizedDonator && reachReceiver) {
				return reachReceiver;
			}
		}
		return null;
	}

	function getCorrectedReceiver(entry) {
		const donatorNorm = (entry.donator.username || '').replace(/^@+/, '').toLowerCase();
		const receiverNorm = (entry.receiver.username || '').replace(/^@+/, '').toLowerCase();
		
		if (donatorNorm === receiverNorm) {
			const actualReceiver = findReceiverFromReach(entry.donator.username);
			if (actualReceiver) {
				return {
					username: actualReceiver,
					displayName: actualReceiver
				};
			}
		}
		
		return entry.receiver;
	}

	function rebuildMergedDonations() {
		const donatorMap = new Map();

		for (const entry of foundEntries) {
			const receiver = getCorrectedReceiver(entry);
			
			const key = `${entry.donator.username}:${entry.serverId}`;
			
			if (donatorMap.has(key)) {
				const existing = donatorMap.get(key);
				const receiverKey = receiver.username;
				if (!existing.receivers.has(receiverKey)) {
					existing.receivers.set(receiverKey, {
						username: receiver.username,
						displayName: receiver.displayName,
						totalAmount: 0
					});
				}
				existing.receivers.get(receiverKey).totalAmount += entry.donatedAmount;
				existing.totalAmount += entry.donatedAmount;
				if (entry.timestamp > existing.timestamp) {
					existing.timestamp = entry.timestamp;
					existing.id = entry.id;
				}
				if (entry.placeId && !existing.placeId) {
					existing.placeId = entry.placeId;
				}
				if (entry.playerAmount) {
					existing.playerAmount = entry.playerAmount;
				}
			} else {
				const receivers = new Map();
				receivers.set(receiver.username, {
					username: receiver.username,
					displayName: receiver.displayName,
					totalAmount: entry.donatedAmount
				});
				
				donatorMap.set(key, {
					id: entry.id,
					serverId: entry.serverId,
					placeId: entry.placeId,
					playerAmount: entry.playerAmount,
					donator: entry.donator,
					receivers: receivers,
					totalAmount: entry.donatedAmount,
					timestamp: entry.timestamp
				});
			}
		}

		mergedDonations = Array.from(donatorMap.values())
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, CONFIG.maxDisplayedDonations);
	}

	function addFoundEntry(entry) {
		checkAutoJoin(entry);
		
		foundEntries.unshift(entry);
		
		if (foundEntries.length > 500) {
			foundEntries = foundEntries.slice(0, 500);
		}
		
		rebuildMergedDonations();
	}

	function checkIfServerFull(playerAmount) {
		if (!playerAmount || playerAmount === "undefined/undefined") {
			return false;
		}
		
		const parts = playerAmount.split('/');
		if (parts.length !== 2) return false;
		
		const current = parseInt(parts[0], 10);
		const max = parseInt(parts[1], 10);
		
		if (isNaN(current) || isNaN(max)) return false;
		
		return current >= max;
	}

	function checkAutoJoin(entry) {
		if (!CONFIG.autoJoinEnabled) return;
		
		if (entry.donatedAmount < CONFIG.autoJoinMinRobux) {
			return;
		}
		
		if (CONFIG.autoJoinSkipFull && entry.playerAmount) {
			const isFullServer = checkIfServerFull(entry.playerAmount);
			if (isFullServer) {
				return;
			}
		}
		
		if (CONFIG.autoJoinGameFilters.length > 0) {
			const gameName = entry.placeId ? GameName[String(entry.placeId)] : null;
			if (!gameName || !CONFIG.autoJoinGameFilters.includes(gameName)) {
				return;
			}
		}
		
		CONFIG.autoJoinEnabled = false;
		saveSettings();
		updateAutoJoinButton();
		
		lastAutoJoinEntry = entry;
		renderLastJoinPanel();
		
		playAutoJoinSound();
		
		joinServer(entry.placeId, entry.serverId);
	}

	function unlockAudio() {
		if (!window.__COTTON_SOUND_URL__) return;
		if (notificationAudio) return;
		
		try {
			notificationAudio = new Audio(window.__COTTON_SOUND_URL__);
			notificationAudio.volume = 1;
			notificationAudio.play().then(() => {
				notificationAudio.pause();
				notificationAudio.currentTime = 0;
			}).catch(() => {});
		} catch (e) {}
	}

	function playAutoJoinSound() {
		if (CONFIG.autoJoinMuted) return;
		
		try {
			if (notificationAudio) {
				notificationAudio.currentTime = 0;
				notificationAudio.volume = 1;
				notificationAudio.play().catch(() => {});
			} else if (window.__COTTON_SOUND_URL__) {
				const audio = new Audio(window.__COTTON_SOUND_URL__);
				audio.volume = 1;
				audio.play().catch(() => {});
			}
		} catch (e) {}
	}

	function joinServer(placeId, serverId) {
		if (!placeId || !serverId) {
			console.error("[Cotton] Cannot join: missing placeId or serverId");
			return;
		}
		
		const joinUrl = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
		
		window.location.replace(joinUrl);
	}

	function initSocket() {
		window.addEventListener("cotton_socket", (e) => {
			const message = e.detail;
			
			switch (message.type) {
				case "socket_connect":
					isConnected = true;
					updateConnectionStatus(true);
					hideLoginPopup();
					if (!document.getElementById("pls-donate-helper-panel")) {
						initAfterLogin();
					}
					break;
					
				case "socket_disconnect":
					isConnected = false;
					updateConnectionStatus(false);
					break;
					
				case "socket_error":
					console.error("[Cotton] Connection error:", message.message);
					if (message.message && message.message.includes("Not authenticated")) {
						logout();
						showAuthError(message.message);
					}
					break;
					
				case "socket_init":
					if (message.data.reach) {
						reachEntries = message.data.reach.slice().reverse().slice(0, CONFIG.maxDisplayedReach);
					}
					if (message.data.found) {
						foundEntries = message.data.found.slice().reverse();
						rebuildMergedDonations();
					}
					if (typeof message.data.clientCount === "number") {
						clientCount = message.data.clientCount;
						updateConnectionStatus(true);
					}
					if (message.data.userData) {
						userData = message.data.userData;
						renderUserInfoPanel();
					}
					renderDonationsPanel();
					renderReachPanel();
					setTimeout(() => {
						lockPanelWidths();
					}, 300);
					break;
				
				case "socket_clientCount":
					clientCount = message.count;
					updateConnectionStatus(isConnected);
					break;
					
				case "socket_reach":
					reachEntries.unshift(message.entry);
					if (reachEntries.length > CONFIG.maxDisplayedReach) reachEntries.pop();
					renderReachPanel();
					highlightNewEntry("reach-" + message.entry.id);
					break;
					
				case "socket_found":
					addFoundEntry(message.entry);
					renderDonationsPanel();
					highlightNewEntry("found-" + message.entry.id);
					break;
			}
		});
		
		window.addEventListener("cotton_version_result", (e) => {
			const latestSha = e.detail.sha;
			if (latestSha && currentVersionSha && latestSha !== currentVersionSha && latestSha !== "LOCAL") {
				showUpdateAvailable();
			}
		});
	}

	function lockPanelWidths() {
	}

	function highlightNewEntry(entryId) {
		setTimeout(() => {
			const el = document.querySelector(`[data-entry-id="${entryId}"]`);
			if (el) {
				el.classList.add("pls-new-entry");
				setTimeout(() => el.classList.remove("pls-new-entry"), 2000);
			}
		}, 50);
	}

	function updateConnectionStatus(connected) {
		const statusEl = document.getElementById("pls-connection-status");
		if (statusEl) {
			statusEl.className = connected ? "pls-status-connected" : "pls-status-disconnected";
			if (connected) {
				const countText = clientCount > 0 ? ` (${clientCount})` : "";
				statusEl.innerHTML = `<span class="pls-status-dot pls-dot-green"></span> Live${countText}`;
			} else {
				statusEl.innerHTML = '<span class="pls-status-dot pls-dot-red"></span> Disconnected';
			}
		}
	}

	function showConnectionError(message) {
		const panel = document.getElementById("pls-donate-helper-panel");
		if (panel) {
			const errorDiv = panel.querySelector(".pls-connection-error") || document.createElement("div");
			errorDiv.className = "pls-connection-error";
			errorDiv.textContent = message;
			if (!errorDiv.parentNode) {
				panel.insertBefore(errorDiv, panel.firstChild);
			}
		}
	}

	function createSettingsPanel() {
		if (document.getElementById("pls-settings-panel")) return;

		const panel = document.createElement("aside");
		panel.id = "pls-settings-panel";
		panel.setAttribute("role", "complementary");

		const gameOptions = ["Main", "Voice Chat", "Legacy Map", "Deluxe Voice Chat", "17+"];
		const gameCheckboxes = gameOptions.map(game => {
			const checked = CONFIG.autoJoinGameFilters.includes(game) ? 'checked' : '';
			const safeId = game.replace(/[^a-zA-Z0-9]/g, '-');
			return `
				<label class="pls-game-checkbox">
					<input type="checkbox" name="pls-game-filter" value="${game}" ${checked}>
					<span>${game}</span>
				</label>
			`;
		}).join('');

		panel.innerHTML = `
			<div class="pls-panel-header">
				<div class="pls-panel-title">
					<span class="pls-settings-icon">🎮</span>
					Auto Joiner
				</div>
			</div>
			<div class="pls-panel-content pls-settings-content">
				<button id="pls-autojoin-btn" class="pls-autojoin-btn ${CONFIG.autoJoinEnabled ? 'pls-autojoin-active' : ''}">
					${CONFIG.autoJoinEnabled ? 'AUTO JOIN ON' : 'AUTO JOIN OFF'}
				</button>
				<div class="pls-setting-row">
					<label for="pls-autojoin-min-robux">Min Robux</label>
					<input type="number" id="pls-autojoin-min-robux" class="pls-setting-input" value="${CONFIG.autoJoinMinRobux}" min="0" step="100">
				</div>
				<div class="pls-setting-row">
					<label for="pls-skip-full">Skip full servers</label>
					<label class="pls-toggle">
						<input type="checkbox" id="pls-skip-full" ${CONFIG.autoJoinSkipFull ? 'checked' : ''}>
						<span class="pls-toggle-slider"></span>
					</label>
				</div>
				<div class="pls-setting-row">
					<label for="pls-mute-sound">Mute sound</label>
					<label class="pls-toggle">
						<input type="checkbox" id="pls-mute-sound" ${CONFIG.autoJoinMuted ? 'checked' : ''}>
						<span class="pls-toggle-slider"></span>
					</label>
				</div>
				<div class="pls-setting-section-title">Game Filters (empty = all)</div>
				<div class="pls-game-filters">
					${gameCheckboxes}
				</div>
				<div id="pls-version-info" class="pls-version-info">Loading version...</div>
			</div>
		`;

		document.body.appendChild(panel);
		initSettingsListeners();
		fetchGitHubVersion();
	}

	function createLastJoinPanel() {
		if (document.getElementById("pls-last-join-panel")) return;

		const panel = document.createElement("aside");
		panel.id = "pls-last-join-panel";
		panel.setAttribute("role", "complementary");

		panel.innerHTML = `
			<div class="pls-panel-header">
				<div class="pls-panel-title">
					<span class="pls-last-join-icon">🎯</span>
					Last Auto Join
				</div>
			</div>
			<div id="pls-last-join-content" class="pls-panel-content">
				<div class="pls-empty">No auto joins yet</div>
			</div>
		`;

		document.body.appendChild(panel);
	}

	function renderLastJoinPanel() {
		const container = document.getElementById("pls-last-join-content");
		if (!container) return;

		if (!lastAutoJoinEntry) {
			container.innerHTML = '<div class="pls-empty">No auto joins yet</div>';
			return;
		}

		const entry = lastAutoJoinEntry;
		const timeAgo = formatTimeAgo(entry.timestamp);
		const gameBadge = getGameBadge(entry.placeId);
		const donatorUsername = entry.donator.username.replace(/^@+/, '');
		const donatorDisplay = entry.donator.displayName;
		const receiverUsername = entry.receiver.username.replace(/^@+/, '');

		container.innerHTML = `
			<div class="pls-last-join-card">
				<div class="pls-last-join-info">
					<div class="pls-last-join-donator">
						<img src="${escapeHtml(entry.donator.pfp)}" alt="Avatar" class="pls-last-join-avatar" onerror="this.src='https://tr.rbxcdn.com/30DAY-AvatarHeadshot-D6AA08590AF634B30030087F39AF1479-Png/150/150/AvatarHeadshot/Png/noFilter'" />
						<div>
							<div class="pls-last-join-name">@${escapeHtml(donatorUsername)}</div>
							<div class="pls-last-join-display">${escapeHtml(donatorDisplay)}</div>
						</div>
					</div>
					<div class="pls-last-join-amount">
						<span class="icon-robux-16x16"></span>
						<span class="text-robux">${formatRobux(entry.donatedAmount)}</span>
					</div>
				</div>
				<div class="pls-last-join-footer">
					<span>${timeAgo}</span>
					${gameBadge}
					<span class="pls-server-id">${entry.serverId.substring(0, 8)}</span>
					<button class="pls-join-btn" data-place-id="${entry.placeId}" data-server-id="${escapeHtml(entry.serverId)}" title="Rejoin this server">Rejoin</button>
				</div>
			</div>
		`;
	}

	function createUserInfoPanel() {
		if (document.getElementById("pls-user-info-panel")) return;

		const panel = document.createElement("aside");
		panel.id = "pls-user-info-panel";
		panel.setAttribute("role", "complementary");

		panel.innerHTML = `
			<div class="pls-panel-header">
				<div class="pls-panel-title">
					<span class="pls-user-icon">👤</span>
					Account
				</div>
			</div>
			<div id="pls-user-info-content" class="pls-panel-content">
				<div class="pls-empty">Loading...</div>
			</div>
		`;

		document.body.appendChild(panel);
	}

	function renderUserInfoPanel() {
		const container = document.getElementById("pls-user-info-content");
		if (!container) return;

		if (!userData) {
			container.innerHTML = '<div class="pls-empty">Not loaded</div>';
			return;
		}

		const expireTimestamp = userData.expireDate ? parseInt(userData.expireDate, 10) : null;
		const expireDate = expireTimestamp ? new Date(expireTimestamp) : null;
		const isExpired = expireDate && expireDate < new Date();
		const daysLeft = expireDate ? Math.ceil((expireDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
		
		let statusText = "";
		let statusClass = "";
		if (!expireDate) {
			statusText = "No subscription";
			statusClass = "pls-status-none";
		} else if (isExpired) {
			statusText = "Expired";
			statusClass = "pls-status-expired";
		} else if (daysLeft <= 3) {
			statusText = `${daysLeft}d left`;
			statusClass = "pls-status-warning";
		} else {
			statusText = `${daysLeft}d left`;
			statusClass = "pls-status-active";
		}

		container.innerHTML = `
			<div class="pls-user-info-card">
				<div class="pls-user-info-row">
					<span class="pls-user-label">User</span>
					<span class="pls-user-value">@${escapeHtml(userData.username || 'Unknown')}</span>
				</div>
				<div class="pls-user-info-row">
					<span class="pls-user-label">Status</span>
					<span class="pls-user-status ${statusClass}">${statusText}</span>
				</div>
			</div>
		`;
	}

	let currentVersionSha = null;
	
	function fetchGitHubVersion() {
		const versionEl = document.getElementById("pls-version-info");
		if (!versionEl) return;
		
		const version = window.__COTTON_VERSION__;
		if (version && version.sha) {
			currentVersionSha = version.sha;
			if (version.sha === "LOCAL") {
				versionEl.textContent = "LOCAL";
			} else {
				const shortSha = version.sha.substring(0, 7);
				const date = new Date(version.date).toLocaleDateString();
				versionEl.innerHTML = `<a href="https://github.com/Vocoliser/PlsVocol/commit/${version.sha}" target="_blank" style="color: inherit; text-decoration: none;">v${shortSha}</a> • ${date}`;
			}
			startVersionChecker();
		} else {
			versionEl.textContent = "Version unavailable";
		}
	}
	
	function startVersionChecker() {
		if (currentVersionSha === "LOCAL") return;
		
		setInterval(() => {
			checkForUpdate();
		}, 60 * 1000);
	}
	
	function checkForUpdate() {
		if (!currentVersionSha || currentVersionSha === "LOCAL") return;
		
		window.dispatchEvent(new CustomEvent("cotton_check_version"));
	}
	
	function showUpdateAvailable() {
		const versionEl = document.getElementById("pls-version-info");
		if (!versionEl) return;
		
		if (versionEl.querySelector(".pls-update-notice")) return;
		
		const updateNotice = document.createElement("span");
		updateNotice.className = "pls-update-notice";
		updateNotice.textContent = " • Refresh to update";
		updateNotice.style.cssText = "color: #f59e0b; cursor: pointer; font-weight: 600;";
		updateNotice.addEventListener("click", () => {
			window.location.reload();
		});
		versionEl.appendChild(updateNotice);
	}

	function initSettingsListeners() {
		const autoJoinBtn = document.getElementById("pls-autojoin-btn");
		if (autoJoinBtn) {
			autoJoinBtn.addEventListener("click", () => {
				CONFIG.autoJoinEnabled = !CONFIG.autoJoinEnabled;
				saveSettings();
				updateAutoJoinButton();
				
				if (CONFIG.autoJoinEnabled) {
					unlockAudio();
				}
			});
		}

		const minRobuxInput = document.getElementById("pls-autojoin-min-robux");
		if (minRobuxInput) {
			minRobuxInput.addEventListener("change", (e) => {
				CONFIG.autoJoinMinRobux = parseInt(e.target.value, 10) || 0;
				saveSettings();
			});
		}

		const skipFullToggle = document.getElementById("pls-skip-full");
		if (skipFullToggle) {
			skipFullToggle.addEventListener("change", (e) => {
				CONFIG.autoJoinSkipFull = e.target.checked;
				saveSettings();
			});
		}

		const gameCheckboxes = document.querySelectorAll('input[name="pls-game-filter"]');
		gameCheckboxes.forEach(checkbox => {
			checkbox.addEventListener("change", () => {
				CONFIG.autoJoinGameFilters = Array.from(
					document.querySelectorAll('input[name="pls-game-filter"]:checked')
				).map(cb => cb.value);
				saveSettings();
			});
		});

		const muteSoundToggle = document.getElementById("pls-mute-sound");
		if (muteSoundToggle) {
			muteSoundToggle.addEventListener("change", (e) => {
				CONFIG.autoJoinMuted = e.target.checked;
				saveSettings();
			});
		}
	}

	function initJoinButtons() {
		document.body.addEventListener("click", (e) => {
			const joinBtn = e.target.closest(".pls-join-btn");
			if (!joinBtn) return;
			
			const placeId = joinBtn.dataset.placeId;
			const serverId = joinBtn.dataset.serverId;
			
			if (placeId && serverId) {
				joinServer(placeId, serverId);
			}
		});
	}

	function updateAutoJoinButton() {
		const btn = document.getElementById("pls-autojoin-btn");
		if (btn) {
			if (CONFIG.autoJoinEnabled) {
				btn.classList.add("pls-autojoin-active");
				btn.textContent = "AUTO JOIN ON";
			} else {
				btn.classList.remove("pls-autojoin-active");
				btn.textContent = "AUTO JOIN OFF";
			}
		}
	}

	function createDonationsPanel() {
		if (document.getElementById("pls-donate-helper-panel")) return;

		const panel = document.createElement("aside");
		panel.id = "pls-donate-helper-panel";
		panel.setAttribute("role", "complementary");

		panel.innerHTML = `
			<div class="pls-panel-header">
				<div class="pls-panel-title">
					<span class="icon-robux-16x16"></span>
					Recent Donations
				</div>
				<div id="pls-connection-status" class="pls-status-disconnected">
					<span class="pls-status-dot pls-dot-red"></span> Connecting...
				</div>
			</div>
			<div id="pls-donations-list" class="pls-panel-content">
				<div class="pls-loading">Loading donations...</div>
			</div>
		`;

		document.body.appendChild(panel);
	}

	function renderDonationsPanel() {
		const container = document.getElementById("pls-donations-list");
		if (!container) return;

		if (mergedDonations.length === 0) {
			container.innerHTML = '<div class="pls-empty">No donations found yet</div>';
			return;
		}

		container.innerHTML = mergedDonations.map((entry, index) => renderDonationCard(entry, index)).join("");
	}

	function renderDonationCard(entry, index) {
		const timeAgo = formatTimeAgo(entry.timestamp);
		const gameBadge = getGameBadge(entry.placeId);
		
		const donatorUsername = entry.donator.username.replace(/^@+/, '');
		const donatorDisplay = entry.donator.displayName;
		
		const receiversArray = Array.from(entry.receivers.values());
		const hasMultipleReceivers = receiversArray.length > 1;
		
		const totalLine = hasMultipleReceivers ? `
			<div class="rbx-receiver pls-total-line">
				<div class="rbx-receiver-line">
					<strong>Total</strong>
					<span class="icon-robux-16x16"></span>
					<span class="text-robux">${formatRobux(entry.totalAmount)}</span>
				</div>
			</div>
		` : "";
		
		const receiversHtml = receiversArray.map(r => {
			const recUsername = r.username.replace(/^@+/, '');
			return `
				<div class="rbx-receiver">
					<div class="rbx-receiver-line">
						@${escapeHtml(recUsername)}
						<span class="icon-robux-16x16"></span>
						<span class="text-robux">${formatRobux(r.totalAmount)}</span>
					</div>
					<div class="text-secondary">${escapeHtml(r.displayName)}</div>
				</div>
			`;
		}).join("");

		const playerAmountHtml = entry.playerAmount ? `<span class="pls-player-count">${escapeHtml(entry.playerAmount)}</span>` : '';

		return `
			<div class="rbx-panel rbx-panel-default rbx-panel-theme ${index > 0 ? 'pls-gap' : ''}" data-entry-id="found-${entry.id}" data-server-id="${escapeHtml(entry.serverId)}" data-place-id="${entry.placeId || ''}">
				<div class="rbx-panel-body">
					<div class="age-rating-details section-content" style="margin-bottom: 0 !important;">
						<div class="row">
							<div class="col-xs-4">
								<div class="text-label">Donator</div>
								<div class="rbx-text-line">@${escapeHtml(donatorUsername)}</div>
								<div class="text-secondary">${escapeHtml(donatorDisplay)}</div>
							</div>
							<div class="col-xs-6 receiver-col">
								<div class="text-label">Receiver${hasMultipleReceivers ? 's' : ''}</div>
								<div class="rbx-receivers">
									${totalLine}
									${receiversHtml}
								</div>
							</div>
							<div class="col-xs-2" style="padding-left: 5px;">
								<div class="avatar avatar-headshot avatar-headshot-sm">
									<span class="thumbnail-2d-container avatar-card-image">
										<img src="${escapeHtml(entry.donator.pfp)}" alt="Player Avatar" title="${escapeHtml(donatorDisplay)}" onerror="this.src='https://tr.rbxcdn.com/30DAY-AvatarHeadshot-D6AA08590AF634B30030087F39AF1479-Png/150/150/AvatarHeadshot/Png/noFilter'" />
									</span>
								</div>
							</div>
						</div>
						<div class="m-top-1 pls-card-footer">
							<span class="pls-ago block text-caption-medium content-muted">${timeAgo}</span>
							${gameBadge}
							<span class="pls-server-id">${entry.serverId.substring(0, 8)}</span>
							${playerAmountHtml}
							<button class="pls-join-btn" data-place-id="${entry.placeId}" data-server-id="${escapeHtml(entry.serverId)}" title="Join this server">Join</button>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	function createReachPanel() {
		if (document.getElementById("pls-recent-donations")) return;

		const panel = document.createElement("aside");
		panel.id = "pls-recent-donations";
		panel.setAttribute("role", "complementary");

		panel.innerHTML = `
			<div class="pls-panel-header">
				<div class="pls-panel-title">
					<span class="pls-reach-icon">📡</span>
					Reach Activity
				</div>
			</div>
			<div id="pls-reach-list" class="rbx-panel-body">
				<div class="age-rating-details col-xs-12 section-content">
					<div class="pls-loading">Loading reach data...</div>
				</div>
			</div>
		`;

		document.body.appendChild(panel);
	}

	function renderReachPanel() {
		const container = document.getElementById("pls-reach-list");
		if (!container) return;

		if (reachEntries.length === 0) {
			container.innerHTML = `
				<div class="age-rating-details col-xs-12 section-content">
					<div class="pls-empty">No reach activity yet</div>
				</div>
			`;
			return;
		}

		const reaches = reachEntries.slice(0, CONFIG.maxDisplayedReach);
		container.innerHTML = `
			<div class="age-rating-details col-xs-12 section-content">
				${reaches.map(entry => renderReachItem(entry)).join("")}
			</div>
		`;
	}

	function renderReachItem(entry) {
		const timeAgo = formatTimeAgo(entry.timestamp);
		const gameBadge = getGameBadge(entry.placeId);

		const donatorName = entry.donator ? entry.donator.replace(/^@+/, '') : null;
		const receiverName = entry.gotrobux ? entry.gotrobux.replace(/^@+/, '') : null;
		
		const donatorText = donatorName ? `@${escapeHtml(donatorName)}` : "Unknown";
		const receiverText = receiverName ? ` → @${escapeHtml(receiverName)}` : "";
		const robuxText = entry.robux ? `<span class="icon-robux-16x16"></span> ${formatRobux(entry.robux)}` : "";

		return `
			<div class="comment list-item" data-entry-id="reach-${entry.id}">
				<div class="list-body text-right">
					<p class="list-content text-body-medium content-default pls-reach-line">
						<strong>${donatorText}</strong>${receiverText} ${robuxText} ${gameBadge}
					</p>
					<span class="block text-caption-medium content-muted">${timeAgo}</span>
				</div>
			</div>
		`;
	}

	function escapeHtml(str) {
		if (!str) return "";
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}

	function placeSettingsPanel(nextToSelector) {
		const settingsPanel = document.getElementById("pls-settings-panel");
		const lastJoinPanel = document.getElementById("pls-last-join-panel");
		const userInfoPanel = document.getElementById("pls-user-info-panel");
		const donationsPanel = document.getElementById("pls-donate-helper-panel");
		if (!settingsPanel || !donationsPanel) return;

		const gap = 8;

		function repositionSettings() {
			const baseLeft = parseInt(donationsPanel.style.left) || 16;
			
			settingsPanel.style.left = baseLeft + "px";
			settingsPanel.style.right = "auto";
			settingsPanel.style.top = "56px";
			settingsPanel.style.display = "block";
			
			const settingsHeight = settingsPanel.offsetHeight || 120;
			let nextTop = 56 + settingsHeight + gap;
			
			const panelWidth = donationsPanel.offsetWidth || 300;
			const halfWidth = Math.floor((panelWidth - gap) / 2);
			
			if (lastJoinPanel) {
				lastJoinPanel.style.left = baseLeft + "px";
				lastJoinPanel.style.right = "auto";
				lastJoinPanel.style.top = nextTop + "px";
				lastJoinPanel.style.width = halfWidth + "px";
				lastJoinPanel.style.minWidth = "auto";
				lastJoinPanel.style.display = "block";
			}
			
			if (userInfoPanel) {
				userInfoPanel.style.left = (baseLeft + halfWidth + gap) + "px";
				userInfoPanel.style.right = "auto";
				userInfoPanel.style.top = nextTop + "px";
				userInfoPanel.style.width = halfWidth + "px";
				userInfoPanel.style.minWidth = "auto";
				userInfoPanel.style.display = "block";
			}
			
			const rowHeight = Math.max(
				lastJoinPanel?.offsetHeight || 80,
				userInfoPanel?.offsetHeight || 80
			);
			nextTop += rowHeight + gap;
			
			donationsPanel.style.top = nextTop + "px";
		}

		setTimeout(repositionSettings, 50);
		window.addEventListener("scroll", repositionSettings, { passive: true });
		window.addEventListener("resize", repositionSettings);
	}

	function placePanel(nextToSelector) {
		const panel = document.getElementById("pls-donate-helper-panel");
		if (!panel) return;

		const target = document.querySelector(nextToSelector);
		if (!target) {
			panel.style.right = "16px";
			panel.style.left = "auto";
			panel.style.top = "96px";
			panel.style.display = "block";
			return;
		}

		panel.classList.add("pls-rail-anchored");

		const margin = 16;
		function reposition() {
			const rect = target.getBoundingClientRect();
			const viewportW = window.innerWidth || document.documentElement.clientWidth;
			
			if (rect.width === 0 || rect.right === 0) {
				panel.style.right = "16px";
				panel.style.left = "auto";
				return;
			}

			const width = panel.offsetWidth || 300;
			const desiredLeft = Math.round(rect.right + margin);
			const maxLeft = viewportW - width - margin;
			const clampedLeft = Math.max(margin, Math.min(desiredLeft, maxLeft));
			
			panel.style.left = clampedLeft + "px";
			panel.style.right = "auto";
			panel.style.top = "96px";
			panel.style.display = "block";
		}

		reposition();
		window.addEventListener("scroll", reposition, { passive: true });
		window.addEventListener("resize", reposition);
	}

	function placeReachPanel(nextToSelector) {
		const panel = document.getElementById("pls-recent-donations");
		if (!panel) return;

		const target = document.querySelector(nextToSelector);
		if (!target) {
			panel.style.left = "16px";
			panel.style.right = "auto";
			panel.style.top = "96px";
			panel.style.display = "block";
			return;
		}

		const margin = 16;
		function repositionLeft() {
			const rect = target.getBoundingClientRect();
			
			if (rect.width === 0 || rect.left === 0) {
				panel.style.left = "16px";
				return;
			}
			
			const width = panel.offsetWidth || 300;
			const desiredLeft = Math.round(rect.left - margin - width);
			const clampedLeft = Math.max(margin, desiredLeft);
			
			panel.style.left = clampedLeft + "px";
			panel.style.top = "96px";
			panel.style.right = "auto";
			panel.style.display = "block";
		}

		repositionLeft();
		window.addEventListener("scroll", repositionLeft, { passive: true });
		window.addEventListener("resize", repositionLeft);
	}

	function startTimeUpdater() {
		setInterval(() => {
			cleanExpiredEntries();
			
			renderDonationsPanel();
			renderReachPanel();
			renderLastJoinPanel();
		}, 1000);
	}

	function checkMinVersion() {
		const minVersion = window.__COTTON_MIN_VERSION__;
		const currentVersion = window.__COTTON_VERSION__;
		
		if (!minVersion || !minVersion.minVersionDate || !currentVersion || !currentVersion.date) {
			return true;
		}
		
		const minDate = new Date(minVersion.minVersionDate).getTime();
		const currentDate = new Date(currentVersion.date).getTime();
		
		if (currentDate < minDate) {
			showReinstallRequired(minVersion.minVersionMessage);
			return false;
		}
		
		return true;
	}
	
	function showReinstallRequired(message) {
		const overlay = document.createElement("div");
		overlay.id = "pls-reinstall-overlay";
		overlay.innerHTML = `
			<div class="rbx-panel rbx-panel-default pls-reinstall-modal">
				<div class="rbx-panel-heading pls-reinstall-header">
					<span class="pls-reinstall-icon">⚠️</span>
					<h4 class="rbx-panel-title">Pls Cotton Update Required</h4>
				</div>
				<div class="rbx-panel-body">
					<p class="text-description pls-reinstall-message">${escapeHtml(message || "A critical update requires you to reinstall the extension.")}</p>
					<div class="pls-reinstall-steps">
						<div class="pls-reinstall-step">
							<span class="pls-step-number">1</span>
							<span class="text-default">Remove the current extension from Chrome</span>
						</div>
						<div class="pls-reinstall-step">
							<span class="pls-step-number">2</span>
							<span class="text-default">Download the latest version from Discord server</span>
						</div>
						<div class="pls-reinstall-step">
							<span class="pls-step-number">3</span>
							<span class="text-default">Reinstall the extension</span>
						</div>
					</div>
					<a href="https://discord.com/channels/1311356252588212295/1458899917350375639/1459141476918497290" target="_blank" class="btn-primary-md pls-reinstall-btn">
						Go to Download
					</a>
				</div>
			</div>
		`;
		
		document.body.appendChild(overlay);
	}

	function init() {
		if (!checkMinVersion()) {
			return;
		}
		
		initSocket();
		
		if (!isLoggedIn()) {
			showLoginPopup();
			return;
		}
		
		connectSocket();
	}

	function initAfterLogin() {
		loadSettings();

		createSettingsPanel();
		createLastJoinPanel();
		createUserInfoPanel();
		createDonationsPanel();
		createReachPanel();

		initJoinButtons();

		startTimeUpdater();

		const selector = "#game-detail-page";
		waitForElement(selector, 20000)
			.then(() => {
				requestAnimationFrame(() => {
					setTimeout(() => {
						placePanel(selector);
						placeReachPanel(selector);
						placeSettingsPanel(selector);
						
						setTimeout(() => {
							const donationsPanel = document.getElementById("pls-donate-helper-panel");
							const reachPanel = document.getElementById("pls-recent-donations");
							const settingsPanel = document.getElementById("pls-settings-panel");
							if (donationsPanel) donationsPanel.dispatchEvent(new Event('reposition'));
							if (reachPanel) reachPanel.dispatchEvent(new Event('reposition'));
							if (settingsPanel) settingsPanel.dispatchEvent(new Event('reposition'));
							
							window.dispatchEvent(new Event('scroll'));
						}, 500);
					}, 100);
				});
			})
			.catch(() => {
				const settingsPanel = document.getElementById("pls-settings-panel");
				const lastJoinPanel = document.getElementById("pls-last-join-panel");
				const donationsPanel = document.getElementById("pls-donate-helper-panel");
				const reachPanel = document.getElementById("pls-recent-donations");
				
				let nextTop = 56;
				if (settingsPanel) {
					settingsPanel.style.top = nextTop + "px";
					settingsPanel.style.right = "16px";
					settingsPanel.style.display = "block";
					nextTop += (settingsPanel.offsetHeight || 120) + 8;
				}
				if (lastJoinPanel) {
					lastJoinPanel.style.top = nextTop + "px";
					lastJoinPanel.style.right = "16px";
					lastJoinPanel.style.display = "block";
					nextTop += (lastJoinPanel.offsetHeight || 80) + 8;
				}
				if (donationsPanel) {
					donationsPanel.style.top = nextTop + "px";
					donationsPanel.style.right = "16px";
					donationsPanel.style.display = "block";
				}
				if (reachPanel) {
					reachPanel.style.top = "56px";
					reachPanel.style.left = "16px";
					reachPanel.style.display = "block";
				}
			});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
