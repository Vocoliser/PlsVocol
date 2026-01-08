(() => {
	"use strict";

	const CONFIG = {
		socketUrl: "https://plsbrainrot.me",
		socketPath: "/cotton/socket",
		maxDisplayedDonations: 20,
		maxDisplayedReach: 20,
		feedExpiryMs: 5 * 60 * 1000,
		reconnectAttempts: 5,
		reconnectDelay: 3000,
		autoJoinEnabled: false,
		autoJoinMinRobux: 0,
		autoJoinGameFilters: ["Main"],
		autoJoinSkipFull: false,
	};

	const GameName = {
		"8737602449": "Main",
		"8943844393": "Voice Chat",
		"8943846005": "Legacy Map",
		"15611066348": "Deluxe Voice Chat",
		"18852429314": "17+"
	};

	let socket = null;
	let isConnected = false;
	let reachEntries = [];
	let foundEntries = [];
	let mergedDonations = [];
	let connectionAttempts = 0;

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
				autoJoinSkipFull: CONFIG.autoJoinSkipFull
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
		
		joinServer(entry.placeId, entry.serverId);
	}

	function joinServer(placeId, serverId) {
		if (!placeId || !serverId) {
			console.error("[Cotton] Cannot join: missing placeId or serverId");
			return;
		}
		
		const joinUrl = `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
		
		window.location.href = joinUrl;
	}

	function initSocket() {
		if (typeof io === "undefined") {
			console.error("[Cotton] Socket.IO not loaded");
			showConnectionError("Socket.IO library not loaded");
			return;
		}

		socket = io(CONFIG.socketUrl, {
			path: CONFIG.socketPath,
			transports: ["websocket", "polling"],
			reconnection: true,
			reconnectionAttempts: CONFIG.reconnectAttempts,
			reconnectionDelay: CONFIG.reconnectDelay,
		});

		socket.on("connect", () => {
			isConnected = true;
			connectionAttempts = 0;
			updateConnectionStatus(true);
		});

		socket.on("disconnect", () => {
			isConnected = false;
			updateConnectionStatus(false);
		});

		socket.on("connect_error", (error) => {
			console.error("[Cotton] Connection error:", error.message);
			connectionAttempts++;
			if (connectionAttempts >= CONFIG.reconnectAttempts) {
				showConnectionError("Failed to connect after " + CONFIG.reconnectAttempts + " attempts");
			}
		});

		socket.on("init", (data) => {
			if (data.reach) {
				reachEntries = data.reach.slice().reverse().slice(0, CONFIG.maxDisplayedReach);
			}
			if (data.found) {
				foundEntries = data.found.slice().reverse();
				rebuildMergedDonations();
			}
			
			renderDonationsPanel();
			renderReachPanel();
			
			setTimeout(() => {
				lockPanelWidths();
			}, 300);
		});

		socket.on("reach", (entry) => {
			reachEntries.unshift(entry);
			if (reachEntries.length > CONFIG.maxDisplayedReach) reachEntries.pop();
			renderReachPanel();
			highlightNewEntry("reach-" + entry.id);
		});

		socket.on("found", (entry) => {
			addFoundEntry(entry);
			renderDonationsPanel();
			highlightNewEntry("found-" + entry.id);
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
			statusEl.innerHTML = connected
				? '<span class="pls-status-dot pls-dot-green"></span> Live'
				: '<span class="pls-status-dot pls-dot-red"></span> Disconnected';
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
				<div class="pls-setting-section-title">Game Filters (empty = all)</div>
				<div class="pls-game-filters">
					${gameCheckboxes}
				</div>
			</div>
		`;

		document.body.appendChild(panel);
		initSettingsListeners();
	}

	function initSettingsListeners() {
		const autoJoinBtn = document.getElementById("pls-autojoin-btn");
		if (autoJoinBtn) {
			autoJoinBtn.addEventListener("click", () => {
				CONFIG.autoJoinEnabled = !CONFIG.autoJoinEnabled;
				saveSettings();
				updateAutoJoinButton();
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
		const donationsPanel = document.getElementById("pls-donate-helper-panel");
		if (!settingsPanel || !donationsPanel) return;

		const gap = 8;

		function repositionSettings() {
			settingsPanel.style.left = donationsPanel.style.left;
			settingsPanel.style.right = "auto";
			
			settingsPanel.style.top = "56px";
			settingsPanel.style.display = "block";
			
			const settingsHeight = settingsPanel.offsetHeight || 120;
			donationsPanel.style.top = (56 + settingsHeight + gap) + "px";
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
		}, 1000);
	}

	function init() {
		loadSettings();

		createSettingsPanel();
		createDonationsPanel();
		createReachPanel();

		initSocket();

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
				const donationsPanel = document.getElementById("pls-donate-helper-panel");
				const reachPanel = document.getElementById("pls-recent-donations");
				
				if (settingsPanel) {
					settingsPanel.style.top = "56px";
					settingsPanel.style.right = "16px";
					settingsPanel.style.display = "block";
				}
				if (donationsPanel) {
					const settingsHeight = settingsPanel ? (settingsPanel.offsetHeight || 120) : 0;
					donationsPanel.style.top = (56 + settingsHeight + 8) + "px";
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
