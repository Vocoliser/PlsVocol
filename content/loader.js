(() => {
	"use strict";

	const REMOTE_BASE_URL = "https://raw.githubusercontent.com/Vocoliser/PlsVocol/main/remote";
	
	const REMOTE_FILES = {
		js: `${REMOTE_BASE_URL}/main.js`,
		css: `${REMOTE_BASE_URL}/styles.css`
	};

	async function fetchRemote(url, type) {
		const cacheKey = `Cotton_cache_${type}`;
		
		try {
			const response = await fetch(url + `?t=${Date.now()}`);
			
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
		try {
			const func = new Function(jsContent);
			func();
		} catch (error) {
			console.error("[Cotton Loader] JS execution error:", error);
		}
	}

	async function loadRemoteCode() {
		try {
			const [cssContent, jsContent] = await Promise.all([
				fetchRemote(REMOTE_FILES.css, "css"),
				fetchRemote(REMOTE_FILES.js, "js")
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
