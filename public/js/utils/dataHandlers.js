import { state } from '../app.js';

let savedSearchesCache = null;

export async function fetchSavedSearches() {
    if (savedSearchesCache) return savedSearchesCache;
    
    try {
        const response = await fetch('/api/saved-searches');
        savedSearchesCache = await response.json();
        return savedSearchesCache;
    } catch (error) {
        console.error('Error fetching saved searches:', error);
        return [];
    }
}

export function clearSavedSearchesCache() {
    savedSearchesCache = null;
}

export function clearCurrentSearchName() {
    const searchNameInput = document.querySelector('#searchName');
    if (searchNameInput) {
        searchNameInput.value = '';
    }
}

// Function to download data as CSV
export function downloadCSV() {
    if (!state.currentAdsData || state.currentAdsData.length === 0) {
        console.warn('No data available to download');
        return;
    }

    // Define the fields to include in the CSV
    const fields = [
        'search_timestamp',
        'ad_creation_time',
        'page_name',
        'eu_total_reach',
        'ad_snapshot_url'
    ];

    // Create CSV header
    let csv = fields.join(',') + '\n';

    // Add data rows
    state.currentAdsData.forEach(ad => {
        const row = fields.map(field => {
            let value = ad[field] || '';
            // Handle dates
            if (field.includes('time') || field.includes('timestamp')) {
                value = value ? new Date(value).toLocaleDateString() : '';
            }
            // Escape commas and quotes
            value = String(value).replace(/"/g, '""');
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = `"${value}"`;
            }
            return value;
        });
        csv += row.join(',') + '\n';
    });

    // Create and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, 'ads_data.csv');
    } else {
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'ads_data.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
