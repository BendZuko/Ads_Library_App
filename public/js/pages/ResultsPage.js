import { state } from '../app.js';
import { showErrorToast, showSuccessToast, showWarningToast, showToast } from '../components/Toast.js';
import { updateTableStats } from '../components/FilteredModal.js';

let isLoadingVideos = false;
let loadingInterval = null;
let currentLoadingPromise = null;

export function initializeDataTable() {
    console.log('Initializing DataTable');
    
    if (!state.adsTable) {
        const table = $('#resultsTable').DataTable({
            data: [],
            columns: [
                { 
                    data: 'ad_creation_time',
                    title: 'Creation Date',
                    width: '15%',
                    className: 'dt-center all',
                    render: function(data) {
                        return data ? new Date(data).toLocaleDateString() : '';
                    }
                },
                { 
                    data: 'page_name',
                    title: 'Page Name',
                    width: '20%',
                    className: 'dt-center all'
                },
                { 
                    data: 'eu_total_reach',
                    title: 'EU Total Reach',
                    width: '15%',
                    className: 'dt-body-right dt-head-center all',
                    render: function(data) {
                        return data ? data.toLocaleString() : '0';
                    }
                },
                {
                    data: 'ad_snapshot_url',
                    title: 'Video',
                    width: '25%',
                    className: 'dt-center video-column all',
                    render: function(data, type, row) {
                        if (!data) return '';
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
                    className: 'dt-center all',
                    render: function(data, type, row) {
                        return `
                            <div class="table-actions">
                                <a href="${row.ad_snapshot_url}" target="_blank" class="action-btn view-btn">
                                    <i class="fas fa-external-link-alt"></i> View
                                </a>
                                <button onclick="filterAd('${row.id}')" class="action-btn filter-btn">
                                    <i class="fas fa-filter"></i> Filter
                                </button>
                                <button onclick="filterPage('${row.page_name}')" class="action-btn filter-page-btn">
                                    <i class="fas fa-filter"></i> Filter Page
                                </button>
                                <button onclick="addToPermaFilter('${row.page_name}')" class="action-btn perm-filter-btn">
                                    <i class="fas fa-ban"></i> Perm Filter
                                </button>
                            </div>`;
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
            throw new Error(`Failed to fetch video URL: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.videoUrl) {
            const videoContainer = buttonElement.nextElementSibling;
            videoContainer.style.display = 'block';
            videoContainer.innerHTML = `
                <video controls style="width: 100%; max-height: 200px;">
                    <source src="${data.videoUrl}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
            buttonElement.style.display = 'none';
            buttonElement.classList.add('loaded');
            return true;
        } else {
            throw new Error('No video URL returned');
        }
    } catch (error) {
        console.error('Error loading video:', error);
        buttonElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
        buttonElement.classList.add('error');
        buttonElement.disabled = false;
        return false;
    }
}

export async function loadAllVideos() {
    const loadButton = document.querySelector('.load-all-videos-btn');
    
    if (isLoadingVideos) {
        // Stop loading process
        isLoadingVideos = false;
        if (loadingInterval) {
            clearTimeout(loadingInterval);
            loadingInterval = null;
        }
        loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Videos';
        loadButton.classList.remove('loading');
        showWarningToast('Video loading stopped');
        return;
    }

    const videoButtons = document.querySelectorAll('.video-btn:not([data-loaded="true"]):not(.error)');
    if (!videoButtons.length) {
        showWarningToast('No videos to load');
        return;
    }

    // Start loading process
    isLoadingVideos = true;
    let loadedCount = 0;
    const totalVideos = videoButtons.length;

    loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;
    loadButton.classList.add('loading');

    for (const button of videoButtons) {
        if (!isLoadingVideos) {
            break; // Stop if loading was cancelled
        }

        try {
            // Skip if already loaded
            if (button.getAttribute('data-loaded') === 'true') continue;

            // Extract video URL from onclick attribute
            const onClickAttr = button.getAttribute('onclick');
            const urlMatch = onClickAttr.match(/loadVideo\('([^']+)'/);
            if (!urlMatch) continue;

            const videoUrl = urlMatch[1];

            try {
                // Attempt to load the video
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

                const response = await fetch('/api/fetch-video', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url: videoUrl })
                });

                if (!response.ok) throw new Error('Failed to fetch video URL');
                const data = await response.json();
                
                if (data.videoUrl) {
                    const videoContainer = button.nextElementSibling;
                    videoContainer.style.display = 'block';
                    videoContainer.innerHTML = `
                        <video controls style="width: 100%; max-height: 200px;">
                            <source src="${data.videoUrl}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>`;
                    button.style.display = 'none';
                    button.classList.add('loaded');
                } else {
                    throw new Error('No video URL returned');
                }

                loadedCount++;
                loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;

            } catch (error) {
                console.error('Error loading video:', error);
                button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
                button.classList.add('error');
                button.disabled = false;
                showErrorToast(`Failed to load video: ${error.message}`);
            }

            // Add random delay between videos (1-2 seconds)
            if (isLoadingVideos && videoButtons[loadedCount]) {
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            }

        } catch (error) {
            console.error('Error in video loading loop:', error);
        }
    }

    // Reset button state after completion
    isLoadingVideos = false;
    loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Videos';
    loadButton.classList.remove('loading');
    
    if (loadedCount > 0) {
        showSuccessToast(`Successfully loaded ${loadedCount} videos`);
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
        
        const transformedData = visibleAds.map(ad => ({
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