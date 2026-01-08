(() => {
	"use strict";

	const REMOTE_BASE_URL = "https://raw.githubusercontent.com/Vocoliser/PlsVocol/main/remote";
	
	const REMOTE_FILES = {
		js: `${REMOTE_BASE_URL}/main.js`,
		css: `${REMOTE_BASE_URL}/styles.css`
	};

	let loadTime = null;

	async function fetchRemote(url, type) {
		const cacheKey = `Cotton_cache_${type}`;
		const fetchUrl = url + `?t=${Date.now()}`;
		
		try {
			const response = await fetch(fetchUrl, { cache: 'no-store' });
			
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
		const existing = document.getElementById("Cotton-styles");
		if (existing) existing.remove();
		
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

	async function loadRemoteCode(isManualRefresh = false) {
		loadTime = new Date().toLocaleTimeString();
		
		try {
			const [cssContent, jsContent] = await Promise.all([
				fetchRemote(REMOTE_FILES.css, "css"),
				fetchRemote(REMOTE_FILES.js, "js")
			]);
			
			await injectCSS(cssContent);
			await injectJS(jsContent);
			
			if (isManualRefresh) {
				showToast("Code refreshed!");
			}
			
			createDebugButton();
		} catch (error) {
			console.error("[Cotton Loader] Failed to load remote code:", error);
			showLoadError(error.message);
		}
	}
	
	function showToast(msg) {
		const toast = document.createElement("div");
		toast.style.cssText = `
			position: fixed; bottom: 20px; right: 20px; background: #22c55e; color: white;
			padding: 10px 16px; border-radius: 8px; font-family: system-ui; font-size: 13px;
			z-index: 2147483647; animation: fadeIn 0.2s;
		`;
		toast.textContent = msg;
		document.body.appendChild(toast);
		setTimeout(() => toast.remove(), 2000);
	}
	
	function createDebugButton() {
		if (document.getElementById("Cotton-debug-btn")) return;
		
		const btn = document.createElement("button");
		btn.id = "Cotton-debug-btn";
		btn.innerHTML = "🔄";
		btn.title = `Cotton - Last load: ${loadTime}\nClick to refresh code`;
		btn.style.cssText = `
			position: fixed; bottom: 16px; left: 16px; width: 36px; height: 36px;
			background: #1f2937; color: white; border: none; border-radius: 50%;
			font-size: 16px; cursor: pointer; z-index: 2147483647;
			opacity: 0.6; transition: opacity 0.2s;
		`;
		btn.onmouseenter = () => btn.style.opacity = "1";
		btn.onmouseleave = () => btn.style.opacity = "0.6";
		btn.onclick = () => {
			btn.innerHTML = "⏳";
			localStorage.removeItem("Cotton_cache_js");
			localStorage.removeItem("Cotton_cache_css");
			loadRemoteCode(true).then(() => {
				btn.innerHTML = "🔄";
				btn.title = `Cotton - Last load: ${loadTime}\nClick to refresh code`;
			});
		};
		document.body.appendChild(btn);
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
