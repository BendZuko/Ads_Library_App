import { state } from '../app.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';

// Filtering Functions
export function filterAd(adId) {
    state.filteredAds.add(adId);
    
    // Remove the row using DataTables API
    state.adsTable.rows((idx, data) => data.id === adId)
        .remove()
        .draw();
    
    updateFilteredView(false);
}

export function filterPage(pageName) {
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
}

export function unfilterAd(adId) {
    if (state.filteredAds.has(adId)) {
        state.filteredAds.delete(adId);
        const adData = state.currentAdsData.find(ad => ad.id === adId);
        if (adData) {
            state.adsTable.row.add({
                ad_creation_time: adData.ad_creation_time,
                page_name: adData.page_name,
                eu_total_reach: adData.eu_total_reach,
                ad_snapshot_url: adData.ad_snapshot_url,
                id: adData.id
            }).draw();
        }
        updateFilteredView();
    }
}

export function unfilterPage(pageName) {
    if (state.filteredPages.has(pageName)) {
        state.filteredPages.delete(pageName);
        state.currentAdsData.forEach(ad => {
            if (ad.page_name === pageName && state.filteredAds.has(ad.id)) {
                state.filteredAds.delete(ad.id);
                state.adsTable.row.add({
                    ad_creation_time: ad.ad_creation_time,
                    page_name: ad.page_name,
                    eu_total_reach: ad.eu_total_reach,
                    ad_snapshot_url: ad.ad_snapshot_url,
                    id: ad.id
                });
            }
        });
        state.adsTable.draw();
        updateFilteredView();
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

    // Update filtered pages
    filteredPagesDiv.innerHTML = Array.from(state.filteredPages).map(pageName => `
        <div class="filtered-item">
            <div class="filtered-info">
                <span>${escapeHtml(pageName)}</span>
            </div>
            <button onclick="unfilterPage('${escapeHtml(pageName)}')" class="unfilter-btn">
                <i class="fas fa-times"></i> Unfilter
            </button>
        </div>
    `).join('');

    // Update filtered ads
    filteredAdsDiv.innerHTML = Array.from(state.filteredAds).map(adId => {
        const ad = state.currentAdsData.find(a => a.id === adId);
        if (!ad) return '';
        return `
            <div class="filtered-item">
                <div class="filtered-info">
                    <div>Date: ${formatDate(ad.ad_creation_time)}</div>
                    <div>Reach: ${ad.eu_total_reach || 0}</div>
                    <div>Page: ${escapeHtml(ad.page_name)}</div>
                </div>
                <button onclick="unfilterAd('${adId}')" class="unfilter-btn">
                    <i class="fas fa-times"></i> Unfilter
                </button>
            </div>
        `;
    }).join('');

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