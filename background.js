chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "executeCode" && sender.tab) {
		chrome.scripting.executeScript({
			target: { tabId: sender.tab.id },
			world: "MAIN",
			args: [message.code],
			func: (code) => {
				const script = document.createElement("script");
				script.textContent = code;
				document.head.appendChild(script);
				script.remove();
			}
		}).then(() => sendResponse({ success: true }))
		.catch(err => sendResponse({ success: false, error: err.message }));
		return true;
	}
	
	if (message.type === "injectCSS" && sender.tab) {
		chrome.scripting.insertCSS({
			target: { tabId: sender.tab.id },
			css: message.css
		}).then(() => sendResponse({ success: true }))
		.catch(err => sendResponse({ success: false, error: err.message }));
		return true;
	}
});
