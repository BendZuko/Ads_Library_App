import { state } from '../../../../app.js';
import { showErrorToast, showSuccessToast } from '../../../../components/Toast.js';
import { updateTableStats } from './FilteredModal.js';

export class FilterHandler {
    static async addToPermaFilter(pageName) {
        try {
            const response = await fetch('/api/perma-filter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pageName })
            });

            if (!response.ok) {
                throw new Error('Failed to add to permanent filter');
            }

            // Instead of refreshing the entire table, just remove matching rows
            const table = state.adsTable;
            if (table) {
                // Find and remove all rows matching the page name
                table.rows((idx, data) => data.page_name === pageName)
                    .remove()
                    .draw(false); // false prevents full redraw
            }

            showSuccessToast(`Added "${pageName}" to permanent filter`);

        } catch (error) {
            console.error('Error adding to permanent filter:', error);
            showErrorToast('Failed to add to permanent filter');
        }
    }

    static async applyFilters(ads) {
        try {
            // Fetch permanent filter list
            const response = await fetch('/api/perma-filter');
            const { pages: permanentlyFiltered } = await response.json();
            console.log('Permanently filtered pages:', permanentlyFiltered);

            // Filter out ads that should be hidden
            return ads.filter(ad => {
                if (permanentlyFiltered.includes(ad.page_name)) {
                    console.log(`Filtering out ad from ${ad.page_name} (permanently filtered)`);
                    return false;
                }
                if (state.filteredAds.has(ad.id)) {
                    console.log(`Filtering out ad ${ad.id} (filtered)`);
                    return false;
                }
                if (state.filteredPages.has(ad.page_name)) {
                    state.filteredAds.add(ad.id);
                    console.log(`Filtering out ad from ${ad.page_name} (page filtered)`);
                    return false;
                }
                return true;
            });
        } catch (error) {
            console.error('Error applying filters:', error);
            throw error;
        }
    }

    static filterAd(adId) {
        if (!state.filteredAds.has(adId)) {
            state.filteredAds.add(adId);
            
            // Remove the row using DataTables API
            state.adsTable.rows((idx, data) => data.id === adId)
                .remove()
                .draw();
            
            updateFilteredView(false);
            updateTableStats();
        }
    }

    static filterPage(pageName) {
        if (!state.filteredPages.has(pageName)) {
            state.filteredPages.add(pageName);
            
            // Find and filter all ads from this page
            state.adsTable.rows((idx, data) => {
                if (data.page_name === pageName) {
                    state.filteredAds.add(data.id);
                    return true;
                }
                return false;
            })
            .remove()
            .draw();
            
            updateFilteredView(false);
            updateTableStats();
        }
    }

    static unfilterAd(adId) {
        if (state.filteredAds.has(adId)) {
            state.filteredAds.delete(adId);
            
            // Check if this ad's page is filtered
            const adData = state.currentAdsData.find(ad => ad.id === adId);
            if (adData && !state.filteredPages.has(adData.page_name)) {
                const transformedData = FilterHandler.transformAdData(adData);
                state.adsTable.row.add(transformedData).draw();
            }
            
            updateFilteredView();
            updateTableStats();
        }
    }

    static unfilterPage(pageName) {
        if (state.filteredPages.has(pageName)) {
            state.filteredPages.delete(pageName);
            
            // Unfilter all ads from this page
            state.currentAdsData.forEach(ad => {
                if (ad.page_name === pageName && state.filteredAds.has(ad.id)) {
                    state.filteredAds.delete(ad.id);
                    const transformedData = FilterHandler.transformAdData(ad);
                    state.adsTable.row.add(transformedData);
                }
            });
            
            state.adsTable.draw();
            updateFilteredView();
            updateTableStats();
        }
    }

    static transformAdData(ad) {
        return {
            ad_creation_time: ad.ad_creation_time,
            page_name: ad.page_name,
            eu_total_reach: ad.eu_total_reach,
            ad_snapshot_url: ad.ad_snapshot_url,
            id: ad.id
        };
    }
}