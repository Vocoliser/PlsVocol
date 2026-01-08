const REPO = "Vocoliser/PlsVocol";

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "loadRemoteCode" && sender.tab) {
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
				
				// Inject JS
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
				
				sendResponse({ success: true, version: sha.substring(0, 7) });
			} catch (error) {
				sendResponse({ success: false, error: error.message });
			}
		})();
		return true;
	}
	
	if (message.type === "getVersion") {
		getLatestCommitSha()
			.then(sha => sendResponse({ success: true, sha }))
			.catch(err => sendResponse({ success: false, error: err.message }));
		return true;
	}
});
