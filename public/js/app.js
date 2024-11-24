// Global State Management
export const state = {
    currentAdsData: [],
    adsTable: null,
    filteredPages: new Set(),
    filteredAds: new Set(),
    savedSearchesSidebarVisible: false,
    isLoadingVideos: false
};

// Import modular components with correct paths
import { initializeForm, handleFormSubmit } from './components/FormHandler.js';
import { 
    initializeDataTable, 
    updateResults, 
    clearCurrentSearchName,
    clearSavedSearchesCache,
    fetchSavedSearches
} from './pages/ResultsPage/ResultsPage.js';
import { VideoHandler } from './pages/ResultsPage/components/video/VideoHandler.js';
import { FilterHandler } from './pages/ResultsPage/components/filter/FilterHandler.js';
import { StatsModal } from './pages/ResultsPage/components/stats/StatsModal.js';
import { showToast, showSuccessToast, showErrorToast } from './components/Toast.js';
import { 
    updateFilteredView,
    openFilteredView,
    closeFilteredView
} from './pages/ResultsPage/components/filter/FilteredModal.js';
import {
    toggleSavedSearches,
    loadSavedSearch,
    saveCurrentSearch,
    deleteSavedSearch
} from './components/SavedSearchesSidebar.js';
import {
    openPermFilteredView,
    closePermFilteredView,
    unPermFilterPage
} from './pages/ResultsPage/components/filter/PermFilteredModal.js';

// Initialize StatsModal
const statsModal = new StatsModal();

// Extract methods from VideoHandler
const { loadVideo, loadAllVideos, downloadCSV } = VideoHandler;

// Extract methods from FilterHandler
const { filterAd, filterPage, unfilterAd, unfilterPage, addToPermaFilter } = FilterHandler;

// Application Initialization
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initializeDataTable();
    
    // Add click handlers for buttons
    document.querySelector('.load-all-videos-btn')?.addEventListener('click', loadAllVideos);
    document.querySelector('.download-csv-btn')?.addEventListener('click', downloadCSV);
    document.querySelector('.filtered-view-btn')?.addEventListener('click', openFilteredView);
    document.querySelector('.view-saved-btn')?.addEventListener('click', toggleSavedSearches);

    // Stats cell click handler
    $('#resultsTable').on('click', '.stats-cell', function() {
        const rowData = state.adsTable.row($(this).closest('tr')).data();
        statsModal.showStats(rowData.id);
    });

    // Hide sidebar on initial load
    const sidebar = document.querySelector('.saved-searches-sidebar');
    if (sidebar) {
        sidebar.classList.remove('visible');
    }
});

// Export all necessary functions and objects
export {
    handleFormSubmit,
    updateResults,
    showToast,
    showSuccessToast,
    showErrorToast,
    filterAd,
    filterPage,
    unfilterAd,
    unfilterPage,
    addToPermaFilter,
    toggleSavedSearches,
    loadSavedSearch,
    saveCurrentSearch,
    deleteSavedSearch,
    loadVideo,
    loadAllVideos,
    downloadCSV,
    openFilteredView,
    closeFilteredView,
    openPermFilteredView,
    closePermFilteredView,
    unPermFilterPage,
    clearCurrentSearchName,
    statsModal,
    fetchSavedSearches,
    FilterHandler
};