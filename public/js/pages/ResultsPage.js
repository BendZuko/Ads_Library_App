import { state } from '../app.js';
import { showErrorToast, showSuccessToast, showWarningToast, showToast } from '../components/Toast.js';
import { updateTableStats } from '../components/FilteredModal.js';

let isLoadingVideos = false;
let loadingInterval = null;
let currentLoadingPromise = null;
let savedSearchesCache = null;
let currentVideoRequest = null;

export function initializeDataTable() {
    console.log('Initializing DataTable');
    
    if (!state.adsTable) {
        const table = $('#resultsTable').DataTable({
            data: [],
            columns: [
                { 
                    data: 'search_timestamp',
                    title: 'Search Date',
                    width: '100px',
                    className: 'dt-center all',
                    render: function(data) {
                        return data ? new Date(data).toLocaleDateString() : '';
                    }
                },
                { 
                    data: 'ad_creation_time',
                    title: 'Creation Date',
                    width: '100px',
                    className: 'dt-center all',
                    render: function(data) {
                        return data ? new Date(data).toLocaleDateString() : '';
                    }
                },
                { 
                    data: 'page_name',
                    title: 'Page Name',
                    width: '180px',
                    className: 'dt-center all'
                },
                { 
                    data: null,
                    title: 'EU Total Reach',
                    width: '200px',
                    className: 'dt-center all',
                    render: function(data, type, row) {
                        if (type === 'display') {
                            const cellId = `reach-${row.id}`;
                            return `<div id="${cellId}"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
                        }
                        return row.eu_total_reach || 0;
                    }
                },
                {
                    data: 'ad_snapshot_url',
                    title: 'Video',
                    width: '150px',
                    className: 'dt-center video-column all',
                    render: function(data, type, row) {
                        if (!data) return '';
                        return `
                            <button class="action-btn video-btn" onclick="loadVideo('${data}', this)">
                                <i class="fas fa-video"></i> Load
                            </button>
                            <div class="video-container" style="display:none;"></div>`;
                    }
                },
                { 
                    data: null,
                    title: 'Actions',
                    width: '250px',
                    className: 'dt-center all',
                    orderable: false,
                    render: function(data, type, row) {
                        return `
                            <div class="table-actions">
                                <button onclick="window.open('${row.ad_snapshot_url}', '_blank')" class="action-btn view-btn">
                                    <i class="fas fa-external-link-alt"></i>
                                </button>
                                <button onclick="filterAd('${row.id}')" class="action-btn filter-btn">
                                    <i class="fas fa-filter"></i>
                                </button>
                                <button onclick="filterPage('${row.page_name}')" class="action-btn filter-page-btn">
                                    <i class="fas fa-filter"></i> Page
                                </button>
                                <button onclick="addToPermaFilter('${row.page_name}')" class="action-btn perm-filter-btn">
                                    <i class="fas fa-ban"></i> Perm Filter Page
                                </button>
                            </div>`;
                    }
                },
                { 
                    data: null,
                    title: 'Stats',
                    width: '150px',
                    className: 'dt-center all',
                    orderable: true,
                    render: function(data, type, row) {
                        if (type === 'sort') {
                            // Extract the percentage value for sorting
                            const statsCell = document.getElementById(`stats-${row.id}`);
                            if (statsCell) {
                                const percentText = statsCell.textContent.match(/-?\d+\.?\d*/);
                                return percentText ? parseFloat(percentText[0]) : 0;
                            }
                            return 0;
                        }
                        if (type === 'display') {
                            const cellId = `stats-${row.id}`;
                            return `<div id="${cellId}"><i class="fas fa-spinner fa-spin"></i> Calculating...</div>`;
                        }
                        return 0;
                    }
                }
            ],
            pageLength: 25,
            lengthMenu: [
                [25, 100, 500, -1],
                ['25', '100', '500', 'All']
            ],
            order: [[0, 'desc']],
            responsive: true,
            autoWidth: false,
            scrollX: true,
            scrollY: true,
            scrollCollapse: false,
            fixedHeader: true,
            dom: '<"top d-flex justify-content-between"<"left-controls"<"dataTables_length"l><"total-entries">><"right-controls"B>><"clear">rt<"bottom d-flex justify-content-between"<"left-controls"<"dataTables_length"l><"total-entries-bottom">><"right-controls"p>>',
            buttons: [
                {
                    text: '<i class="fas fa-play-circle"></i> Load All Videos',
                    className: 'load-all-videos-btn',
                    action: function () {
                        loadAllVideos();
                    }
                }
            ],
            columnDefs: [
                { targets: '_all', orderable: true }
            ],
            fnInitComplete: function() {
                $(this).find('.dataTables_scrollHead').css('overflow', 'hidden');
                $(this).find('.dataTables_scrollBody').css('overflow', 'hidden');
                
                // Add total entries count with filtered stats to both top and bottom
                const stats = updateTableStats(this.api().data().length);
                $('.total-entries, .total-entries-bottom').html(stats);
            },
            stretchH: 'all',
            language: {
                lengthMenu: '_MENU_ per page',
                info: 'Showing _START_ to _END_ of _TOTAL_ entries',
                infoFiltered: '(filtered from _MAX_ total entries)'
            },
            responsive: {
                details: false
            },
            drawCallback: function(settings) {
                // Update stats after table is drawn
                if (typeof updateTableStats === 'function') {
                    updateTableStats();
                }
            }
        });
        
        // Add this draw event handler
        table.on('draw', async function() {
            try {
                const searches = await fetchSavedSearches();
                
                table.rows({ page: 'current' }).every(function() {
                    const row = this.data();
                    const reachCellId = `reach-${row.id}`;
                    const statsCellId = `stats-${row.id}`;
                    const reachCell = document.getElementById(reachCellId);
                    const statsCell = document.getElementById(statsCellId);
                    
                    if (reachCell && statsCell) {
                        // Get all historical reach data including current
                        const allReachData = [
                            {
                                fetchTime: new Date(row.search_timestamp || Date.now()),
                                reach: row.eu_total_reach || 0,
                                isCurrent: true
                            },
                            ...searches
                                .filter(search => 
                                    search.results && 
                                    Array.isArray(search.results) && 
                                    search.results.some(ad => ad.id === row.id)
                                )
                                .map(search => ({
                                    fetchTime: new Date(search.fetchTimestamp || search.timestamp),
                                    reach: search.results.find(ad => ad.id === row.id)?.eu_total_reach || 0,
                                    isCurrent: false
                                }))
                        ];

                        // Sort by fetch time, most recent first
                        allReachData.sort((a, b) => b.fetchTime - a.fetchTime);

                        // Calculate 7-day change
                        const sevenDaysAgo = new Date();
                        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                        
                        const recentData = allReachData.filter(data => data.fetchTime >= sevenDaysAgo);
                        
                        let statsContent = '';
                        if (recentData.length >= 2) {
                            const newestReach = recentData[0].reach;
                            const oldestReach = recentData[recentData.length - 1].reach;
                            
                            if (oldestReach > 0) {
                                const percentChange = ((newestReach - oldestReach) / oldestReach) * 100;
                                const changeDirection = percentChange >= 0 ? 'increase' : 'decrease';
                                const absChange = Math.abs(percentChange);
                                
                                statsContent = `
                                    <div class="stats-change ${changeDirection}">
                                        <i class="fas fa-${percentChange >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                                        ${absChange.toFixed(1)}%
                                        <div class="stats-period">7-day change</div>
                                    </div>
                                `;
                            } else {
                                statsContent = '<div class="stats-na">No previous data</div>';
                            }
                        } else {
                            statsContent = '<div class="stats-na">Insufficient data</div>';
                        }
                        
                        statsCell.innerHTML = statsContent;

                        // Update reach history display
                        const reachContent = `
                            <div class="stats-container">
                                ${allReachData.map(data => `
                                    <div class="stat-entry${data.isCurrent ? ' current' : ''}">
                                        ${data.fetchTime.toLocaleString()}: ${data.reach.toLocaleString()}
                                        ${data.isCurrent ? ' (Current)' : ''}
                                    </div>
                                `).join('')}
                            </div>`;
                        
                        reachCell.innerHTML = reachContent;
                    }
                });
            } catch (error) {
                console.error('Error updating reach history and stats:', error);
            }
        });

        state.adsTable = table;
        
        $(window).on('resize', function() {
            if (state.adsTable) {
                state.adsTable.columns.adjust();
            }
        });
    }
    
    return state.adsTable;
}

export async function loadVideo(videoUrl, buttonElement) {
    try {
        // Check if video is already loaded
        if (buttonElement.classList.contains('loaded')) {
            return true;
        }

        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        buttonElement.disabled = true;

        const response = await fetch('/api/fetch-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: videoUrl })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.videoUrl) {
            throw new Error('No video URL returned');
        }

        const videoContainer = buttonElement.nextElementSibling;
        videoContainer.style.display = 'block';
        videoContainer.innerHTML = `
            <video controls style="width: 100%; max-height: 200px;">
                <source src="${data.videoUrl}" type="video/mp4">
                Your browser does not support the video tag.
            </video>`;
        
        buttonElement.style.display = 'none';
        buttonElement.setAttribute('data-loaded', 'true');
        buttonElement.classList.add('loaded');
        return true;

    } catch (error) {
        console.error('Error loading video:', error);
        buttonElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
        buttonElement.classList.add('error');
        buttonElement.disabled = false;
        showErrorToast(`Failed to load video: ${error.message}`);
        return false;
    }
}

export async function loadAllVideos() {
    const loadButton = document.querySelector('.load-all-videos-btn');
    
    if (isLoadingVideos) {
        // Immediate stop
        isLoadingVideos = false;
        if (currentVideoRequest) {
            currentVideoRequest.abort(); // Abort the current fetch request
        }
        loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Videos';
        loadButton.classList.remove('loading');
        showWarningToast('Video loading stopped');
        return;
    }

    const videoButtons = Array.from(document.querySelectorAll('.video-btn:not(.loaded):not(.error)'));
    if (!videoButtons.length) {
        showWarningToast('No new videos to load');
        return;
    }

    isLoadingVideos = true;
    let loadedCount = 0;
    const totalVideos = videoButtons.length;
    const failedVideos = [];

    loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;
    loadButton.classList.add('loading');

    try {
        for (const button of videoButtons) {
            if (!isLoadingVideos) break;

            try {
                const onClickAttr = button.getAttribute('onclick');
                const urlMatch = onClickAttr.match(/loadVideo\('([^']+)'/);
                if (!urlMatch) continue;

                const videoUrl = urlMatch[1];

                // Create AbortController for this request
                const controller = new AbortController();
                currentVideoRequest = controller;

                try {
                    const response = await fetch('/api/fetch-video', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ url: videoUrl }),
                        signal: controller.signal // Add abort signal to fetch
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    
                    if (!data.videoUrl) {
                        throw new Error('No video URL returned');
                    }

                    const videoContainer = button.nextElementSibling;
                    videoContainer.style.display = 'block';
                    videoContainer.innerHTML = `
                        <video controls style="width: 100%; max-height: 200px;">
                            <source src="${data.videoUrl}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>`;
                    
                    button.style.display = 'none';
                    button.classList.add('loaded');
                    loadedCount++;
                    loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;

                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log('Fetch aborted');
                        break; // Exit the loop on abort
                    }
                    throw error; // Re-throw other errors
                }

                // Clear the current request reference
                currentVideoRequest = null;

                // Add delay between videos
                if (isLoadingVideos && loadedCount < totalVideos) {
                    await new Promise((resolve, reject) => {
                        const timeoutId = setTimeout(resolve, 200 + Math.random() * 1000);
                        // Allow the delay to be cancelled
                        if (!isLoadingVideos) {
                            clearTimeout(timeoutId);
                            reject(new Error('Loading stopped'));
                        }
                    });
                }

            } catch (error) {
                if (!isLoadingVideos) break; // Exit if loading was stopped
                console.error('Error loading video:', error);
                failedVideos.push(button);
                button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
                button.classList.add('error');
            }
        }
    } finally {
        // Cleanup
        isLoadingVideos = false;
        currentVideoRequest = null;
        loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Videos';
        loadButton.classList.remove('loading');

        // Show final status
        if (loadedCount > 0) {
            showSuccessToast(`Successfully loaded ${loadedCount} videos${failedVideos.length > 0 ? `, ${failedVideos.length} failed` : ''}`);
        } else if (failedVideos.length > 0) {
            showErrorToast(`Failed to load ${failedVideos.length} videos`);
        }
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
        console.log('Destroying existing table');
        state.adsTable.destroy();
        state.adsTable = null;
    }

    state.currentAdsData = ads;
    
    try {
        // Fetch permanent filter list
        const response = await fetch('/api/perma-filter');
        const { pages: permanentlyFiltered } = await response.json();
        console.log('Permanently filtered pages:', permanentlyFiltered);

        // Filter out ads that should be hidden
        const visibleAds = ads.filter(ad => {
            // Hide if the ad's page is permanently filtered
            if (permanentlyFiltered.includes(ad.page_name)) {
                console.log(`Filtering out ad from ${ad.page_name} (permanently filtered)`);
                return false;
            }
            // Hide if the ad is filtered
            if (state.filteredAds.has(ad.id)) {
                console.log(`Filtering out ad ${ad.id} (filtered)`);
                return false;
            }
            // Hide if the ad's page is filtered
            if (state.filteredPages.has(ad.page_name)) {
                state.filteredAds.add(ad.id);
                console.log(`Filtering out ad from ${ad.page_name} (page filtered)`);
                return false;
            }
            return true;
        });

        console.log('Visible ads after filtering:', visibleAds);

        // Initialize table with filtered data
        state.adsTable = initializeDataTable();
        
        console.log('Adding rows to table');
        state.adsTable.clear();
        
        // Get the fetch timestamp
        const fetchTimestamp = localStorage.getItem('currentFetchTimestamp');
        
        const transformedData = visibleAds.map(ad => ({
            search_timestamp: fetchTimestamp,
            ad_creation_time: ad.ad_creation_time,
            page_name: ad.page_name,
            eu_total_reach: ad.eu_total_reach,
            ad_snapshot_url: ad.ad_snapshot_url,
            id: ad.id
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
        console.error('Error applying filters:', error);
        showToast('Error applying filters', 'error');
        
        // If there's an error, show the unfiltered results
        state.adsTable = initializeDataTable();
        state.adsTable.clear();
        state.adsTable.rows.add(ads).draw();
    }
}

export function downloadCSV() {
    if (!state.currentAdsData.length) {
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

    csvContent += state.currentAdsData.map(ad => {
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
    link.setAttribute('download', `fb_ads_export_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function createActionButtons(row) {
    // ... existing button creation code ...
    
    // Add permanent filter button
    const permFilterBtn = document.createElement('button');
    permFilterBtn.className = 'btn btn-danger btn-sm';
    permFilterBtn.textContent = 'Perm Filter';
    permFilterBtn.onclick = () => addToPermaFilter(row.page_name);
    
    actionsCell.appendChild(permFilterBtn);
    // ... rest of existing code ...
}

export async function addToPermaFilter(pageName) {
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

        showToast(`Added "${pageName}" to permanent filter`, 'success');
        
        // Refresh the results with current data
        await updateResults(state.currentAdsData);

    } catch (error) {
        console.error('Error adding to permanent filter:', error);
        showToast('Failed to add to permanent filter', 'error');
    }
}

// Modify the displayResults function to filter out permanently filtered pages
async function displayResults(results) {
    try {
        // Fetch permanent filter list
        const response = await fetch('/api/perma-filter');
        const { pages: permanentlyFiltered } = await response.json();

        // Filter out permanently filtered pages
        const filteredResults = results.filter(result => 
            !permanentlyFiltered.includes(result.page_name)
        );

        // ... rest of existing display logic using filteredResults ...
    } catch (error) {
        console.error('Error applying permanent filter:', error);
        showToast('Error applying permanent filter', 'error');
    }
}

async function fetchSavedSearches() {
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

async function saveCurrentSearch() {
    // ... existing save logic ...
    
    // After successful save:
    clearSavedSearchesCache();
    
    // ... rest of the function ...
}

export function clearCurrentSearchName() {
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

function updateStatsCell(rowId, statsData) {
    const table = $('#resultsTable').DataTable();
    const row = table.row(`#stats-${rowId}`).data();
    
    // Store the numeric value for sorting
    row.reachChangePercent = statsData.changePercent;
    
    // Update the visible cell content
    $(`#stats-${rowId}`).html(`
        <div class="stats-change ${statsData.changePercent > 0 ? 'increase' : 'decrease'}">
            <i class="fas fa-arrow-${statsData.changePercent > 0 ? 'up' : 'down'}"></i>
            ${Math.abs(statsData.changePercent).toFixed(2)}%
        </div>
        <div class="stats-period">Last 7 days</div>
    `);
    
    // Update the row data in the DataTable
    table.row(`#stats-${rowId}`).data(row);
}