// Background script for the CV Template Converter extension

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('CV Template Converter extension installed');
});

// Set up communication with content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractCV") {
    // Inject content script to extract CV data
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: triggerExtraction
      });
    });
    return true;
  }
  
  if (message.action === "processCV") {
    // Send the LaTeX code to the backend for processing
    processWithBackend(message.latexCode, message.templateUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({error: error.message}));
    return true; // indicates we will send a response asynchronously
  }
});

// Function to trigger CV extraction from the page
function triggerExtraction() {
  document.dispatchEvent(new CustomEvent('CV_EXTRACT_REQUESTED'));
}

// Function to send data to backend for processing
async function processWithBackend(latexCode, templateUrl) {
  try {
    // In a real implementation, this would be your backend API endpoint
    const backendUrl = "https://c8afbae6-de88-4ccd-ab91-0ed30e60edbd-00-2zgg5lg0r3iub.spock.replit.dev/";
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sourceLatex: latexCode,
        templateUrl: templateUrl
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend processing failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error processing with backend:", error);
    throw error;
  }
}