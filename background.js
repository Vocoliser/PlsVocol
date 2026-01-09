importScripts("socket.io.min.js");

const DEV_MODE = true

const REPO = "Vocoliser/PlsVocol";
const SOCKET_URL = "https://plsbrainrot.me";
const SOCKET_PATH = "/cotton/socket";

let socket = null;
let connectedTabs = new Set();
let cachedInitData = null;
let authToken = null;

async function getLatestCommit() {
	const response = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
		headers: { "Accept": "application/vnd.github.v3+json" }
	});
	if (!response.ok) throw new Error("Failed to get commit");
	const data = await response.json();
	return {
		sha: data.sha,
		date: data.commit.author.date
	};
}

async function fetchRemote(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.text();
}

function initSocket(token) {
	if (token) authToken = token;
	if (socket) return;
	
	const socketOptions = {
		path: SOCKET_PATH,
		transports: ["websocket", "polling"],
		reconnection: true,
		reconnectionAttempts: 5,
		reconnectionDelay: 3000
	};
	
	// Add auth token if available
	if (authToken) {
		socketOptions.auth = { token: authToken };
	}
	
	socket = io(SOCKET_URL, socketOptions);
	
	socket.on("connect", () => {
		broadcastToTabs({ type: "socket_connect", id: socket.id });
	});
	
	socket.on("disconnect", (reason) => {
		broadcastToTabs({ type: "socket_disconnect", reason });
	});
	
	socket.on("connect_error", (error) => {
		broadcastToTabs({ type: "socket_error", message: error.message });
	});
	
	socket.on("init", (data) => {
		cachedInitData = data;
		broadcastToTabs({ type: "socket_init", data });
	});
	
	socket.on("reach", (entry) => {
		broadcastToTabs({ type: "socket_reach", entry });
	});
	
	socket.on("found", (entry) => {
		broadcastToTabs({ type: "socket_found", entry });
	});
	
	socket.on("clientCount", (count) => {
		broadcastToTabs({ type: "socket_clientCount", count });
	});
}

function broadcastToTabs(message) {
	connectedTabs.forEach(tabId => {
		chrome.tabs.sendMessage(tabId, message).catch(() => {
			connectedTabs.delete(tabId);
		});
	});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "checkVersion") {
		(async () => {
			try {
				if (DEV_MODE) {
					sendResponse({ success: true, sha: "LOCAL" });
					return;
				}
				const commit = await getLatestCommit();
				sendResponse({ success: true, sha: commit.sha });
			} catch (error) {
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}
	
	if (message.type === "loadRemoteCode" && sender.tab) {
		connectedTabs.add(sender.tab.id);
		
		(async () => {
			try {
				let cssContent, jsContent, versionInfo;
				
			let minVersionInfo = null;
			
			if (DEV_MODE) {
				// Load from local remote/ folder
				[cssContent, jsContent] = await Promise.all([
					fetchRemote(chrome.runtime.getURL("remote/styles.css")),
					fetchRemote(chrome.runtime.getURL("remote/main.js"))
				]);
				versionInfo = { sha: "LOCAL", date: null };
			} else {
				// Load from GitHub
				const commit = await getLatestCommit();
				const baseUrl = `https://raw.githubusercontent.com/${REPO}/${commit.sha}/remote`;
				[cssContent, jsContent] = await Promise.all([
					fetchRemote(`${baseUrl}/styles.css`),
					fetchRemote(`${baseUrl}/main.js`)
				]);
				versionInfo = { sha: commit.sha, date: commit.date };
				
				// Fetch version requirements
				try {
					const versionJson = await fetchRemote(`${baseUrl}/version.json`);
					minVersionInfo = JSON.parse(versionJson);
				} catch (e) {
					// version.json not found or invalid, continue without it
				}
			}
				
				// Inject CSS
				await chrome.scripting.insertCSS({
					target: { tabId: sender.tab.id },
					css: cssContent
				});
				
			// Inject version info and sound URL
			const soundUrl = chrome.runtime.getURL("sound.ogg");
			await chrome.scripting.executeScript({
				target: { tabId: sender.tab.id },
				world: "MAIN",
				args: [versionInfo.sha, versionInfo.date, soundUrl, minVersionInfo],
				func: (sha, date, sound, minVersion) => {
					window.__COTTON_VERSION__ = { sha, date };
					window.__COTTON_SOUND_URL__ = sound;
					window.__COTTON_MIN_VERSION__ = minVersion;
				}
			});
				
			// Inject main JS
			await chrome.scripting.executeScript({
				target: { tabId: sender.tab.id },
				world: "MAIN",
				args: [jsContent],
				func: (code) => {
					const script = document.createElement("script");
					script.textContent = code;
					document.head.appendChild(script);
					script.remove();
				}
			});
			
			sendResponse({ success: true, version: versionInfo.sha.substring(0, 7) });
			} catch (error) {
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}
	
	// Connect socket after login
	if (message.type === "connectSocket" && sender.tab) {
		connectedTabs.add(sender.tab.id);
		
		// Always reconnect socket to get fresh data
		if (socket) {
			socket.disconnect();
			socket = null;
		}
		
		// Initialize socket connection with auth token
		initSocket(message.authToken);
		
		// Send socket state to tab after connection
		setTimeout(() => {
			if (socket && socket.connected) {
				chrome.tabs.sendMessage(sender.tab.id, { type: "socket_connect", id: socket.id }).catch(() => {});
			}
		}, 500);
		
		return true;
	}
});

// Clean up tabs when they're closed
chrome.tabs.onRemoved.addListener((tabId) => {
	connectedTabs.delete(tabId);
	cleanupIfNoTabs();
});

// Clean up tabs when they navigate away from game page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (connectedTabs.has(tabId) && changeInfo.url) {
		const isGamePage = tab.url && (
			tab.url.includes("roblox.com/games/8737602449") ||
			tab.url.includes("web.roblox.com/games/8737602449")
		);
		if (!isGamePage) {
			connectedTabs.delete(tabId);
			cleanupIfNoTabs();
		}
	}
});

function cleanupIfNoTabs() {
	if (connectedTabs.size === 0 && socket) {
		socket.disconnect();
		socket = null;
		cachedInitData = null;
		cachedInitTimestamp = 0;
	}
}
