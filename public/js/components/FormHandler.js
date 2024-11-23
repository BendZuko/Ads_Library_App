import { state } from '../app.js';
import { showErrorToast, showSuccessToast } from './Toast.js';
import { updateResults } from '../pages/ResultsPage.js';

const COUNTRY_MAPPING = {
    'US': 'United States',
    'DE': 'Germany',
    'FR': 'France',
    'NL': 'Netherlands',
    'GB': 'United Kingdom',
    'SE': 'Sweden',
    'NO': 'Norway',
    'FI': 'Finland',
    'DK': 'Denmark',
    'IT': 'Italy',
    'ES': 'Spain',
    'KR': 'South Korea',
    'BR': 'Brazil',
    'AU': 'Australia',
    'MX': 'Mexico',
    'ID': 'Indonesia',
    'SA': 'Saudi Arabia',
    'TR': 'Turkey',
    'JP': 'Japan',
    'IN': 'India'
};

const LANGUAGE_MAPPING = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh': 'Chinese (Simplified)',
    'ar': 'Arabic',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'it': 'Italian',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'tr': 'Turkish'
};

export function initializeForm() {
    const form = document.getElementById('searchForm');
    
    // Remove any existing event listeners
    form.removeEventListener('submit', handleFormSubmit);
    
    // Add new event listener with explicit prevention of default behavior
    form.addEventListener('submit', async (event) => {
        event.preventDefault();  // Prevent form from submitting normally
        await handleFormSubmit();
    });
    
    loadSavedParameters();
}

export function loadSavedParameters() {
    const savedParams = {
        access_token: localStorage.getItem('fb_access_token'),
        search_terms: localStorage.getItem('fb_search_terms'),
        ad_active_status: localStorage.getItem('fb_ad_active_status'),
        ad_delivery_date_min: localStorage.getItem('fb_ad_delivery_date_min'),
        ad_reached_countries: localStorage.getItem('fb_ad_reached_countries'),
        ad_language: localStorage.getItem('fb_ad_language'),
        fields: localStorage.getItem('fb_fields')
    };

    Object.entries(savedParams).forEach(([key, value]) => {
        if (value) {
            const element = document.getElementById(key);
            if (element) {
                element.value = value;
            }
        }
    });
}

export function storeFetchTimestamp() {
    const fetchTimestamp = new Date().toISOString();
    localStorage.setItem('currentFetchTimestamp', fetchTimestamp);
    
    // Update both the search name and timestamp displays
    const searchNameDisplay = document.getElementById('currentSearchName');
    const timestampDisplay = document.getElementById('searchTimestamp');
    
    if (searchNameDisplay) {
        searchNameDisplay.textContent = 'To Save';
    }
    
    if (timestampDisplay) {
        const displayDate = new Date(fetchTimestamp).toLocaleString();
        timestampDisplay.textContent = `Fetch Time: ${displayDate}`;
    }
}

export async function handleFormSubmit(event) {
    // Remove the event parameter check since we're handling it in the listener
    showLoading();

    try {
        // Update loading message to show progress
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'loadingMessage';
        loadingMessage.style.textAlign = 'center';
        loadingMessage.style.marginTop = '10px';
        document.getElementById('loadingOverlay').appendChild(loadingMessage);

        storeFetchTimestamp();

        const formData = {
            search_terms: document.getElementById('search_terms').value || 'all',
            ad_active_status: document.getElementById('ad_active_status').value,
            ad_delivery_date_min: document.getElementById('ad_delivery_date_min').value,
            ad_reached_countries: document.getElementById('ad_reached_countries').value,
            ad_language: document.getElementById('ad_language').value,
            fields: document.getElementById('fields').value
        };

        const response = await fetch('/api/fetch-ads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || 'Failed to fetch ads');
        }

        console.log(`Successfully fetched ${data.data.length} ads`);
        
        state.currentAdsData = data.data;
        updateResults(state.currentAdsData);
        
        showSuccessToast(`Successfully fetched ${data.data.length} ads${data.hasMore ? ' (more available)' : ''}`);
    } catch (error) {
        showErrorToast(error.message);
        console.error('Error fetching ads:', error);
    } finally {
        hideLoading();
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.remove();
        }
    }
}

export async function updateAccessTokens() {
    const newToken = document.getElementById('newAccessToken').value;
    if (!newToken) {
        showErrorToast('Please enter a new access token');
        return;
    }

    try {
        const response = await fetch('/api/update-server-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newToken })
        });

        if (!response.ok) {
            throw new Error('Failed to update server token');
        }

        const tokenInput = document.getElementById('access_token');
        if (tokenInput) {
            tokenInput.value = newToken;
        }

        if (state.adsTable) {
            const rows = state.adsTable.rows().data();
            rows.each(function(rowData, index) {
                if (rowData.ad_snapshot_url) {
                    const url = new URL(rowData.ad_snapshot_url);
                    url.searchParams.set('access_token', newToken);
                    rowData.ad_snapshot_url = url.toString();
                    state.adsTable.row(index).data(rowData);
                }
            });
            
            state.adsTable.draw();
        }

        state.currentAdsData = state.currentAdsData.map(ad => {
            if (ad.ad_snapshot_url) {
                const url = new URL(ad.ad_snapshot_url);
                url.searchParams.set('access_token', newToken);
                return { ...ad, ad_snapshot_url: url.toString() };
            }
            return ad;
        });

        showSuccessToast('Access token updated successfully');
    } catch (error) {
        showErrorToast(error.message);
        console.error('Error updating token:', error);
    }
}

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}