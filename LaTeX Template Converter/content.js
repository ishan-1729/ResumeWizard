// Content script for the CV Template Converter extension
// This script interacts directly with the Overleaf editor

// Wait for the Overleaf editor to fully load
function waitForEditor() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // More specific selector for CodeMirror 6 view
      const editorView = document.querySelector('.cm-editor');
      if (editorView) {
        // Check if it has content lines, indicating it's likely ready
        const contentLines = editorView.querySelector('.cm-line');
        if (contentLines) {
           clearInterval(checkInterval);
           console.log("Editor view found:", editorView); // Debug log
           resolve(editorView);
        }
      }
    }, 500);
  });
}

// Add extension button and panel to Overleaf interface
function addExtensionUI() {
  // Create the extension button
  const button = document.createElement('div');
  button.id = 'cv-converter-btn';
  button.className = 'cv-converter-btn';
  button.textContent = 'Resume Wizard';

  // Create the panel that will appear when button is clicked
  const panel = document.createElement('div');
  panel.id = 'cv-converter-panel';
  panel.className = 'cv-converter-panel hidden';
  panel.innerHTML = `
    <div class="cv-converter-panel-header">
      <h3>CV Template Converter</h3>
      <button id="cv-converter-close">×</button>
    </div>
    <div class="cv-converter-panel-body">
      <div class="cv-converter-step" id="step-extract">
        <h4>Step 1: Extract CV Data</h4>
        <p>Click to extract data from your current CV.</p>
        <button id="cv-extract-btn">Extract CV Data</button>
        <div id="extraction-status" class="status-message hidden"></div>
      </div>
      <div class="cv-converter-step" id="step-template">
        <h4>Step 2: Choose New Template</h4>
        <p>Enter Overleaf template URL or choose from popular templates:</p>
        <input type="text" id="template-url" placeholder="https://www.overleaf.com/latex/templates/...">
        <div class="popular-templates">
          <select id="popular-template-select">
            <option value="">-- Popular Templates --</option>
            <option value="https://www.overleaf.com/latex/templates/awesome-cv/dfnvtnhzhhbm">Awesome CV</option>
            <option value="https://www.overleaf.com/latex/templates/deedy-resume/bjryvfsjdyxz">Deedy Resume</option>
            <option value="https://www.overleaf.com/latex/templates/moderncv-classic/qzxmwmmkqzjv">ModernCV Classic</option>
          </select>
        </div>
      </div>
      <div class="cv-converter-step" id="step-convert">
        <h4>Step 3: Convert</h4>
        <button id="convert-btn" disabled>Convert CV</button>
        <div id="conversion-status" class="status-message hidden"></div>
      </div>
      </div>
    </div>
  `;

  // Add elements to the page
  // Try to find a suitable toolbar element, fallback to body
  const toolbar = document.querySelector('.toolbar-header .toolbar-right-section') || document.querySelector('.toolbar-header') || document.body;
  toolbar.appendChild(button);
  document.body.appendChild(panel);

  // Set up event listeners for UI elements
  document.getElementById('cv-converter-btn').addEventListener('click', togglePanel);
  document.getElementById('cv-converter-close').addEventListener('click', togglePanel);
  document.getElementById('cv-extract-btn').addEventListener('click', extractCV);
  document.getElementById('popular-template-select').addEventListener('change', updateTemplateUrl);
  document.getElementById('convert-btn').addEventListener('click', convertCV);

  // Enable/disable convert button based on fields
  const templateInput = document.getElementById('template-url');
  templateInput.addEventListener('input', validateConvertButton);
}

// Toggle the converter panel visibility
function togglePanel() {
  const panel = document.getElementById('cv-converter-panel');
  panel.classList.toggle('hidden');
}

// *** MODIFIED FUNCTION ***
// Get content from CodeMirror editor
function getEditorContent() {
  console.log("Attempting to get editor content..."); // Debug log
  // Try the primary CodeMirror 6 selector first
  const editorView = document.querySelector('.cm-editor');
  if (editorView) {
    console.log("Found .cm-editor element."); // Debug log
    // Try to get text from all lines within the content area
    const lines = editorView.querySelectorAll('.cm-line');
    if (lines && lines.length > 0) {
       console.log(`Found ${lines.length} lines.`); // Debug log
       let content = '';
       lines.forEach(line => {
         // Append line text and a newline character
         content += line.textContent + '\n';
       });
       // Trim trailing newline if present
       content = content.trimEnd();
       console.log("Extracted content length:", content.length); // Debug log
       if (content.length > 0) {
           return content;
       } else {
           console.warn("Extracted content is empty using .cm-line query."); // Debug log
       }
    } else {
        console.warn("No .cm-line elements found within .cm-editor."); // Debug log
        // Fallback: Try getting innerText of the main content element directly
        // This might grab extra UI text, but is a fallback.
        const contentElement = editorView.querySelector('.cm-content');
        if (contentElement && contentElement.innerText) {
            console.log("Using fallback: .cm-content.innerText"); // Debug log
            return contentElement.innerText;
        }
    }
  }

  console.warn("Could not find .cm-editor or extract content via primary methods."); // Debug log

  // Fallback approach for older Overleaf (iframe) - keep as is
  const editorIframe = document.querySelector('#editor-iframe');
  if (editorIframe && editorIframe.contentDocument) {
     console.log("Trying iframe fallback..."); // Debug log
    const editorContent = editorIframe.contentDocument.querySelector('.CodeMirror');
    if (editorContent && editorContent.CodeMirror) {
       console.log("Found CodeMirror instance in iframe."); // Debug log
      return editorContent.CodeMirror.getValue();
    }
  }

  console.error("Failed to access editor content via all methods."); // Debug log
  throw new Error("Could not access editor content");
}


