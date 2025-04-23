// Popup script for the CV Template Converter extension

document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup DOM loaded."); // Debug log
  // Initial state check
  checkCurrentPage();

  // Set up event listeners for template selection
  setupTemplateSelectors();

  // Set up custom template input
  document.getElementById('use-custom-template').addEventListener('click', () => {
    const templateUrlInput = document.getElementById('custom-template-url');
    const templateUrl = templateUrlInput.value.trim();
    if (templateUrl && (templateUrl.startsWith('http://') || templateUrl.startsWith('https://'))) {
      selectTemplate(templateUrl);
    } else {
      updateStatus('Please enter a valid HTTP/HTTPS template URL.', 'error');
      templateUrlInput.focus(); // Focus input for correction
    }
  });

  // Check storage on load
  updateUIBasedOnStorage();
});

// Update UI based on stored data (e.g., if CV was already extracted)
function updateUIBasedOnStorage() {
    chrome.storage.local.get(['cvLatexCode', 'selectedTemplateUrl'], (result) => {
        if (result.cvLatexCode) {
            console.log("Found existing CV data in storage."); // Debug log
            updateStatus('CV data previously extracted. Choose a template.', 'success');
            showTemplatesSection(); // Show templates if data exists
            // If a template was also selected, show convert button
             if (result.selectedTemplateUrl) {
                 highlightSelectedTemplate(result.selectedTemplateUrl);
                 selectTemplate(result.selectedTemplateUrl); // Re-select to show convert button
            } else {
                 // If only data exists, show extract button again in case user wants to re-extract
                 showExtractButton();
            }
        } else {
             console.log("No CV data found in storage on load."); // Debug log
            // If no data, proceed with normal page check
            // checkCurrentPage(); // Already called in DOMContentLoaded
        }
    });
}


// Check if we're on a valid Overleaf project page
function checkCurrentPage() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    // Handle cases where tabs might be undefined or empty
    if (!tabs || tabs.length === 0 || !tabs[0].url) {
      console.error("Could not get current tab URL.");
      updateStatus('Error accessing current tab.', 'error');
      return;
    }
    const currentUrl = tabs[0].url;
    const currentTabId = tabs[0].id;
    console.log("Current URL:", currentUrl); // Debug log

    if (currentUrl.includes('overleaf.com/project')) {
      // We're on an Overleaf project page
      console.log("On Overleaf project page. Checking for CV document..."); // Debug log
      checkForCVDocument(currentTabId);
    } else {
      // Not on Overleaf
      updateStatus('Please open an Overleaf project containing your CV.', 'error');
      showActionButton('Go to Overleaf', () => {
        chrome.tabs.create({ url: 'https://www.overleaf.com/project' }); // Go directly to projects
      });
      // Hide templates section if not on Overleaf
      document.getElementById('templates-section').classList.add('hidden');
    }
  });
}

