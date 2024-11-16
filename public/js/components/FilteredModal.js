import { state } from '../app.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';

// Add this function at the top level of the file
export function updateTableStats() {
    setTimeout(() => {
        const filteredAdsCount = state.filteredAds.size;
        const filteredPagesCount = state.filteredPages.size;
        const currentVisibleCount = state.adsTable ? state.adsTable.data().length : 0;
        
        const statsHtml = `
            <span>Visible: ${currentVisibleCount.toLocaleString()} ads</span>
            <span class="stats-divider">|</span>
            <span>Filtered: ${filteredAdsCount.toLocaleString()} ads</span>
            <span class="stats-divider">|</span>
            <span>Filtered Pages: ${filteredPagesCount}</span>
        `;

        // Update both top and bottom stats
        document.querySelector('.total-entries').innerHTML = statsHtml;
        document.querySelector('.total-entries-bottom').innerHTML = statsHtml;
    }, 50);
}

// Filtering Functions
export function filterAd(adId) {
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

export function filterPage(pageName) {
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

export function unfilterAd(adId) {
    if (state.filteredAds.has(adId)) {
        state.filteredAds.delete(adId);
        
        // Check if this ad's page is filtered
        const adData = state.currentAdsData.find(ad => ad.id === adId);
        if (adData && !state.filteredPages.has(adData.page_name)) {
            // Transform the data to match DataTables format
            const transformedData = {
                ad_creation_time: adData.ad_creation_time,
                page_name: adData.page_name,
                eu_total_reach: adData.eu_total_reach,
                ad_snapshot_url: adData.ad_snapshot_url,
                id: adData.id
            };
            
            state.adsTable.row.add(transformedData).draw();
        }
        
        updateFilteredView();
        updateTableStats();
    }
}

export function unfilterPage(pageName) {
    if (state.filteredPages.has(pageName)) {
        state.filteredPages.delete(pageName);
        
        // Unfilter all ads from this page
        state.currentAdsData.forEach(ad => {
            if (ad.page_name === pageName && state.filteredAds.has(ad.id)) {
                state.filteredAds.delete(ad.id);
                // Transform the data to match DataTables format
                const transformedData = {
                    ad_creation_time: ad.ad_creation_time,
                    page_name: ad.page_name,
                    eu_total_reach: ad.eu_total_reach,
                    ad_snapshot_url: ad.ad_snapshot_url,
                    id: ad.id
                };
                
                state.adsTable.row.add(transformedData);
            }
        });
        
        state.adsTable.draw();
        updateFilteredView();
        updateTableStats();
    }
}

export function openFilteredView() {
    const modal = document.getElementById('filteredModal');
    modal.style.display = 'block';
    updateFilteredView(true);
}

export function updateFilteredView(showModal = false) {
    const filteredPagesDiv = document.getElementById('filteredPages');
    const filteredAdsDiv = document.getElementById('filteredAds');
    const searchInput = document.getElementById('pageSearch');
    
    // Function to filter items based on search text
    const filterItems = (items, searchText) => {
        if (!searchText) return items;
        searchText = searchText.toLowerCase();
        return items.filter(item => 
            item.toLowerCase().includes(searchText)
        );
    };

    // Update filtered pages
    const updatePages = (searchText = '') => {
        const filteredPagesList = filterItems(Array.from(state.filteredPages), searchText);
        filteredPagesDiv.innerHTML = filteredPagesList.map(pageName => `
            <div class="filtered-item">
                <div class="filtered-info">
                    <span>${escapeHtml(pageName)}</span>
                </div>
                <button onclick="unfilterPage('${escapeHtml(pageName)}')" class="unfilter-btn">
                    <i class="fas fa-times"></i> Unfilter
                </button>
            </div>
        `).join('');
    };

    // Update filtered ads
    const updateAds = (searchText = '') => {
        const filteredAdsList = Array.from(state.filteredAds)
            .map(adId => state.currentAdsData.find(a => a.id === adId))
            .filter(ad => ad && (!searchText || ad.page_name.toLowerCase().includes(searchText.toLowerCase())));

        filteredAdsDiv.innerHTML = filteredAdsList.map(ad => `
            <div class="filtered-item">
                <div class="filtered-info">
                    <div>Date: ${formatDate(ad.ad_creation_time)}</div>
                    <div>Reach: ${ad.eu_total_reach || 0}</div>
                    <div>Page: ${escapeHtml(ad.page_name)}</div>
                </div>
                <button onclick="unfilterAd('${ad.id}')" class="unfilter-btn">
                    <i class="fas fa-times"></i> Unfilter
                </button>
            </div>
        `).join('');
    };

    // Initial update
    updatePages();
    updateAds();

    // Add search event listener
    if (!searchInput.hasEventListener) {
        searchInput.addEventListener('input', (e) => {
            const searchText = e.target.value;
            updatePages(searchText);
            updateAds(searchText);
        });
        searchInput.hasEventListener = true;
    }

    if (showModal) {
        document.getElementById('filteredModal').style.display = 'block';
    }
}

export function closeFilteredView() {
    document.getElementById('filteredModal').style.display = 'none';
}

// Helper function to create table row from ad data
function createTableRow(ad) {
    return [
        ad.ad_creation_time,
        ad.page_name,
        ad.eu_total_reach,
        `<div class="video-container" id="video-${ad.id}">
            <button class="action-btn video-btn" onclick="loadVideo('${ad.ad_snapshot_url}', this)" data-url="${ad.ad_snapshot_url}">
                <i class="fas fa-play"></i> Load Video
            </button>
        </div>`,
        `<div class="table-actions">
            <a href="${ad.ad_snapshot_url}" target="_blank" class="action-btn view-btn">
                <i class="fas fa-external-link-alt"></i> View
            </a>
            <button onclick="filterAd('${ad.id}')" class="action-btn filter-btn">
                <i class="fas fa-filter"></i> Filter
            </button>
            <button onclick="filterPage('${ad.page_name}')" class="action-btn filter-page-btn">
                <i class="fas fa-filter"></i> Filter Page
            </button>
        </div>`
    ];
}