// Extract CV data from the editor
async function extractCV() {
  const statusElement = document.getElementById('extraction-status');
  statusElement.textContent = "Extracting CV data...";
  statusElement.className = "status-message"; // Reset class, make visible
  statusElement.classList.remove('hidden', 'success', 'error'); // Ensure visibility and remove status colors

  try {
    // Get editor content using the potentially improved function
    const editorContent = getEditorContent();

    if (!editorContent || editorContent.trim() === '') {
        throw new Error("Extracted content is empty.");
    }

    // Store the extracted LaTeX in local storage
    await chrome.storage.local.set({ cvLatexCode: editorContent }); // Use await for reliability

    console.log("CV data stored in local storage."); // Debug log
    statusElement.textContent = "✓ CV data extracted successfully!";
    statusElement.classList.add("success");

    // Enable convert button if template URL is set
    validateConvertButton();
  } catch (error) {
    console.error("Error extracting CV data:", error);
    statusElement.textContent = "❌ Error extracting CV data: " + error.message;
    statusElement.classList.add("error");
    // Clear potentially stored invalid data
    await chrome.storage.local.remove('cvLatexCode');
  }
}

// Update template URL when selecting from dropdown
function updateTemplateUrl() {
  const select = document.getElementById('popular-template-select');
  const input = document.getElementById('template-url');

  if (select.value) {
    input.value = select.value;
  }

  validateConvertButton();
}

// Validate if convert button should be enabled
function validateConvertButton() {
  const templateUrl = document.getElementById('template-url').value.trim();
  const convertBtn = document.getElementById('convert-btn');

  // Get the stored CV data
  chrome.storage.local.get(['cvLatexCode'], (result) => {
    const hasCV = result.cvLatexCode && result.cvLatexCode.trim().length > 0;
    console.log(`Validating Convert Button: hasCV=${hasCV}, templateUrl=${!!templateUrl}`); // Debug log
    // Enable button only if we have both CV data and a template URL
    convertBtn.disabled = !(hasCV && templateUrl);
  });
}

// Send CV to backend for conversion
function convertCV() {
  const statusElement = document.getElementById('conversion-status');
  statusElement.textContent = "Converting CV template...";
  statusElement.className = "status-message"; // Reset class, make visible
  statusElement.classList.remove('hidden', 'success', 'error');

  // Clear previous results if any
  const existingResults = document.getElementById('conversion-results');
  if (existingResults) {
      existingResults.remove();
  }

  const templateUrl = document.getElementById('template-url').value.trim();

  chrome.storage.local.get(['cvLatexCode'], (result) => {
    if (!result.cvLatexCode || result.cvLatexCode.trim() === '') {
      statusElement.textContent = "❌ No CV data found. Please extract first.";
      statusElement.classList.add("error");
      validateConvertButton(); // Re-check button state
      return;
    }

    console.log(`Sending to background: template=${templateUrl}, latex length=${result.cvLatexCode.length}`); // Debug log
    // Send message to background script to process CV
    chrome.runtime.sendMessage({
      action: "processCV",
      latexCode: result.cvLatexCode,
      templateUrl: templateUrl
    }, (response) => {
      // Check if response exists before accessing properties
      if (!response) {
          console.error("No response received from background script.");
          statusElement.textContent = "❌ Conversion failed: No response from background.";
          statusElement.classList.add("error");
          return;
      }

      console.log("Response from background:", response); // Debug log
      if (response.error) {
        statusElement.textContent = "❌ Conversion failed: " + response.error;
        statusElement.classList.add("error");
      } else if (response.success && response.convertedLatex) {
        statusElement.textContent = "✓ Conversion successful!";
        statusElement.classList.add("success");

        // Show options to apply the converted template
        showConversionResults(response.convertedLatex);
      } else {
          // Handle unexpected success response format
          statusElement.textContent = "❌ Conversion failed: Unexpected response format.";
          statusElement.classList.add("error");
      }
    });
  });
}