// *** MODIFIED SCRIPT EXECUTION ***
// Check if the current document is likely a CV/resume
function checkForCVDocument(tabId) {
  console.log(`Executing script on tab ${tabId} to check for CV patterns.`); // Debug log
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    // This function runs in the content script's context (or isolated world)
    // It needs to replicate the logic to get content or call a content script function
    function: () => {
        // Replicate the core logic of getEditorContent here
        // This avoids complex cross-context function calls
        console.log("[Injected Script] Attempting to get editor content...");
        const editorView = document.querySelector('.cm-editor');
        let content = '';
        if (editorView) {
            console.log("[Injected Script] Found .cm-editor element.");
            const lines = editorView.querySelectorAll('.cm-line');
            if (lines && lines.length > 0) {
                lines.forEach(line => { content += line.textContent + '\n'; });
                content = content.trimEnd();
                console.log(`[Injected Script] Extracted ${content.length} chars via .cm-line.`);
            } else {
                 const contentElement = editorView.querySelector('.cm-content');
                 if (contentElement) {
                     content = contentElement.innerText;
                     console.log(`[Injected Script] Extracted ${content.length} chars via .cm-content.innerText.`);
                 } else {
                     console.warn("[Injected Script] No .cm-line or .cm-content found in .cm-editor.");
                 }
            }
        } else {
             // Iframe fallback (simplified)
             try {
                console.log("[Injected Script] Trying iframe fallback...");
                const editorIframe = document.querySelector('#editor-iframe');
                if (editorIframe && editorIframe.contentDocument) {
                    const editorContent = editorIframe.contentDocument.querySelector('.CodeMirror');
                    if (editorContent && editorContent.CodeMirror) {
                         content = editorContent.CodeMirror.getValue();
                         console.log(`[Injected Script] Extracted ${content.length} chars via iframe.`);
                    } else {
                        console.warn("[Injected Script] Found iframe but no CodeMirror instance.");
                    }
                } else {
                     console.warn("[Injected Script] No .cm-editor or #editor-iframe found.");
                }
             } catch (e) { console.error("[Injected Script] Error accessing iframe:", e); }
        }

        if (!content || content.trim() === '') {
            console.warn("[Injected Script] Editor content appears empty.");
            return { foundContent: false, isCV: false }; // Return object indicating failure
        }

        console.log("[Injected Script] Content retrieved, checking patterns...");
        // The CV check patterns (keep as is)
        const cvPatterns = [
            /\\documentclass\[[^\]]*?(?:(?:res|cv)\b|article|scrartcl)/i, // Broader documentclass check
            /\\(section|subsection)\*?\s*\{[^\}]*?(?:Education|Experience|Skills|Projects|Publications|Awards|Activities|References)[^\}]*\}/i,
            /\\(?:resume|cv)section/i, // Common commands in custom CV classes
            /\\begin\s*\{\s*(?:cv|resume| vingtquatreheurescv|res)[^\}]*?\s*\}/i // Common environments
        ];

        const isCV = cvPatterns.some(pattern => pattern.test(content));
        console.log(`[Injected Script] CV pattern check result: ${isCV}`);
        return { foundContent: true, isCV: isCV }; // Return structured result
    }
  }, (results) => {
    // Handle potential errors during script execution
    if (chrome.runtime.lastError) {
        console.error("Script execution failed:", chrome.runtime.lastError.message);
        updateStatus(`Error checking document: ${chrome.runtime.lastError.message}`, 'error');
        // Optionally hide templates and show a generic button
        document.getElementById('templates-section').classList.add('hidden');
        showActionButton('Retry Check', checkCurrentPage); // Allow user to retry
        return;
    }

    // Check results structure
    if (!results || !results[0] || typeof results[0].result === 'undefined') {
         console.error("Invalid script execution results:", results);
         updateStatus('Could not check document content.', 'error');
         document.getElementById('templates-section').classList.add('hidden');
         showActionButton('Retry Check', checkCurrentPage);
         return;
    }

    const { foundContent, isCV } = results[0].result;
    console.log(`Script execution result: foundContent=${foundContent}, isCV=${isCV}`); // Debug log

    if (!foundContent) {
        updateStatus('Could not read document content. Try reloading the page?', 'error');
        showActionButton('Retry Check', checkCurrentPage);
        document.getElementById('templates-section').classList.add('hidden');
    } else if (isCV) {
      // This appears to be a CV document
      updateStatus('CV document detected! Ready to extract data.', 'success');
      showExtractButton(); // Show button to explicitly extract
      showTemplatesSection(); // Show templates section
    } else {
      // Not clearly a CV document
      updateStatus("This doesn't appear to be a CV document. Extract data anyway?", 'warning');
      // Show extract button even if not detected as CV, letting user override
      showExtractButton();
      showTemplatesSection();
    }
  });
}


// Update status message
function updateStatus(message, type = 'info') {
  const statusText = document.getElementById('status-text');
  statusText.textContent = message;
  // Reset classes first
  statusText.className = 'status-message';
  statusText.classList.add('status-' + type); // Add specific type class
  console.log(`Status updated: [${type}] ${message}`); // Debug log
}

// Show a general action button
function showActionButton(text, clickHandler) {
  const actionsContainer = document.getElementById('actions-container');
  actionsContainer.innerHTML = ''; // Clear previous buttons

  const button = document.createElement('button');
  button.textContent = text;
  button.className = 'action-button';
  button.addEventListener('click', clickHandler);

  actionsContainer.appendChild(button);
}

