import { state } from '../../app.js';
import { TableInitializer } from './components/table/TableInitializer.js';
import { VideoHandler } from './components/video/VideoHandler.js';
import { loadVideo, loadAllVideos, downloadCSV } from './components/video/VideoHandler.js';
import { StatsHandler } from './components/stats/StatsHandler.js';
import { FilterHandler } from './components/filter/FilterHandler.js';
import { showToast } from '../../components/Toast.js';
import { fetchSavedSearches, clearSavedSearchesCache } from '../../utils/api.js';

let savedSearchesCache = null;

export function initializeDataTable() {
    // Wait for DOM to be ready
    if (!document.getElementById('resultsTable')) {
        console.error('Results table element not found');
        return null;
    }

    try {
        // Initialize DataTable
        return TableInitializer.initialize();
    } catch (error) {
        console.error('Error in initializeDataTable:', error);
        return null;
    }
}

export async function updateResults(ads) {
    console.log('Updating results with ads:', ads);
    
    const resultsContainer = document.getElementById('results');
    if (!resultsContainer) {
        console.error('Results container not found');
        return;
    }
    resultsContainer.style.display = 'block';

    if (state.adsTable) {
        state.adsTable.destroy();
        state.adsTable = null;
    }

    state.currentAdsData = ads;
    
    try {
        state.adsTable = safeInitializeDataTable();
        if (!state.adsTable) {
            throw new Error('Failed to initialize DataTable');
        }
        
        state.adsTable.clear();
        
        const fetchTimestamp = localStorage.getItem('currentFetchTimestamp');
        
        const transformedData = ads.map(ad => ({
            search_timestamp: fetchTimestamp || new Date().toISOString(),
            ad_creation_time: ad.ad_creation_time || '',
            page_name: ad.page_name || '',
            eu_total_reach: ad.eu_total_reach || 0,
            ad_snapshot_url: ad.ad_snapshot_url || '',
            id: ad.id || ''
        }));
        
        state.adsTable.rows.add(transformedData).draw();
        
        console.log('Table updated');
        
        // Update the current search name display
        const searchNameDisplay = document.getElementById('currentSearchName');
        if (searchNameDisplay) {
            const savedSearchName = localStorage.getItem('currentSearchName');
            searchNameDisplay.textContent = savedSearchName || 'To Save';
        }

    } catch (error) {
        console.error('Error updating results:', error);
        showToast('Error updating results', 'error');
    }
}

function safeInitializeDataTable() {
    if ($.fn.DataTable.isDataTable('#resultsTable')) {
        $('#resultsTable').DataTable().destroy();
    }
    return initializeDataTable();
}

function clearCurrentSearchName() {
    localStorage.removeItem('currentSearchName');
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
    loadAllVideos,
    loadVideo,
    downloadCSV,
    safeInitializeDataTable,
    fetchSavedSearches,
    clearSavedSearchesCache,
    clearCurrentSearchName,
    VideoHandler,
    FilterHandler
};