// Show conversion results and options to apply
function showConversionResults(convertedLatex) {
  // Remove previous results if any
  const existingResults = document.getElementById('conversion-results');
  if (existingResults) {
      existingResults.remove();
  }

  // Create results container
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'conversion-results';
  resultsDiv.className = 'conversion-results';
  resultsDiv.innerHTML = `
    <h4>Conversion Complete!</h4>
    <p>What would you like to do with the converted CV?</p>
    <div class="result-actions">
      <button id="preview-btn">Preview</button>
      <button id="replace-btn">Replace Current Document</button>
      <button id="new-project-btn">Create New Project</button>
      <button id="download-btn">Download as .tex</button>
    </div>
  `;

  // Add to panel
  const conversionStep = document.getElementById('step-convert');
  conversionStep.appendChild(resultsDiv);

  // Store conversion result
  chrome.storage.local.set({ convertedLatex: convertedLatex });

  // Set up event listeners
  document.getElementById('preview-btn').addEventListener('click', () => {
    // Show preview in modal
    showPreview(convertedLatex);
  });

  document.getElementById('replace-btn').addEventListener('click', () => {
    // Replace current editor content
    replaceEditorContent(convertedLatex);
  });

  document.getElementById('new-project-btn').addEventListener('click', () => {
    // Create new Overleaf project
    alert("Feature Placeholder: This would ideally create a new Overleaf project with your converted CV. Opening Overleaf projects page instead.");
    window.open('https://www.overleaf.com/project', '_blank');
  });

  document.getElementById('download-btn').addEventListener('click', () => {
    // Download as .tex file
    downloadLatex(convertedLatex, "converted_cv.tex");
  });
}

// Show preview of converted LaTeX
function showPreview(latexCode) {
   // Remove existing modal first
   const existingModal = document.querySelector('.cv-converter-modal');
   if (existingModal) {
       existingModal.remove();
   }

  // Create modal for preview
  const modal = document.createElement('div');
  modal.className = 'cv-converter-modal';
  modal.innerHTML = `
    <div class="cv-converter-modal-content">
      <div class="cv-converter-modal-header">
        <h3>Preview Converted CV</h3>
        <button class="modal-close">×</button>
      </div>
      <div class="cv-converter-modal-body">
        <pre>${escapeHtml(latexCode)}</pre>
      </div>
    </div>
  `;

  // Add to page
  document.body.appendChild(modal);

  // Close button functionality
  modal.querySelector('.modal-close').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Optional: Close modal if clicked outside the content
  modal.addEventListener('click', (event) => {
      if (event.target === modal) {
          document.body.removeChild(modal);
      }
  });
}

// Replace editor content with converted LaTeX
function replaceEditorContent(latexCode) {
  // IMPORTANT: Directly manipulating CodeMirror 6 state is complex from a content script.
  // This often requires accessing the view instance which might not be straightforwardly exposed.
  // A common (but less robust) approach is to simulate user input.
  // A more robust solution might involve dedicated browser extension APIs for editors if available,
  // or more complex injection techniques.

  alert("Placeholder: Replacing editor content directly is complex. For now, please copy the content from the preview or download and paste it manually.");

  // --- Advanced Placeholder (Potentially Unreliable) ---
  // const editorView = document.querySelector('.cm-editor');
  // if (editorView && editorView.cmView) { // Check if CodeMirror view instance is accessible
  //   const view = editorView.cmView;
  //   view.dispatch({
  //     changes: {from: 0, to: view.state.doc.length, insert: latexCode}
  //   });
  //   console.log("Attempted to replace editor content via CodeMirror API.");
  // } else {
  //   console.error("Could not access CodeMirror view instance to replace content.");
  // }
  // --- End Advanced Placeholder ---
}


// Download converted LaTeX as a file
function downloadLatex(latexCode, filename) {
  const blob = new Blob([latexCode], { type: 'application/vnd.tex' }); // More specific MIME type
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // Append to body to ensure click works in all browsers
  a.click();
  document.body.removeChild(a); // Clean up

  URL.revokeObjectURL(url);
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Set up event listeners for communication
function setupCommunication() {
  // Listen for extraction request from popup/background
  // This event needs to be dispatched from background/popup script
  document.addEventListener('CV_EXTRACT_REQUESTED', (event) => {
      console.log('CV_EXTRACT_REQUESTED event received by content script.'); // Debug log
      extractCV(); // Call the extraction function directly
  });

  // Listen for messages from the popup or background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("Message received in content script:", request); // Debug log
      if (request.action === "applyConversion") {
          chrome.storage.local.get(['convertedLatex'], (result) => {
              if (result.convertedLatex) {
                  // Instead of directly replacing, maybe show preview first or confirm
                  // replaceEditorContent(result.convertedLatex);
                  alert("To apply the conversion, please copy the content from the preview or download the .tex file and paste it into your document.");
                  sendResponse({success: true, message: "User advised to manually apply."});
              } else {
                  console.error("No converted LaTeX found to apply.");
                  sendResponse({success: false, error: "No converted LaTeX found"});
              }
          });
          return true; // Indicates async response
      }
      // Handle other messages if necessary
  });
}


// Initialize the extension once page is loaded
window.addEventListener('load', async () => {
  console.log('CV Template Converter content script loaded');
  // Don't block execution if editor isn't found immediately, maybe it loads later
  try {
       const editorElement = await waitForEditor(); // Wait for editor
       console.log("Editor wait finished.");
  } catch (error) {
      console.error("Failed to find editor on initial load:", error);
      // Maybe add a button to retry finding the editor?
  }
  addExtensionUI(); // Add UI elements regardless
  setupCommunication(); // Setup message listeners and event listeners
});