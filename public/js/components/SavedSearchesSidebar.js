import { state } from '../app.js';
import { showSuccessToast, showErrorToast } from './Toast.js';
import { updateResults } from '../pages/ResultsPage.js';
import { updateAccessTokens } from './FormHandler.js';
import { updateFilteredView } from './FilteredModal.js';

async function saveCurrentSearch() {
    // First check if we have current data to save
    if (!state.currentAdsData || !Array.isArray(state.currentAdsData)) {
        showErrorToast('No search data to save');
        return;
    }

    const searchName = prompt('Enter a name for this search:');
    if (!searchName) return;

    try {
        // Get the original fetch timestamp
        const fetchTimestamp = localStorage.getItem('currentFetchTimestamp');
        if (!fetchTimestamp) {
            throw new Error('No fetch timestamp found');
        }

        // Check for existing search
        const response = await fetch('/api/saved-searches');
        if (!response.ok) throw new Error('Failed to fetch saved searches');
        
        const searches = await response.json();
        const existingSearch = searches.find(search => search.name === searchName);

        if (existingSearch) {
            if (!confirm(`A search with name "${searchName}" already exists. Do you want to override it?`)) {
                return;
            }
            await deleteSavedSearch(existingSearch.id, false);
        }

        // Get permanent filter data
        const permFilterResponse = await fetch('/api/perma-filter');
        if (!permFilterResponse.ok) throw new Error('Failed to fetch permanent filter data');
        const permFilterData = await permFilterResponse.json();

        // Collect form data only from elements that exist
        const formElements = {
            search_terms: document.getElementById('search_terms'),
            ad_active_status: document.getElementById('ad_active_status'),
            ad_delivery_date_min: document.getElementById('ad_delivery_date_min'),
            ad_reached_countries: document.getElementById('ad_reached_countries'),
            fields: document.getElementById('fields')
        };

        // Create parameters object with safe checks
        const parameters = {};
        for (const [key, element] of Object.entries(formElements)) {
            if (element) {
                parameters[key] = element.value;
            }
        }

        const searchData = {
            name: searchName,
            fetchTimestamp: fetchTimestamp,
            saveTimestamp: new Date().toISOString(),
            parameters,
            results: state.currentAdsData,
            filtered: {
                pages: Array.from(state.filteredPages || new Set()),
                ads: Array.from(state.filteredAds || new Set())
            },
            permFiltered: {
                pages: permFilterData.pages || []
            }
        };

        const saveResponse = await fetch('/api/save-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchData)
        });

        if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            throw new Error(errorData.message || 'Failed to save search');
        }

        // Update UI elements
        const searchNameDisplay = document.getElementById('currentSearchName');
        const timestampDisplay = document.getElementById('searchTimestamp');
        
        if (searchNameDisplay) {
            searchNameDisplay.textContent = searchName;
        }
        
        if (timestampDisplay) {
            const displayDate = new Date(fetchTimestamp).toLocaleString();
            timestampDisplay.textContent = `Fetch Time: ${displayDate}`;
        }

        showSuccessToast('Search saved successfully');
        
        // Refresh the saved searches list
        const searchesList = document.getElementById('searchesList');
        if (searchesList) {
            await loadSavedSearchesList();
        }

    } catch (error) {
        console.error('Error saving search:', error);
        showErrorToast(`Failed to save search: ${error.message}`);
    }
}

function toggleSavedSearches() {
    const sidebar = document.querySelector('.saved-searches-sidebar');
    if (!sidebar) {
        console.error('Saved searches sidebar not found');
        return;
    }

    const closeButton = sidebar.querySelector('.close-btn');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            state.savedSearchesSidebarVisible = false;
            sidebar.classList.remove('visible');
        });
    }

    state.savedSearchesSidebarVisible = !state.savedSearchesSidebarVisible;
    
    if (state.savedSearchesSidebarVisible) {
        sidebar.classList.add('visible');
        loadSavedSearchesList().catch(error => {
            console.error('Error loading saved searches:', error);
            showErrorToast('Failed to load saved searches');
        });
    } else {
        sidebar.classList.remove('visible');
    }
}