// Show the extract CV button
function showExtractButton() {
    showActionButton('Extract CV Data', () => {
        updateStatus('Requesting CV data extraction from the page...', 'info');
        setLoadingState(true); // Show spinner

        // Send message to background script to trigger extraction in content script
        // OR directly trigger the content script if simpler
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
             if (tabs && tabs[0]) {
                // Dispatch event that content script listens for
                chrome.scripting.executeScript({
                    target: {tabId: tabs[0].id},
                    func: () => { document.dispatchEvent(new CustomEvent('CV_EXTRACT_REQUESTED')); }
                });

                // Add a timeout or listener for confirmation from content script
                // For simplicity, assume it starts and rely on content script status updates
                // We need a way for the content script to signal back success/failure to the popup
                // Using storage change listener:
                const listener = (changes, area) => {
                    if (area === 'local' && changes.cvLatexCode) {
                        console.log("Storage change detected for cvLatexCode."); // Debug log
                        setLoadingState(false);
                        if (changes.cvLatexCode.newValue && changes.cvLatexCode.newValue.trim() !== '') {
                             updateStatus('CV data extracted successfully!', 'success');
                             showTemplatesSection();
                             // Re-show extract button in case they want to re-extract
                             showExtractButton();
                        } else if (!changes.cvLatexCode.newValue) {
                            // This case might happen if extraction failed and cleared the storage
                            updateStatus('Extraction failed or cleared data.', 'error');
                            showExtractButton(); // Allow retry
                        }
                        chrome.storage.onChanged.removeListener(listener); // Clean up listener
                    }
                };
                chrome.storage.onChanged.addListener(listener);

                // Timeout fallback in case storage change doesn't fire or fails silently
                setTimeout(() => {
                    chrome.storage.onChanged.removeListener(listener); // Clean up listener
                     // Check storage manually after timeout if still loading
                     if (document.querySelector('.loading-spinner')) {
                         setLoadingState(false);
                         chrome.storage.local.get('cvLatexCode', (result) => {
                             if (result.cvLatexCode) {
                                 updateStatus('CV data extracted (timeout check).', 'success');
                                 showTemplatesSection();
                                 showExtractButton();
                             } else {
                                updateStatus('Extraction timed out or failed.', 'error');
                                showExtractButton();
                             }
                         });
                     }
                }, 5000); // 5 second timeout

             } else {
                 updateStatus('Cannot find active tab to trigger extraction.', 'error');
                 setLoadingState(false);
             }
        });
    });
}

function setLoadingState(isLoading) {
    const actionsContainer = document.getElementById('actions-container');
    if (isLoading) {
        actionsContainer.innerHTML = '<div class="loading-spinner"></div>';
    } else {
        // Don't clear if we intend to show buttons immediately after
        if (actionsContainer.querySelector('.loading-spinner')) {
            actionsContainer.innerHTML = ''; // Clear spinner
        }
    }
}

// Set up template selection cards
function setupTemplateSelectors() {
  const templateCards = document.querySelectorAll('.template-card');

  templateCards.forEach(card => {
    card.addEventListener('click', () => {
      // Get template URL from data attribute
      const templateUrl = card.getAttribute('data-template');
      selectTemplate(templateUrl);
      highlightSelectedTemplate(templateUrl);
    });
  });
}

function highlightSelectedTemplate(selectedUrl) {
    const templateCards = document.querySelectorAll('.template-card');
    templateCards.forEach(c => {
        if (c.getAttribute('data-template') === selectedUrl) {
             c.classList.add('selected');
        } else {
            c.classList.remove('selected');
        }
    });
     // Also update the custom URL input if a popular one is chosen
     if (selectedUrl && !document.getElementById('custom-template-url').value) {
         // Find the matching popular template and set the input value
         const popularSelect = document.querySelector(`.template-card[data-template="${selectedUrl}"]`);
         if (popularSelect) {
            // Maybe don't auto-fill custom input, just highlight card
         }
     }
}

// Show templates section
function showTemplatesSection() {
  const templatesSection = document.getElementById('templates-section');
  templatesSection.classList.remove('hidden');
  console.log("Templates section shown."); // Debug log
}

// Handle template selection
function selectTemplate(templateUrl) {
  updateStatus('Template selected. Ready to convert!', 'success');
  console.log("Template selected:", templateUrl); // Debug log

  // Store selected template
  chrome.storage.local.set({ selectedTemplateUrl: templateUrl });

  // Check if CV data exists before showing convert button
   chrome.storage.local.get(['cvLatexCode'], (result) => {
    if (!result.cvLatexCode) {
      updateStatus('Template selected, but CV data is missing. Please extract first.', 'warning');
      showExtractButton(); // Prompt extraction
    } else {
        // Show convert button
        showConvertButton(templateUrl);
    }
  });
}

// Show the convert button
function showConvertButton(templateUrl) {
    showActionButton('Convert CV to Selected Template', () => {
        convertCV(templateUrl);
    });
}


// Convert the CV
function convertCV(templateUrl) {
  updateStatus('Converting CV to new template...', 'info');
  setLoadingState(true); // Show loading spinner

  // Get the stored CV data
  chrome.storage.local.get(['cvLatexCode'], (result) => {
    if (!result.cvLatexCode || result.cvLatexCode.trim() === '') {
      updateStatus('No CV data found. Please extract first.', 'error');
      setLoadingState(false);
      showExtractButton();
      return;
    }

    console.log(`Popup sending processCV: template=${templateUrl}, latex length=${result.cvLatexCode.length}`); // Debug log
    // Send to background script for processing
    chrome.runtime.sendMessage({
      action: 'processCV',
      latexCode: result.cvLatexCode,
      templateUrl: templateUrl
    }, (response) => {
      setLoadingState(false); // Hide spinner
      if (chrome.runtime.lastError) {
          console.error("Error sending message to background:", chrome.runtime.lastError);
          updateStatus('Conversion failed: ' + chrome.runtime.lastError.message, 'error');
          showConvertButton(templateUrl); // Show try again button
          return;
      }

      if (!response) {
          console.error("No response from background script.");
          updateStatus('Conversion failed: No response received.', 'error');
           showConvertButton(templateUrl);
           return;
      }

      console.log("Response from background:", response); // Debug log
      if (response.error) {
        updateStatus('Conversion failed: ' + response.error, 'error');
        showConvertButton(templateUrl); // Show try again
      } else if (response.success && response.convertedLatex) {
        // Store the result for the content script to potentially use
        chrome.storage.local.set({ convertedLatex: response.convertedLatex });
        updateStatus('Conversion successful!', 'success');
        showCompletionButtons(); // Show apply/new project buttons
      } else {
          updateStatus('Conversion failed: Unexpected response format.', 'error');
          showConvertButton(templateUrl);
      }
    });
  });
}

