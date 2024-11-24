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
