(() => {
	"use strict";

	const REPO = "Vocoliser/PlsVocol";

	async function getLatestCommitSha() {
		const response = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
			headers: { "Accept": "application/vnd.github.v3+json" }
		});
		if (!response.ok) throw new Error("Failed to get commit");
		const data = await response.json();
		return data.sha;
	}

	async function fetchRemote(url, type) {
		const cacheKey = `Cotton_cache_${type}`;
		
		try {
			const response = await fetch(url);
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			
			const content = await response.text();
			
			try {
				localStorage.setItem(cacheKey, content);
			} catch (e) {}
			
			return content;
		} catch (error) {
			const cached = localStorage.getItem(cacheKey);
			if (cached) {
				return cached;
			}
			throw error;
		}
	}

	async function injectCSS(cssContent) {
		const style = document.createElement("style");
		style.id = "Cotton-styles";
		style.textContent = cssContent;
		document.head.appendChild(style);
	}

	async function injectJS(jsContent) {
		const blob = new Blob([jsContent], { type: "application/javascript" });
		const url = URL.createObjectURL(blob);
		const script = document.createElement("script");
		script.id = "Cotton-script";
		script.src = url;
		script.onload = () => URL.revokeObjectURL(url);
		document.head.appendChild(script);
	}

	async function loadRemoteCode() {
		try {
			const sha = await getLatestCommitSha();
			const baseUrl = `https://raw.githubusercontent.com/${REPO}/${sha}/remote`;
			
			const [cssContent, jsContent] = await Promise.all([
				fetchRemote(`${baseUrl}/styles.css`, "css"),
				fetchRemote(`${baseUrl}/main.js`, "js")
			]);
			
			await injectCSS(cssContent);
			await injectJS(jsContent);
		} catch (error) {
			console.error("[Cotton Loader] Failed to load remote code:", error);
			showLoadError(error.message);
		}
	}

	function showLoadError(message) {
		const errorDiv = document.createElement("div");
		errorDiv.style.cssText = `
			position: fixed;
			top: 60px;
			right: 16px;
			background: #fee2e2;
			border: 1px solid #ef4444;
			color: #dc2626;
			padding: 12px 16px;
			border-radius: 8px;
			font-family: system-ui, sans-serif;
			font-size: 13px;
			z-index: 2147483000;
			max-width: 300px;
		`;
		errorDiv.innerHTML = `
			<strong>Cotton Load Error</strong><br>
			${message}<br>
			<small>Check console for details</small>
		`;
		document.body.appendChild(errorDiv);
		
		setTimeout(() => errorDiv.remove(), 10000);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", loadRemoteCode);
	} else {
		loadRemoteCode();
	}
})();