async function loadSavedSearch(searchId) {
    try {
        toggleSavedSearches();

        // Get current token from server
        const tokenResponse = await fetch('/api/current-token');
        if (!tokenResponse.ok) {
            throw new Error('Failed to fetch current token');
        }
        const { token: currentToken } = await tokenResponse.json();

        // Ensure searchId includes 'search_' prefix if it doesn't already
        const fullSearchId = searchId.startsWith('search_') ? searchId : `search_${searchId}`;
        
        // Add .json extension if not present
        const searchIdWithExt = fullSearchId.endsWith('.json') ? fullSearchId : `${fullSearchId}.json`;

        const response = await fetch(`/api/saved-searches/${searchIdWithExt}`);
        if (!response.ok) {
            throw new Error('Failed to load search');
        }

        const searchData = await response.json();
        if (!validateSearchData(searchData)) {
            throw new Error('Invalid search data format');
        }

        // Update URLs with current token in search results
        if (Array.isArray(searchData.results)) {
            searchData.results = searchData.results.map(ad => {
                if (ad.ad_snapshot_url) {
                    const url = new URL(ad.ad_snapshot_url);
                    url.searchParams.set('access_token', currentToken);
                    return { ...ad, ad_snapshot_url: url.toString() };
                }
                return ad;
            });
        }

        const formFields = {
            'search_terms': searchData.parameters?.search_terms || '',
            'ad_active_status': searchData.parameters?.ad_active_status || '',
            'ad_delivery_date_min': searchData.parameters?.ad_delivery_date_min || '',
            'ad_reached_countries': searchData.parameters?.ad_reached_countries || '',
            'fields': searchData.parameters?.fields || ''
        };

        Object.entries(formFields).forEach(([fieldId, value]) => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.value = value;
            } else {
                console.warn(`Element not found: ${fieldId}`);
            }
        });

        if (Array.isArray(searchData.results)) {
            state.currentAdsData = searchData.results;
            await updateResults(searchData.results);
        } else {
            throw new Error('Results data is not an array');
        }

        // Update localStorage
        localStorage.setItem('currentSearchName', searchData.name);
        localStorage.setItem('currentFetchTimestamp', searchData.fetchTimestamp);

        // Update UI displays
        const searchNameDisplay = document.getElementById('currentSearchName');
        const timestampDisplay = document.getElementById('searchTimestamp');
        
        if (searchNameDisplay) {
            searchNameDisplay.textContent = searchData.name;
        }
        
        if (timestampDisplay && searchData.fetchTimestamp) {
            const displayDate = new Date(searchData.fetchTimestamp).toLocaleString();
            timestampDisplay.textContent = `Fetch Time: ${displayDate}`;
        }

        showSuccessToast('Search loaded successfully');

    } catch (error) {
        console.error('Error loading saved search:', error);
        showErrorToast(`Failed to load search: ${error.message}`);
    }
}

async function loadSavedSearchesList() {
    try {
        const response = await fetch('/api/saved-searches');
        const searches = await response.json();
        
        const searchesList = document.getElementById('searchesList');
        if (!searchesList) {
            console.error('Searches list container not found');
            return;
        }
        
        searchesList.innerHTML = '';
        
        // Sort by save timestamp
        searches.sort((a, b) => {
            const dateA = new Date(b.saveTimestamp || b.timestamp || 0);
            const dateB = new Date(a.saveTimestamp || a.timestamp || 0);
            return dateA - dateB;
        });
        
        searches.forEach(search => {
            // Get timestamps from the search data
            const fetchDate = search.fetchTimestamp ? 
                new Date(search.fetchTimestamp).toLocaleString() : 
                'No fetch date';
            const saveDate = search.saveTimestamp ? 
                new Date(search.saveTimestamp).toLocaleString() : 
                'No save date';

            const searchItem = document.createElement('div');
            searchItem.className = 'search-item';
            searchItem.innerHTML = `
                <div class="search-info">
                    <strong>${search.name || 'Unnamed Search'}</strong>
                    <small>Fetched: ${fetchDate}</small>
                    <small>Saved: ${saveDate}</small>
                </div>
                <div class="search-actions">
                    <button class="load-btn" data-id="${search.id}">
                        <i class="fas fa-download"></i> Load
                    </button>
                    <button class="delete-btn" data-id="${search.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            const loadBtn = searchItem.querySelector('.load-btn');
            const deleteBtn = searchItem.querySelector('.delete-btn');
            
            loadBtn.addEventListener('click', () => loadSavedSearch(search.id));
            deleteBtn.addEventListener('click', () => deleteSavedSearch(search.id));
            
            searchesList.appendChild(searchItem);
        });
        
    } catch (error) {
        console.error('Error loading saved searches:', error);
        showErrorToast('Failed to load saved searches');
    }
}

async function deleteSavedSearch(searchId, showConfirm = true) {
    if (showConfirm && !confirm('Are you sure you want to delete this saved search?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete search');
        }
        
        if (showConfirm) {
            showSuccessToast('Search deleted successfully');
            await loadSavedSearchesList();
        }
    } catch (error) {
        console.error('Error deleting search:', error);
        showErrorToast('Failed to delete search');
    }
}

function validateSearchData(data) {
    if (!data) {
        console.error('No data provided');
        return false;
    }
    if (!Array.isArray(data.results)) {
        console.error('Results is not an array:', data.results);
        return false;
    }
    if (data.results.length === 0) {
        console.error('Results array is empty');
        return false;
    }
    if (!data.parameters) {
        console.error('No parameters object found');
        return false;
    }
    return true;
}

// Add this to clear the name when starting a new search
export function clearCurrentSearchName() {
    localStorage.removeItem('currentSearchName');
    localStorage.removeItem('currentFetchTimestamp');
    
    const searchNameDisplay = document.getElementById('currentSearchName');
    const timestampDisplay = document.getElementById('searchTimestamp');
    
    if (searchNameDisplay) {
        searchNameDisplay.textContent = 'To Save';
    }
    
    if (timestampDisplay) {
        timestampDisplay.textContent = '';
    }
}

export {
    saveCurrentSearch,
    toggleSavedSearches,
    loadSavedSearch,
    deleteSavedSearch,
    loadSavedSearchesList
};