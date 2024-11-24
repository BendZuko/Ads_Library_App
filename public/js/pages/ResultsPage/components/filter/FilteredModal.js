import { state } from '../../../../app.js';

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

// Add this function at the top level of the file
export function updateTableStats() {
    setTimeout(() => {
        try {
            if (!state.adsTable) {
                console.log('DataTable not yet initialized');
                return;
            }

            const filteredAdsCount = state.filteredAds ? state.filteredAds.size : 0;
            const filteredPagesCount = state.filteredPages ? state.filteredPages.size : 0;
            const currentVisibleCount = state.adsTable.data().length;

            const statsHtml = `
                <span>Visible: ${currentVisibleCount.toLocaleString()} ads</span>
                <span class="stats-divider">|</span>
                <span>Filtered: ${filteredAdsCount.toLocaleString()} ads</span>
                <span class="stats-divider">|</span>
                <span>Filtered Pages: ${filteredPagesCount}</span>
            `;

            const topStats = document.querySelector('.total-entries');
            const bottomStats = document.querySelector('.total-entries-bottom');

            if (topStats) topStats.innerHTML = statsHtml;
            if (bottomStats) bottomStats.innerHTML = statsHtml;

        } catch (error) {
            console.error('Error updating table stats:', error);
        }
    }, 100);
}

export function filterAd(adId) {
    if (!state.filteredAds.has(adId)) {
        state.filteredAds.add(adId);
        
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
        
        const adData = state.currentAdsData.find(ad => ad.id === adId);
        if (adData && !state.filteredPages.has(adData.page_name)) {
            const transformedData = transformAdData(adData);
            state.adsTable.row.add(transformedData).draw();
        }
        
        updateFilteredView();
        updateTableStats();
    }
}

export function unfilterPage(pageName) {
    if (state.filteredPages.has(pageName)) {
        state.filteredPages.delete(pageName);
        
        state.currentAdsData.forEach(ad => {
            if (ad.page_name === pageName && state.filteredAds.has(ad.id)) {
                state.filteredAds.delete(ad.id);
                const transformedData = transformAdData(ad);
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
    
    const filterItems = (items, searchText) => {
        if (!searchText) return items;
        searchText = searchText.toLowerCase();
        return items.filter(item => 
            item.toLowerCase().includes(searchText)
        );
    };

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

    updatePages();
    updateAds();

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

function transformAdData(ad) {
    return {
        ad_creation_time: ad.ad_creation_time,
        page_name: ad.page_name,
        eu_total_reach: ad.eu_total_reach,
        ad_snapshot_url: ad.ad_snapshot_url,
        id: ad.id
    };
}