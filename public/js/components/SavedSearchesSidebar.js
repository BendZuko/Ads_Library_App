import { state } from '../app.js';
import { showSuccessToast, showErrorToast } from './Toast.js';
import { updateResults } from '../pages/ResultsPage.js';
import { updateAccessTokens } from './FormHandler.js';

export async function saveCurrentSearch() {
    const searchName = prompt('Enter a name for this search:');
    if (!searchName) return;

    const searchData = {
        name: searchName,
        timestamp: new Date().toISOString(),
        parameters: {
            access_token: document.getElementById('access_token').value,
            search_terms: document.getElementById('search_terms').value,
            ad_active_status: document.getElementById('ad_active_status').value,
            ad_delivery_date_min: document.getElementById('ad_delivery_date_min').value,
            ad_reached_countries: document.getElementById('ad_reached_countries').value,
            fields: document.getElementById('fields').value
        },
        results: state.currentAdsData,
        filtered: {
            pages: Array.from(state.filteredPages),
            ads: Array.from(state.filteredAds)
        }
    };

    try {
        const response = await fetch('/api/save-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchData)
        });

        if (!response.ok) throw new Error('Failed to save search');
        showSuccessToast('Search saved successfully');
        await loadSavedSearches();
    } catch (error) {
        showErrorToast('Failed to save search');
        console.error('Error saving search:', error);
    }
}

export function toggleSavedSearches() {
    const sidebar = document.querySelector('.saved-searches-sidebar');
    if (!sidebar) {
        console.error('Saved searches sidebar not found');
        return;
    }

    state.savedSearchesSidebarVisible = !state.savedSearchesSidebarVisible;
    sidebar.style.transform = state.savedSearchesSidebarVisible ? 'translateX(0)' : 'translateX(100%)';
    
    if (state.savedSearchesSidebarVisible) {
        loadSavedSearches();
    }
}

export async function loadSavedSearch(searchId) {
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`);
        const searchData = await response.json();

        if (!validateSearchData(searchData)) {
            throw new Error('Invalid search data');
        }

        // Update access token if present in the search data
        if (searchData.parameters && searchData.parameters.access_token) {
            document.getElementById('access_token').value = searchData.parameters.access_token;
            await updateAccessTokens();
        }

        state.currentAdsData = searchData.results;
        updateResults(searchData.results);
        showSuccessToast('Search loaded successfully');
        
    } catch (error) {
        console.error('Error loading saved search:', error);
        showErrorToast('Failed to load search');
    }
}

async function loadSavedSearches() {
    try {
        const response = await fetch('/api/saved-searches');
        const searches = await response.json();
        
        const searchesList = document.getElementById('searchesList');
        if (!searchesList) {
            console.error('Searches list container not found');
            return;
        }
        
        searchesList.innerHTML = '';
        
        searches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        searches.forEach(search => {
            const searchItem = document.createElement('div');
            searchItem.className = 'search-item';
            searchItem.innerHTML = `
                <div class="search-info">
                    <strong>${search.name}</strong>
                    <small>${new Date(search.timestamp).toLocaleString()}</small>
                </div>
                <div class="search-actions">
                    <button class="load-btn">
                        <i class="fas fa-download"></i> Load
                    </button>
                    <button class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            searchItem.querySelector('.load-btn').addEventListener('click', () => loadSavedSearch(search.id));
            searchItem.querySelector('.delete-btn').addEventListener('click', () => deleteSavedSearch(search.id));
            
            searchesList.appendChild(searchItem);
        });
        
    } catch (error) {
        console.error('Error loading saved searches:', error);
        showErrorToast('Failed to load saved searches');
    }
}

export async function deleteSavedSearch(searchId) {
    if (!confirm('Are you sure you want to delete this saved search?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete search');
        }
        
        showSuccessToast('Search deleted successfully');
        await loadSavedSearches();
        
    } catch (error) {
        console.error('Error deleting search:', error);
        showErrorToast('Failed to delete search');
    }
}

function validateSearchData(data) {
    return data && 
           Array.isArray(data.results) && 
           data.results.length > 0;
}

export {
};