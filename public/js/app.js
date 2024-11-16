// Global State Management
export const state = {
    currentAdsData: [],
    adsTable: null,
    filteredPages: new Set(),
    filteredAds: new Set(),
    savedSearchesSidebarVisible: false,
    isLoadingVideos: false
};

// Import modular components
import { initializeForm, handleFormSubmit } from './components/FormHandler.js';
import { initializeDataTable, updateResults, loadAllVideos, downloadCSV, loadVideo } from './pages/ResultsPage.js';
import { showToast, showSuccessToast, showErrorToast } from './components/Toast.js';
import { 
    filterAd, 
    filterPage, 
    unfilterAd, 
    unfilterPage,
    updateFilteredView,
    openFilteredView,
    closeFilteredView
} from './components/FilteredModal.js';
import {
    toggleSavedSearches,
    loadSavedSearch,
    saveCurrentSearch,
    deleteSavedSearch
} from './components/SavedSearchesSidebar.js';

// Application Initialization
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initializeDataTable();
    
    // Add click handlers for buttons
    document.querySelector('.load-all-videos-btn')?.addEventListener('click', loadAllVideos);
    document.querySelector('.download-csv-btn')?.addEventListener('click', downloadCSV);
    document.querySelector('.filtered-view-btn')?.addEventListener('click', openFilteredView);
    document.querySelector('.view-saved-btn')?.addEventListener('click', toggleSavedSearches);
});

// Export necessary functions for global usage
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
    toggleSavedSearches,
    loadSavedSearch,
    saveCurrentSearch,
    deleteSavedSearch,
    loadAllVideos,
    loadVideo,
    downloadCSV,
    openFilteredView,
    closeFilteredView
};