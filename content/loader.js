(() => {
	"use strict";

	// Listen for socket events from background and relay to page
	chrome.runtime.onMessage.addListener((message) => {
		if (message.type && message.type.startsWith("socket_")) {
			window.dispatchEvent(new CustomEvent("cotton_socket", { detail: message }));
				}
	});

	// Listen for version check requests from page and relay to background
	window.addEventListener("cotton_check_version", () => {
		chrome.runtime.sendMessage({ type: "checkVersion" }, (response) => {
			if (chrome.runtime.lastError) return;
			if (response && response.success) {
				window.dispatchEvent(new CustomEvent("cotton_version_result", { 
					detail: { sha: response.sha } 
				}));
			}
		});
	});

	// Listen for socket connect requests from page (after login)
	window.addEventListener("cotton_connect_socket", (e) => {
		const authToken = e.detail?.authToken;
		chrome.runtime.sendMessage({ type: "connectSocket", authToken });
	});

	function loadRemoteCode() {
		chrome.runtime.sendMessage({ type: "loadRemoteCode" }, (response) => {
			if (chrome.runtime.lastError) {
				console.error("[Cotton Loader] Runtime error:", chrome.runtime.lastError.message);
				showLoadError("Extension error: " + chrome.runtime.lastError.message);
				return;
			}
			
			if (!response || !response.success) {
				console.error("[Cotton Loader] Failed:", response?.error);
				showLoadError(response?.error || "Unknown error");
			}
		});
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
		
		const title = document.createElement("strong");
		title.textContent = "Cotton Load Error";
		const msgText = document.createElement("span");
		msgText.textContent = message;
		const hint = document.createElement("small");
		hint.textContent = "Check console for details";
		
		errorDiv.appendChild(title);
		errorDiv.appendChild(document.createElement("br"));
		errorDiv.appendChild(msgText);
		errorDiv.appendChild(document.createElement("br"));
		errorDiv.appendChild(hint);
		
		document.body.appendChild(errorDiv);
		setTimeout(() => errorDiv.remove(), 10000);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", loadRemoteCode);
	} else {
		loadRemoteCode();
	}
})();
