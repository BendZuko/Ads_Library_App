// Global variables
let currentAdsData = [];
let adsTable;
let filteredPages = new Set();
let filteredAds = new Set();
let savedSearchesSidebarVisible = false;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initializeDataTable();
});

function initializeForm() {
    const form = document.getElementById('searchForm');
    form.addEventListener('submit', handleFormSubmit);
    
    // Load saved parameters
    loadSavedParameters();
}

function loadSavedParameters() {
    // Load each parameter from localStorage
    const savedParams = {
        access_token: localStorage.getItem('fb_access_token'),
        search_terms: localStorage.getItem('fb_search_terms'),
        ad_active_status: localStorage.getItem('fb_ad_active_status'),
        ad_delivery_date_min: localStorage.getItem('fb_ad_delivery_date_min'),
        ad_reached_countries: localStorage.getItem('fb_ad_reached_countries'),
        fields: localStorage.getItem('fb_fields')
    };

    // Set form values if they exist
    Object.entries(savedParams).forEach(([key, value]) => {
        if (value) {
            const element = document.getElementById(key);
            if (element) {
                element.value = value;
            }
        }
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    showLoading();

    try {
        const formData = {
            access_token: document.getElementById('access_token').value,
            search_terms: document.getElementById('search_terms').value || 'all',
            ad_active_status: document.getElementById('ad_active_status').value,
            ad_delivery_date_min: document.getElementById('ad_delivery_date_min').value,
            ad_reached_countries: document.getElementById('ad_reached_countries').value,
            fields: document.getElementById('fields').value
        };

        // Save parameters to localStorage
        Object.entries(formData).forEach(([key, value]) => {
            localStorage.setItem(`fb_${key}`, value);
        });

        const response = await fetch('/api/fetch-ads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || 'Failed to fetch ads');
        }

        currentAdsData = data.data || [];
        updateResults(currentAdsData);
        
        showSuccessToast('Successfully fetched ads data');
    } catch (error) {
        showErrorToast(error.message);
        console.error('Error fetching ads:', error);
    } finally {
        hideLoading();
    }
}

function updateResults(ads) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.style.display = 'block';

    if (adsTable) {
        adsTable.destroy();
    }

    const tableBody = document.querySelector('#adsTable tbody');
    tableBody.innerHTML = ads.map(ad => createTableRow(ad)).join('');

    initializeDataTable();
}

function createTableRow(ad) {
    return `
        <tr data-ad-id="${ad.id}">
            <td>${formatDate(ad.ad_creation_time)}</td>
            <td>${ad.eu_total_reach || 0}</td>
            <td>${escapeHtml(ad.page_name)}</td>
            <td>
                <button onclick="fetchVideo('${ad.ad_snapshot_url}', this)" class="action-btn video-btn">
                    <i class="fas fa-video"></i> Load Video
                </button>
            </td>
            <td>
                <a href="${ad.ad_snapshot_url}" target="_blank" class="action-btn view-btn">
                    <i class="fas fa-external-link-alt"></i> View
                </a>
            </td>
            <td class="filter-actions">
                <button onclick="filterAd('${ad.id}')" class="action-btn filter-btn">
                    <i class="fas fa-filter"></i> Filter
                </button>
                <button onclick="filterPage('${escapeHtml(ad.page_name)}')" class="action-btn filter-page-btn">
                    <i class="fas fa-building"></i> Filter Page
                </button>
            </td>
        </tr>
    `;
}

function initializeDataTable() {
    if (!adsTable) {
        adsTable = $('#resultsTable').DataTable({
            data: searchData.results,
            columns: [
                { 
                    data: 'ad_creation_time',
                    title: 'Creation Date',
                    width: '10%',
                    className: 'dt-center',
                    render: function(data) {
                        return new Date(data).toLocaleDateString();
                    }
                },
                { 
                    data: 'page_name',
                    title: 'Page Name',
                    width: '15%',
                    className: 'dt-center'
                },
                { 
                    data: 'eu_total_reach',
                    title: 'EU Total Reach',
                    width: '12%',
                    className: 'dt-body-right dt-head-center',
                    render: function(data) {
                        return data ? data.toLocaleString() : '0';
                    }
                },
                {
                    data: 'ad_snapshot_url',
                    title: 'Video',
                    width: '35%',
                    className: 'dt-center video-column',
                    render: function(data) {
                        return `
                            <button class="action-btn video-btn" onclick="loadVideo('${data}', this)">
                                <i class="fas fa-video"></i> Load Video
                            </button>
                            <div class="video-container" style="display:none;"></div>`;
                    }
                },
                { 
                    data: null,
                    title: 'Actions',
                    width: '25%',
                    className: 'dt-center',
                    render: function(data, type, row) {
                        return `
                            <div class="table-actions">
                                <button class="action-btn view-btn" onclick="window.open('${row.ad_snapshot_url}', '_blank')">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                <button class="action-btn filter-btn" onclick="filterAd('${row.id}')">
                                    <i class="fas fa-filter"></i> Filter
                                </button>
                                <button class="action-btn filter-page-btn" onclick="filterPage('${row.page_name}')">
                                    <i class="fas fa-building"></i> Filter Page
                                </button>
                            </div>`;
                    }
                }
            ],
            pageLength: 25,
            order: [[0, 'desc']],
            responsive: true,
            autoWidth: false,
            scrollX: true,
            dom: 'rt<"bottom"ip>'
        });
    }
    return adsTable;
}

// Utility Functions
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showErrorToast(message) {
    // Implement toast notification
    alert(message); // For now, using alert
}

function showSuccessToast(message) {
    // Implement toast notification
    alert(message); // For now, using alert
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Export functionality
function downloadCSV() {
    if (!currentAdsData.length) {
        showErrorToast('No data to export');
        return;
    }

    const headers = [
        'Creation Date',
        'Page Name',
        'Total Reach',
        'Ad URL',
        'Ad Content',
        'Page ID'
    ];

    let csvContent = headers.join(',') + '\n';

    csvContent += currentAdsData.map(ad => {
        return [
            ad.ad_creation_time,
            `"${(ad.page_name || '').replace(/"/g, '""')}"`,
            ad.eu_total_reach,
            ad.ad_snapshot_url,
            `"${(ad.ad_creative_bodies?.[0] || '').replace(/"/g, '""')}"`,
            ad.page_id
        ].join(',');
    }).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `fb_ads_export_${formatDate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Add this new function
async function loadAllVideos() {
    const videoButtons = document.querySelectorAll('button[onclick^="fetchVideo"]');
    let loadedCount = 0;
    
    showLoading();
    document.getElementById('loadingText').textContent = `Loading videos (0/${videoButtons.length})...`;
    
    for (const button of videoButtons) {
        try {
            // Extract URL from onclick attribute
            const url = button.getAttribute('onclick').match(/'([^']+)'/)[1];
            await fetchVideo(url, button);
            loadedCount++;
            document.getElementById('loadingText').textContent = 
                `Loading videos (${loadedCount}/${videoButtons.length})...`;
        } catch (error) {
            console.error('Error loading video:', error);
        }
    }
    
    hideLoading();
    showSuccessToast(`Loaded ${loadedCount} videos`);
}

// Update the updateAccessTokens function
async function updateAccessTokens() {
    const newToken = document.getElementById('newAccessToken').value;
    if (!newToken) {
        showErrorToast('Please enter a new access token');
        return;
    }

    // Update the access token in the main form
    document.getElementById('access_token').value = newToken;

    // Update all video URLs in the table
    if (adsTable) {
        const rows = adsTable.rows().data();
        rows.each(function(rowData, index) {
            // Update ad_snapshot_url with new token
            if (rowData.ad_snapshot_url) {
                const url = new URL(rowData.ad_snapshot_url);
                url.searchParams.set('access_token', newToken);
                rowData.ad_snapshot_url = url.toString();
                
                // Update the row data
                adsTable.row(index).data(rowData);
            }
        });
        
        // Redraw the table
        adsTable.draw();
    }

    // Update currentAdsData array
    currentAdsData = currentAdsData.map(ad => {
        if (ad.ad_snapshot_url) {
            const url = new URL(ad.ad_snapshot_url);
            url.searchParams.set('access_token', newToken);
            return { ...ad, ad_snapshot_url: url.toString() };
        }
        return ad;
    });

    showSuccessToast('Access token updated successfully');
}

function filterAd(adId) {
    filteredAds.add(adId);
    adsTable.row(`tr[data-ad-id="${adId}"]`).remove().draw();
    updateFilteredView();
}

function filterPage(pageName) {
    filteredPages.add(pageName);
    adsTable.rows().every(function() {
        const data = this.data();
        if (data[2] === pageName) { // Assuming page name is in the third column
            this.remove();
        }
    });
    adsTable.draw();
    updateFilteredView();
}

function openFilteredView() {
    const modal = document.getElementById('filteredModal');
    modal.style.display = 'block';
    updateFilteredView();
}

function updateFilteredView() {
    const filteredPagesDiv = document.getElementById('filteredPages');
    const filteredAdsDiv = document.getElementById('filteredAds');

    // Update filtered pages
    filteredPagesDiv.innerHTML = Array.from(filteredPages).map(pageName => `
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
    filteredAdsDiv.innerHTML = Array.from(filteredAds).map(adId => {
        const ad = currentAdsData.find(a => a.id === adId);
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
}

function unfilterAd(adId) {
    filteredAds.delete(adId);
    const ad = currentAdsData.find(a => a.id === adId);
    if (ad) {
        adsTable.row.add($(createTableRow(ad))).draw();
    }
    updateFilteredView();
}

function unfilterPage(pageName) {
    filteredPages.delete(pageName);
    currentAdsData.forEach(ad => {
        if (ad.page_name === pageName && !filteredAds.has(ad.id)) {
            adsTable.row.add($(createTableRow(ad)));
        }
    });
    adsTable.draw();
    updateFilteredView();
}

function closeFilteredView() {
    document.getElementById('filteredModal').style.display = 'none';
}

async function saveCurrentSearch() {
    const searchName = prompt('Enter a name for this search:');
    if (!searchName) return;

    const searchData = {
        name: searchName,
        timestamp: new Date().toISOString(),
        parameters: {
            access_token: document.getElementById('access_token').value,
            search_terms: document.getElementById('search_terms').value,
            ad_active_status: document.getElementById('ad_active_status').value,
            ad_delivery_date_min: document.getElementById('ad_delivery_date_min').value,
            ad_reached_countries: document.getElementById('ad_reached_countries').value,
            fields: document.getElementById('fields').value
        },
        results: currentAdsData,
        filtered: {
            pages: Array.from(filteredPages),
            ads: Array.from(filteredAds)
        }
    };

    try {
        const response = await fetch('/api/save-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchData)
        });

        if (!response.ok) throw new Error('Failed to save search');
        showSuccessToast('Search saved successfully');
    } catch (error) {
        showErrorToast('Failed to save search');
        console.error('Error saving search:', error);
    }
}

async function toggleSavedSearches() {
    const sidebar = document.getElementById('savedSearchesSidebar');
    savedSearchesSidebarVisible = !savedSearchesSidebarVisible;
    
    if (savedSearchesSidebarVisible) {
        sidebar.style.transform = 'translateX(0)';
        await loadSavedSearches();
    } else {
        sidebar.style.transform = 'translateX(100%)';
    }
}

async function loadSavedSearch(searchId) {
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`);
        const searchData = await response.json();
        currentAdsData = searchData.results;
        
        document.getElementById('results').style.display = 'block';
        
        if ($.fn.DataTable.isDataTable('#resultsTable')) {
            $('#resultsTable').DataTable().destroy();
        }
        
        adsTable = $('#resultsTable').DataTable({
            data: searchData.results,
            columns: [
                { 
                    data: 'ad_creation_time',
                    title: 'Creation Date',
                    width: '10%',
                    render: function(data) {
                        return new Date(data).toLocaleDateString();
                    }
                },
                { 
                    data: 'page_name',
                    title: 'Page Name',
                    width: '15%'
                },
                { 
                    data: 'eu_total_reach',
                    title: 'EU Total Reach',
                    width: '12%',
                    className: 'dt-body-right',
                    render: function(data) {
                        return data ? data.toLocaleString() : '0';
                    }
                },
                {
                    data: 'ad_snapshot_url',
                    title: 'Video',
                    width: '35%',
                    render: function(data) {
                        return `
                            <button class="action-btn video-btn" onclick="loadVideo('${data}', this)">
                                <i class="fas fa-video"></i> Load Video
                            </button>
                            <div class="video-container" style="display:none;"></div>`;
                    }
                },
                { 
                    data: null,
                    title: 'Actions',
                    width: '25%',
                    render: function(data, type, row) {
                        return `
                            <div class="table-actions">
                                <button class="action-btn view-btn" onclick="window.open('${row.ad_snapshot_url}', '_blank')">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                <button class="action-btn filter-btn" onclick="filterAd('${row.id}')">
                                    <i class="fas fa-filter"></i> Filter
                                </button>
                                <button class="action-btn filter-page-btn" onclick="filterPage('${row.page_name}')">
                                    <i class="fas fa-building"></i> Filter Page
                                </button>
                            </div>`;
                    }
                }
            ],
            pageLength: 25,
            order: [[0, 'desc']],
            responsive: true,
            autoWidth: false,
            scrollX: true,
            dom: 'rt<"bottom"ip>',  // Removes default buttons and search box
            language: {
                search: ''
            }
        });
        
        showSuccessToast('Search loaded successfully');
        
    } catch (error) {
        console.error('Error loading saved search:', error);
        showErrorToast('Failed to load search');
    }
}

// Update the loadVideo function
async function loadVideo(url, buttonElement) {
    try {
        const videoContainer = buttonElement.nextElementSibling;
        
        // If video is already loaded, just toggle visibility
        if (videoContainer.innerHTML !== '') {
            videoContainer.style.display = videoContainer.style.display === 'none' ? 'block' : 'none';
            return;
        }

        buttonElement.disabled = true;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

        // First fetch the video URL
        const response = await fetch('/api/fetch-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) throw new Error('Failed to fetch video URL');
        const { videoUrl } = await response.json();

        // Then download the video
        const downloadResponse = await fetch('/api/download-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_url: videoUrl })
        });

        if (!downloadResponse.ok) throw new Error('Failed to download video');
        const { video_url } = await downloadResponse.json();

        // Create and show video element
        videoContainer.innerHTML = `
            <video controls style="width: 100%; max-width: 400px;">
                <source src="${video_url}" type="video/mp4">
                Your browser does not support the video tag.
            </video>`;
        videoContainer.style.display = 'block';
        
        buttonElement.innerHTML = '<i class="fas fa-video"></i> Toggle Video';
        buttonElement.disabled = false;

    } catch (error) {
        console.error('Error loading video:', error);
        buttonElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed to load';
        buttonElement.disabled = false;
        showErrorToast('Failed to load video');
    }
}

// Add these filtering functions
function filterAd(adId) {
    const row = adsTable.row($(`#resultsTable tr[data-ad-id="${adId}"]`));
    if (row.length) {
        filteredAds.add(adId);
        row.remove().draw();
        updateFilteredView();
    }
}

function filterPage(pageName) {
    const rows = adsTable.rows().nodes().filter(row => {
        return $(row).find('td:nth-child(2)').text() === pageName;
    });
    
    if (rows.length) {
        filteredPages.add(pageName);
        adsTable.rows(rows).remove().draw();
        updateFilteredView();
    }
}

function updateFilteredView() {
    const filteredPagesContainer = document.getElementById('filteredPages');
    const filteredAdsContainer = document.getElementById('filteredAds');
    
    // Update filtered pages
    filteredPagesContainer.innerHTML = Array.from(filteredPages).map(pageName => `
        <div class="filtered-item">
            <div class="filtered-info">
                <strong>${pageName}</strong>
            </div>
            <button class="unfilter-btn" onclick="unfilterPage('${pageName}')">
                <i class="fas fa-undo"></i> Unfilter
            </button>
        </div>
    `).join('');
    
    // Update filtered ads
    filteredAdsContainer.innerHTML = Array.from(filteredAds).map(adId => {
        const ad = currentAdsData.find(ad => ad.id === adId);
        return `
            <div class="filtered-item">
                <div class="filtered-info">
                    <strong>Ad ID: ${adId}</strong>
                    <small>${ad.page_name}</small>
                </div>
                <button class="unfilter-btn" onclick="unfilterAd('${adId}')">
                    <i class="fas fa-undo"></i> Unfilter
                </button>
            </div>
        `;
    }).join('');
    
    // Show filtered modal if there are filtered items
    if (filteredPages.size > 0 || filteredAds.size > 0) {
        document.getElementById('filteredModal').style.display = 'block';
    }
}
// Add this helper function to check if data is properly loaded
function validateSearchData(data) {
    console.log('Validating search data:', {
        hasName: !!data.name,
        hasTimestamp: !!data.timestamp,
        resultsCount: data.results?.length || 0,
        firstResult: data.results?.[0]
    });
    
    return data && 
           Array.isArray(data.results) && 
           data.results.length > 0;
}

// Add this function to load the list of saved searches
async function loadSavedSearches() {
    try {
        const response = await fetch('/api/saved-searches');
        const searches = await response.json();
        
        const searchesList = document.getElementById('searchesList');
        if (!searchesList) {
            console.error('Searches list container not found');
            return;
        }
        
        // Clear existing list
        searchesList.innerHTML = '';
        
        // Sort searches by timestamp (newest first)
        searches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Create list items
        searches.forEach(search => {
            const searchItem = document.createElement('div');
            searchItem.className = 'search-item';
            searchItem.innerHTML = `
                <div class="search-info">
                    <strong>${search.name}</strong>
                    <small>${new Date(search.timestamp).toLocaleString()}</small>
                </div>
                <div class="search-actions">
                    <button onclick="loadSavedSearch('${search.id}')" class="load-btn">
                        <i class="fas fa-download"></i> Load
                    </button>
                    <button onclick="deleteSavedSearch('${search.id}')" class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            searchesList.appendChild(searchItem);
        });
        
    } catch (error) {
        console.error('Error loading saved searches:', error);
        showErrorToast('Failed to load saved searches');
    }
}

// Update the toggle function
function toggleSavedSearches() {
    const sidebar = document.querySelector('.saved-searches-sidebar');
    if (!sidebar) {
        console.error('Sidebar not found');
        return;
    }
    
    const isVisible = sidebar.style.transform === 'translateX(0px)';
    
    if (!isVisible) {
        // Load searches when opening
        loadSavedSearches();
    }
    
    sidebar.style.transform = isVisible ? 'translateX(100%)' : 'translateX(0)';
}

// Add delete function
async function deleteSavedSearch(searchId) {
    if (!confirm('Are you sure you want to delete this saved search?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete search');
        }
        
        showSuccessToast('Search deleted successfully');
        loadSavedSearches(); // Reload the list
        
    } catch (error) {
        console.error('Error deleting search:', error);
        showErrorToast('Failed to delete search');
    }
}

