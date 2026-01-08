const REPO = "Vocoliser/PlsVocol";
const SOCKETIO_CDN = "https://cdn.socket.io/4.7.2/socket.io.min.js";
const SOCKET_URL = "https://plsbrainrot.me";
const SOCKET_PATH = "/cotton/socket";

let socket = null;
let connectedTabs = new Set();

async function getLatestCommitSha() {
	const response = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
		headers: { "Accept": "application/vnd.github.v3+json" }
	});
	if (!response.ok) throw new Error("Failed to get commit");
	const data = await response.json();
	return data.sha;
}

async function fetchRemote(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.text();
}

async function initSocket() {
	if (socket) return;
	
	// Import socket.io-client
	const socketioCode = await fetchRemote(SOCKETIO_CDN);
	eval(socketioCode);
	
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
				const sha = await getLatestCommitSha();
				const baseUrl = `https://raw.githubusercontent.com/${REPO}/${sha}/remote`;
				
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
					args: [sha],
					func: (sha) => {
						window.__COTTON_VERSION__ = sha;
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
				await initSocket();
				
				// Send current socket state
				if (socket && socket.connected) {
					chrome.tabs.sendMessage(sender.tab.id, { type: "socket_connect", id: socket.id });
				}
				
				sendResponse({ success: true, version: sha.substring(0, 7) });
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