// Show buttons after successful conversion
function showCompletionButtons() {
  const actionsContainer = document.getElementById('actions-container');
  actionsContainer.innerHTML = ''; // Clear previous

  // Create buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'multiple-actions';

  // Apply button
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Apply to Document (Manual)';
  applyButton.title = 'Shows instructions to manually apply the changes.'; // Tooltip
  applyButton.className = 'action-button primary';
  applyButton.addEventListener('click', () => {
    // Send message to content script to guide user or show preview
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'applyConversion' }, (response) => {
              if (chrome.runtime.lastError) {
                  console.warn("Could not communicate with content script to apply:", chrome.runtime.lastError.message);
                  alert("Could not connect to the page script. Please copy the converted code manually from the preview or download.");
              } else if (response && response.message) {
                  // alert(response.message); // Content script might show alert directly
              }
          });
      } else {
           alert("Cannot find active tab.");
      }
      // Don't close popup automatically, let user decide
      // window.close();
    });
  });

  // New project button (Placeholder Action)
  const newProjectButton = document.createElement('button');
  newProjectButton.textContent = 'Create New Project (Overleaf)';
  newProjectButton.className = 'action-button';
  newProjectButton.addEventListener('click', () => {
    // This should ideally use an Overleaf API if one existed and was permitted
    // For now, just opens the project page
    alert("Opening Overleaf projects page. You will need to manually create a new project and paste the converted code (available via Preview/Download).");
    chrome.tabs.create({
      url: 'https://www.overleaf.com/project'
    });
  });

   // Preview Button (using content script's preview)
  const previewButton = document.createElement('button');
  previewButton.textContent = 'Preview Converted Code';
  previewButton.className = 'action-button';
  previewButton.addEventListener('click', () => {
       chrome.storage.local.get(['convertedLatex'], (result) => {
           if (result.convertedLatex) {
                // Ask content script to show its modal
                 chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                     if (tabs && tabs[0]) {
                         chrome.scripting.executeScript({
                             target: {tabId: tabs[0].id},
                             func: (latex) => {
                                 // Check if showPreview exists globally (unlikely)
                                 // or dispatch an event for content script
                                 if (typeof showPreview === 'function') {
                                     showPreview(latex);
                                 } else {
                                     // Fallback: Alert or log
                                     console.log("Preview:\n", latex);
                                     alert("Preview:\n(See browser console for full code if alert truncates)");
                                 }
                             },
                             args: [result.convertedLatex]
                         });
                     }
                 });
           } else {
               alert("Could not find converted code to preview.");
           }
       });
  });

  // Download Button
  const downloadButton = document.createElement('button');
  downloadButton.textContent = 'Download .tex File';
  downloadButton.className = 'action-button';
  downloadButton.addEventListener('click', () => {
      chrome.storage.local.get(['convertedLatex'], (result) => {
          if (result.convertedLatex) {
               // Ask content script to trigger download
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                     if (tabs && tabs[0]) {
                         chrome.scripting.executeScript({
                             target: {tabId: tabs[0].id},
                             func: (latex, filename) => {
                                 if (typeof downloadLatex === 'function') {
                                     downloadLatex(latex, filename);
                                 } else {
                                     // Basic fallback
                                     const blob = new Blob([latex], { type: 'application/vnd.tex' });
                                     const url = URL.createObjectURL(blob);
                                     const a = document.createElement('a');
                                     a.href = url; a.download = filename; a.click();
                                     URL.revokeObjectURL(url);
                                 }
                             },
                             args: [result.convertedLatex, "converted_cv.tex"]
                         });
                     }
                 });
          } else {
              alert("Could not find converted code to download.");
          }
      });
  });

  // Add buttons to container
  buttonsContainer.appendChild(applyButton);
  buttonsContainer.appendChild(previewButton);
  buttonsContainer.appendChild(downloadButton);
  buttonsContainer.appendChild(newProjectButton);
  actionsContainer.appendChild(buttonsContainer);
}