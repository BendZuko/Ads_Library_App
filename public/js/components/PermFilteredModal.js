import { state } from '../app.js';
import { showToast } from './Toast.js';
import { updateResults } from '../pages/ResultsPage.js';

export function updatePermFilteredView(showModal = false) {
    const permFilteredPagesDiv = document.getElementById('permFilteredPages');
    const searchInput = document.getElementById('permPageSearch');

    // Function to filter items based on search text
    const filterItems = (items, searchText) => {
        if (!searchText) return items;
        searchText = searchText.toLowerCase();
        return items.filter(item => 
            item.toLowerCase().includes(searchText)
        );
    };

    // Update filtered pages
    const updatePages = async (searchText = '') => {
        try {
            const response = await fetch('/api/perma-filter');
            const { pages } = await response.json();
            
            const filteredPagesList = filterItems(pages, searchText);
            
            permFilteredPagesDiv.innerHTML = filteredPagesList.map(pageName => `
                <div class="filtered-item">
                    <div class="filtered-info">
                        <span>${escapeHtml(pageName)}</span>
                    </div>
                    <button onclick="unPermFilterPage('${escapeHtml(pageName)}')" class="unfilter-btn">
                        <i class="fas fa-times"></i> Unfilter
                    </button>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error updating perm filtered view:', error);
            showToast('Error loading permanently filtered pages', 'error');
        }
    };

    // Initial update
    updatePages();

    // Add search event listener
    if (!searchInput.hasEventListener) {
        searchInput.addEventListener('input', (e) => {
            updatePages(e.target.value);
        });
        searchInput.hasEventListener = true;
    }
}

export function openPermFilteredView() {
    const modal = document.getElementById('permFilteredModal');
    modal.style.display = 'block';
    updatePermFilteredView(true);
}

export function closePermFilteredView() {
    const modal = document.getElementById('permFilteredModal');
    modal.style.display = 'none';
}

export async function unPermFilterPage(pageName) {
    try {
        const response = await fetch('/api/perma-filter/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pageName })
        });

        if (!response.ok) {
            throw new Error('Failed to remove from permanent filter');
        }

        showToast(`Removed "${pageName}" from permanent filter`, 'success');
        updatePermFilteredView();
        
        // Refresh the main results
        if (state.currentAdsData) {
            await updateResults(state.currentAdsData);
        }
    } catch (error) {
        console.error('Error removing from permanent filter:', error);
        showToast('Failed to remove from permanent filter', 'error');
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}