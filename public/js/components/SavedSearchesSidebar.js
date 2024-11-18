import { state } from '../app.js';
import { showSuccessToast, showErrorToast } from './Toast.js';
import { updateResults } from '../pages/ResultsPage.js';
import { updateAccessTokens } from './FormHandler.js';
import { updateFilteredView } from './FilteredModal.js';

async function saveCurrentSearch() {
    const searchName = prompt('Enter a name for this search:');
    if (!searchName) return;

    try {
        const response = await fetch('/api/saved-searches');
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
        const permFilterData = await permFilterResponse.json();

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

        if (!saveResponse.ok) throw new Error('Failed to save search');
        showSuccessToast('Search saved successfully');
        await loadSavedSearchesList();
    } catch (error) {
        showErrorToast('Failed to save search');
        console.error('Error saving search:', error);
    }
}

function toggleSavedSearches() {
    const sidebar = document.querySelector('.saved-searches-sidebar');
    if (!sidebar) {
        console.error('Saved searches sidebar not found');
        return;
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

        const response = await fetch(`/api/saved-searches/${searchId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const searchData = await response.json();
        console.log('Loaded search data:', searchData);
        
        if (!validateSearchData(searchData)) {
            console.error('Invalid search data structure:', searchData);
            throw new Error('Invalid search data structure');
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
            'access_token': searchData.parameters?.access_token || '',
            'search_terms': searchData.parameters?.search_terms || '',
            'ad_active_status': searchData.parameters?.ad_active_status || '',
            'ad_delivery_date_min': searchData.parameters?.ad_delivery_date_min || '',
            'ad_reached_countries': searchData.parameters?.ad_reached_countries || '',
            'fields': searchData.parameters?.fields || ''
        };

        Object.entries(formFields).forEach(([fieldId, value]) => {
            if (fieldId === 'access_token') return;
            
            const element = document.getElementById(fieldId);
            if (element) {
                element.value = value;
            } else {
                console.warn(`Element not found: ${fieldId}`);
            }
        });

        if (formFields.access_token) {
            await updateAccessTokens();
        }

        if (Array.isArray(searchData.results)) {
            state.currentAdsData = searchData.results;
            
            if (state.adsTable) {
                state.adsTable.clear();
            }

            state.filteredPages = new Set(searchData.filtered?.pages || []);
            state.filteredAds = new Set(searchData.filtered?.ads || []);

            if (searchData.permFiltered?.pages) {
                for (const pageName of searchData.permFiltered.pages) {
                    try {
                        await fetch('/api/perma-filter', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pageName })
                        });
                    } catch (error) {
                        console.warn(`Failed to set permanent filter for ${pageName}:`, error);
                    }
                }
            }

            searchData.results.forEach(ad => {
                const isPermFiltered = searchData.permFiltered?.pages?.includes(ad.page_name);
                if (!state.filteredAds.has(ad.id) && 
                    !state.filteredPages.has(ad.page_name) &&
                    !isPermFiltered) {
                    state.adsTable.row.add({
                        ...ad,
                        search_timestamp: searchData.timestamp
                    });
                }
            });

            state.adsTable.draw();
            updateFilteredView();
            updateResults(searchData.results);
            
            showSuccessToast('Search loaded successfully with updated token');
        } else {
            throw new Error('Results data is not an array');
        }

        // Update the current search name
        localStorage.setItem('currentSearchName', searchData.name);
        const searchNameDisplay = document.getElementById('currentSearchName');
        if (searchNameDisplay) {
            searchNameDisplay.textContent = searchData.name;
        }

        // Store the timestamp for the loaded search
        localStorage.setItem('currentSearchTimestamp', searchData.timestamp);
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
        
        searches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        searches.forEach(search => {
            // Extract the timestamp from the filename
            const timestamp = search.id.split('_')[1]?.replace('.json', '');
            
            const searchItem = document.createElement('div');
            searchItem.className = 'search-item';
            searchItem.innerHTML = `
                <div class="search-info">
                    <strong>${search.name}</strong>
                    <small>${new Date(search.timestamp).toLocaleString()}</small>
                </div>
                <div class="search-actions">
                    <button class="load-btn" data-timestamp="${timestamp}">
                        <i class="fas fa-download"></i> Load
                    </button>
                    <button class="delete-btn" data-timestamp="${timestamp}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Add event listeners using the timestamp
            const loadBtn = searchItem.querySelector('.load-btn');
            loadBtn.addEventListener('click', () => {
                const timestamp = loadBtn.dataset.timestamp;
                if (timestamp) {
                    console.log('Loading search with timestamp:', timestamp);
                    loadSavedSearch(timestamp);
                }
            });
            
            const deleteBtn = searchItem.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => {
                const timestamp = deleteBtn.dataset.timestamp;
                if (timestamp) {
                    console.log('Deleting search with timestamp:', timestamp);
                    deleteSavedSearch(`search_${timestamp}.json`);
                }
            });
            
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
    const searchNameDisplay = document.getElementById('currentSearchName');
    if (searchNameDisplay) {
        searchNameDisplay.textContent = 'To Save';
    }
}

export {
    saveCurrentSearch,
    toggleSavedSearches,
    loadSavedSearch,
    deleteSavedSearch,
    loadSavedSearchesList
};