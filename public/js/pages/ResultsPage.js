import { state } from '../app.js';
import { showErrorToast, showSuccessToast, showWarningToast, showToast } from '../components/Toast.js';
import { updateTableStats } from '../components/FilteredModal.js';
import { StatsChart } from '../components/StatsModal.js';

let isLoadingVideos = false;
let loadingInterval = null;
let currentLoadingPromise = null;
let savedSearchesCache = null;
let currentVideoRequest = null;

const statsChart = new StatsChart();

export function initializeDataTable() {
    console.log('Initializing DataTable');
    
    // Check if filter bar already exists before adding
    if (!$('.table-filters').length) {
        $('#resultsTable').before(`
            <div class="table-filters">
                <div class="filter-group">
                    <label for="dateFilter">Creation Date From</label>
                    <input type="date" id="dateFilter" class="filter-input">
                </div>
                <div class="filter-group">
                    <label for="pageNameFilter">Page Name</label>
                    <input type="text" id="pageNameFilter" class="filter-input" placeholder="Search pages...">
                </div>
                <div class="filter-group">
                    <label for="reachFilter">Min. Total Reach</label>
                    <input type="number" id="reachFilter" class="filter-input" placeholder="Minimum reach...">
                </div>
                <div class="filter-group">
                    <label for="statsFilter">Min. 7-Day Change %</label>
                    <input type="number" id="statsFilter" class="filter-input" placeholder="Min. change %">
                </div>
                <button class="clear-filters-btn">
                    <i class="fas fa-times"></i> Clear Filters
                </button>
            </div>
        `);
    }

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
                    render: function(data, type, row) {
                        const cellId = `stats-${row.id}`;
                        
                        if (type === 'sort') {
                            // Extract percentage for sorting
                            const statsCell = document.getElementById(cellId);
                            if (statsCell) {
                                const percentText = statsCell.querySelector('.stats-change')?.textContent.match(/-?\d+\.?\d*/);
                                return percentText ? parseFloat(percentText[0]) : 0;
                            }
                            return 0;
                        }
                        
                        if (type === 'display') {
                            // Calculate 7-day change here
                            const reachChange = calculateReachChange(row.id);
                            const changeClass = reachChange > 0 ? 'increase' : reachChange < 0 ? 'decrease' : '';
                            const changeIcon = reachChange > 0 ? 'fa-arrow-up' : reachChange < 0 ? 'fa-arrow-down' : '';
                            
                            return `
                                <div id="${cellId}" class="stats-cell" style="cursor: pointer;">
                                    <div class="stats-change ${changeClass}">
                                        ${changeIcon ? `<i class="fas ${changeIcon}"></i>` : ''}
                                        ${Math.abs(reachChange)}%
                                    </div>
                                    <div class="stats-period">7d change</div>
                                    <div class="view-stats">
                                        <i class="fas fa-chart-line"></i> View Stats
                                    </div>
                                </div>`;
                        }
                        return '';
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
        
        // Add custom filtering functionality
        $.fn.dataTable.ext.search.push(
            function(settings, data, dataIndex) {
                // Get filter values
                const dateFilter = $('#dateFilter').val();
                const pageNameFilter = $('#pageNameFilter').val().toLowerCase();
                const reachFilter = $('#reachFilter').val();
                const statsFilter = $('#statsFilter').val();

                // Get row data
                const creationDate = data[1] ? new Date(data[1]) : null;
                const pageName = (data[2] || '').toLowerCase();
                
                // Get reach value directly from data
                let reach = 0;
                try {
                    reach = parseInt(data[3]) || 0;
                    
                    // Fallback to parsing from text if direct parse fails
                    if (reach === 0 && data[3]) {
                        const reachText = data[3].toString();
                        const reachMatch = reachText.match(/\d+/);
                        reach = reachMatch ? parseInt(reachMatch[0]) : 0;
                    }
                } catch (error) {
                    console.error('Error parsing reach:', error);
                    reach = 0;
                }

                // Apply filters
                if (dateFilter && creationDate && creationDate < new Date(dateFilter)) return false;
                if (pageNameFilter && !pageName.includes(pageNameFilter)) return false;
                
                // Reach filter
                if (reachFilter !== '' && !isNaN(reachFilter)) {
                    const filterValue = parseInt(reachFilter);
                    if (isNaN(reach) || reach < filterValue) return false;
                }

                // Stats filter
                if (statsFilter !== '' && !isNaN(statsFilter)) {
                    try {
                        const statsText = data[6] || '';
                        const statsMatch = statsText.match(/-?\d+\.?\d*/);
                        let statsValue = statsMatch ? parseFloat(statsMatch[0]) : 0;
                        
                        if (statsText.includes('decrease')) {
                            statsValue = -statsValue;
                        }
                        
                        if (statsValue < parseFloat(statsFilter)) return false;
                    } catch (error) {
                        console.error('Error parsing stats:', error);
                    }
                }

                return true;
            }
        );

        // Monitor filter changes
        $('#reachFilter, #statsFilter').on('input', function() {
            console.log(`${this.id} changed to:`, $(this).val());
        });

        // Add filter change handlers
        $('.filter-input').on('input', function() {
            table.draw();
        });

        // Add clear filters handler
        $('.clear-filters-btn').on('click', function() {
            $('.filter-input').val('');
            table.draw();
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
        // Check if media is already loaded
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
            throw new Error(`Failed to fetch media: ${response.statusText}`);
        }

        const data = await response.json();
        
        const videoContainer = buttonElement.nextElementSibling;
        videoContainer.style.display = 'block';

        // Check if we received a video URL or image URL
        if (data.videoUrl) {
            videoContainer.innerHTML = `
                <video controls style="width: 100%; max-height: 200px;">
                    <source src="${data.videoUrl}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
        } else if (data.imageUrl) {
            videoContainer.innerHTML = `
                <img src="${data.imageUrl}" alt="Ad Image" style="width: 100%; max-height: 200px; object-fit: contain;">`;
        } else {
            throw new Error('No media URL returned');
        }
        
        buttonElement.style.display = 'none';
        buttonElement.setAttribute('data-loaded', 'true');
        buttonElement.classList.add('loaded');
        return true;

    } catch (error) {
        console.error('Error loading media:', error);
        buttonElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
        buttonElement.classList.add('error');
        buttonElement.disabled = false;
        showErrorToast(`Failed to load media: ${error.message}`);
        return false;
    }
}

export async function loadAllVideos() {
    const loadButton = document.querySelector('.load-all-videos-btn');
    
    if (isLoadingVideos) {
        isLoadingVideos = false;
        if (currentVideoRequest) {
            currentVideoRequest.abort();
        }
        loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Media';
        loadButton.classList.remove('loading');
        showWarningToast('Media loading stopped');
        return;
    }

    const videoButtons = Array.from(document.querySelectorAll('.video-btn:not(.loaded):not(.error)'));
    if (!videoButtons.length) {
        showWarningToast('No new media to load');
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

                const controller = new AbortController();
                currentVideoRequest = controller;

                try {
                    const response = await fetch('/api/fetch-video', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ url: videoUrl }),
                        signal: controller.signal
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    
                    const videoContainer = button.nextElementSibling;
                    videoContainer.style.display = 'block';

                    // Handle both video and image responses
                    if (data.videoUrl) {
                        videoContainer.innerHTML = `
                            <video controls style="width: 100%; max-height: 200px;">
                                <source src="${data.videoUrl}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>`;
                    } else if (data.imageUrl) {
                        videoContainer.innerHTML = `
                            <img src="${data.imageUrl}" alt="Ad Image" style="width: 100%; max-height: 200px; object-fit: contain;">`;
                    } else {
                        throw new Error('No media URL returned');
                    }
                    
                    button.style.display = 'none';
                    button.classList.add('loaded');
                    loadedCount++;
                    loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;

                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log('Fetch aborted');
                        break;
                    }
                    throw error;
                }

                currentVideoRequest = null;

                if (isLoadingVideos && loadedCount < totalVideos) {
                    await new Promise((resolve, reject) => {
                        const timeoutId = setTimeout(resolve, 200 + Math.random() * 1000);
                        if (!isLoadingVideos) {
                            clearTimeout(timeoutId);
                            reject(new Error('Loading stopped'));
                        }
                    });
                }

            } catch (error) {
                if (!isLoadingVideos) break;
                console.error('Error loading media:', error);
                failedVideos.push(button);
                button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
                button.classList.add('error');
            }
        }
    } finally {
        isLoadingVideos = false;
        currentVideoRequest = null;
        loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Media';
        loadButton.classList.remove('loading');

        if (loadedCount > 0) {
            showSuccessToast(`Successfully loaded ${loadedCount} media items${failedVideos.length > 0 ? `, ${failedVideos.length} failed` : ''}`);
        } else if (failedVideos.length > 0) {
            showErrorToast(`Failed to load ${failedVideos.length} media items`);
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

$('#resultsTable').on('click', '.stats-cell', function() {
    const rowData = state.adsTable.row($(this).closest('tr')).data();
    statsChart.showStats(rowData.id);
});

// Helper function to calculate reach change percentage
function calculateReachChange(rowData) {
    if (!rowData.reachHistory || rowData.reachHistory.length < 8) {
        return null;
    }
    
    const currentReach = rowData.reachHistory[0];
    const previousReach = rowData.reachHistory[7];
    
    if (previousReach === 0) return 0;
    
    return ((currentReach - previousReach) / previousReach) * 100;
}