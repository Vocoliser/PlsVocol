importScripts("socket.io.min.js");

const REPO = "Vocoliser/PlsVocol";
const SOCKET_URL = "https://plsbrainrot.me";
const SOCKET_PATH = "/cotton/socket";

let socket = null;
let connectedTabs = new Set();

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

function initSocket() {
	if (socket) return;
	
	socket = io(SOCKET_URL, {
		path: SOCKET_PATH,
		transports: ["websocket", "polling"],
		reconnection: true,
		reconnectionAttempts: 5,
		reconnectionDelay: 3000
	});
	
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
		broadcastToTabs({ type: "socket_init", data });
	});
	
	socket.on("reach", (entry) => {
		broadcastToTabs({ type: "socket_reach", entry });
	});
	
	socket.on("found", (entry) => {
		broadcastToTabs({ type: "socket_found", entry });
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
	if (message.type === "loadRemoteCode" && sender.tab) {
		connectedTabs.add(sender.tab.id);
		
		(async () => {
			try {
				const commit = await getLatestCommit();
				const baseUrl = `https://raw.githubusercontent.com/${REPO}/${commit.sha}/remote`;
				
				const [cssContent, jsContent] = await Promise.all([
					fetchRemote(`${baseUrl}/styles.css`),
					fetchRemote(`${baseUrl}/main.js`)
				]);
				
				// Inject CSS
				await chrome.scripting.insertCSS({
					target: { tabId: sender.tab.id },
					css: cssContent
				});
				
				// Inject version info
				await chrome.scripting.executeScript({
					target: { tabId: sender.tab.id },
					world: "MAIN",
					args: [commit.sha, commit.date],
					func: (sha, date) => {
						window.__COTTON_VERSION__ = { sha, date };
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
				
				// Initialize socket connection
				initSocket();
				
				// Send current socket state
				if (socket && socket.connected) {
					chrome.tabs.sendMessage(sender.tab.id, { type: "socket_connect", id: socket.id });
				}
				
				sendResponse({ success: true, version: commit.sha.substring(0, 7) });
			} catch (error) {
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}
});

// Clean up tabs when they're closed
chrome.tabs.onRemoved.addListener((tabId) => {
	connectedTabs.delete(tabId);
});
