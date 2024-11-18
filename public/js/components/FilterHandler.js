import { state } from '../app.js';

export function filterAd(adId) {
    if (!state.filteredAds) {
        state.filteredAds = new Set();
    }
    state.filteredAds.add(adId);
    document.dispatchEvent(new CustomEvent('filtersUpdated'));
}

export function filterPage(pageName) {
    if (!state.filteredPages) {
        state.filteredPages = new Set();
    }
    state.filteredPages.add(pageName);
    document.dispatchEvent(new CustomEvent('filtersUpdated'));
}

export function unfilterAd(adId) {
    if (state.filteredAds) {
        state.filteredAds.delete(adId);
        document.dispatchEvent(new CustomEvent('filtersUpdated'));
    }
}

export function unfilterPage(pageName) {
    if (state.filteredPages) {
        state.filteredPages.delete(pageName);
        document.dispatchEvent(new CustomEvent('filtersUpdated'));
    }
}