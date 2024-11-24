import { state } from '../../../../app.js';
import { updateTableStats } from '../filter/FilteredModal.js';
import { fetchSavedSearches } from '../../../../utils/api.js';

export class TableInitializer {
    static initialize() {
        console.log('Initializing DataTable');
        
        if (!$('#resultsTable').length) {
            console.error('Results table not found in DOM');
            return null;
        }

        if (state.adsTable) {
            return state.adsTable;
        }

        try {
            const tableOptions = {
                data: [],
                columns: [
                    { 
                        data: 'search_timestamp',
                        title: 'Search Date',
                        className: 'dt-center',
                        width: '100px',
                        render: function(data) {
                            return data ? new Date(data).toLocaleDateString() : '';
                        }
                    },
                    { 
                        data: 'ad_creation_time',
                        title: 'Creation Date',
                        className: 'dt-center',
                        width: '100px',
                        render: function(data) {
                            return data ? new Date(data).toLocaleDateString() : '';
                        }
                    },
                    { 
                        data: 'page_name',
                        title: 'Page Name',
                        className: 'dt-center',
                        width: '180px'
                    },
                    { 
                        data: null,
                        title: 'EU Total Reach',
                        className: 'dt-center',
                        width: '150px',
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
                        className: 'dt-center video-column',
                        width: '120px',
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
                        title: 'Filter',
                        className: 'dt-center',
                        width: '180px',
                        orderable: false,
                        render: function(data, type, row) {
                            return `
                                <div class="table-actions">
                                    <button onclick="filterAd('${row.id}')" class="action-btn filter-btn" title="Filter Ad">
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
                        className: 'dt-center',
                        width: '120px',
                        orderable: false,
                        render: function(data, type, row) {
                            const cellId = `stats-${row.id}`;
                            return `<div id="${cellId}"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
                        }
                    },
                    { 
                        data: null,
                        title: 'Actions',
                        className: 'dt-center',
                        width: '120px',
                        orderable: false,
                        render: function(data, type, row) {
                            return `
                                <div class="table-actions">
                                    <button onclick="window.open('${row.ad_snapshot_url}', '_blank')" class="action-btn view-btn">
                                        <i class="fas fa-external-link-alt"></i> Visit URL
                                    </button>
                                    <button onclick="downloadAd('${row.ad_snapshot_url}')" class="action-btn download-btn" id="download-${row.id}">
                                        <i class="fas fa-download"></i> Download
                                    </button>
                                </div>`;
                        }
                    }
                ],
                pageLength: 25,
                lengthMenu: [[25, 100, 500, -1], ['25', '100', '500', 'All']],
                order: [[0, 'desc']],
                dom: '<"top d-flex justify-content-between"<"left-controls"<"dataTables_length"l><"total-entries">><"right-controls"B>><"clear">rt<"bottom d-flex justify-content-between"<"left-controls"<"dataTables_length"l><"total-entries-bottom">><"right-controls"p>>',
                buttons: [{
                    text: '<i class="fas fa-play-circle"></i> Load All Videos',
                    className: 'load-all-videos-btn',
                    action: function() {
                        if (window.loadAllVideos) {
                            window.loadAllVideos();
                        }
                    }
                }],
                scrollX: true,
                autoWidth: false,
                responsive: false,
                processing: true,
                initComplete: function() {
                    const stats = updateTableStats(this.api().data().length);
                    $('.total-entries, .total-entries-bottom').html(stats);
                }
            };

            const table = $('#resultsTable').DataTable(tableOptions);
            
            this.addCustomFiltering();
            this.addEventListeners(table);
            
            state.adsTable = table;
            return table;

        } catch (error) {
            console.error('Error initializing DataTable:', error);
            return null;
        }
    }

    static addFilterBar() {
        const filterBar = `
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
        `;
        
        $('#resultsTable').before(filterBar);
    }

    static getColumnDefinitions() {
        return [
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
                title: 'Filter',
                width: '200px',
                className: 'dt-center all',
                orderable: false,
                render: function(data, type, row) {
                    return `
                        <div class="table-actions">
                            <button onclick="filterAd('${row.id}')" class="action-btn filter-btn" title="Filter Ad">
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
                title: 'Actions',
                width: '150px',
                className: 'dt-center all',
                orderable: false,
                render: function(data, type, row) {
                    return `
                        <div class="table-actions">
                            <button onclick="window.open('${row.ad_snapshot_url}', '_blank')" class="action-btn view-btn">
                                <i class="fas fa-external-link-alt"></i> Visit URL
                            </button>
                            <button onclick="downloadAd('${row.ad_snapshot_url}')" class="action-btn download-btn" id="download-${row.id}">
                                <i class="fas fa-download"></i> Download
                            </button>
                        </div>`;
                }
            }
        ];
    }

    static addCustomFiltering() {
        // Add custom filtering functionality
        $.fn.dataTable.ext.search.push(
            function(settings, data, dataIndex) {
                // Get filter values
                const dateFilter = $('#dateFilter').val();
                const pageNameFilter = $('#pageNameFilter').val()?.toLowerCase() || '';
                const reachFilter = $('#reachFilter').val();
                const statsFilter = $('#statsFilter').val();

                // Get row data - safely handle potentially undefined values
                const creationDate = data[1] ? new Date(data[1]) : null;
                const pageName = (data[2] || '').toLowerCase();
                
                // Get reach value directly from data
                let reach = 0;
                try {
                    // First try to parse the direct value
                    reach = parseInt(data[3]) || 0;
                    
                    // If that fails, try to extract from HTML content
                    if (reach === 0 && data[3]) {
                        const reachText = data[3].toString();
                        const reachMatch = reachText.match(/\d+/);
                        reach = reachMatch ? parseInt(reachMatch[0]) : 0;
                    }
                } catch (error) {
                    console.error('Error parsing reach:', error);
                    reach = 0;
                }

                // Apply filters with null checks
                if (dateFilter && creationDate && creationDate < new Date(dateFilter)) {
                    return false;
                }
                
                if (pageNameFilter && !pageName.includes(pageNameFilter)) {
                    return false;
                }
                
                // Reach filter
                if (reachFilter !== '' && !isNaN(reachFilter)) {
                    const filterValue = parseInt(reachFilter);
                    if (isNaN(reach) || reach < filterValue) {
                        return false;
                    }
                }

                // Stats filter - with additional safety checks
                if (statsFilter !== '' && !isNaN(statsFilter)) {
                    try {
                        const statsText = data[6] || '';
                        // Only try to parse stats if there's actual content
                        if (statsText) {
                            const statsMatch = statsText.match(/-?\d+\.?\d*/);
                            let statsValue = statsMatch ? parseFloat(statsMatch[0]) : 0;
                            
                            if (statsText.includes('decrease')) {
                                statsValue = -statsValue;
                            }
                            
                            if (statsValue < parseFloat(statsFilter)) {
                                return false;
                            }
                        } else {
                            // If no stats available and there's a filter, exclude the row
                            return false;
                        }
                    } catch (error) {
                        console.error('Error parsing stats:', error);
                        return false;
                    }
                }

                return true;
            }
        );
    }

    static addEventListeners(table) {
        $('#reachFilter, #statsFilter').on('input', function() {
            console.log(`${this.id} changed to:`, $(this).val());
        });

        $('.filter-input').on('input', function() {
            table.draw();
        });

        $('.clear-filters-btn').on('click', function() {
            $('.filter-input').val('');
            table.draw();
        });

        table.on('draw', async function() {
            try {
                const searches = await fetchSavedSearches();
                TableInitializer.updateTableRows(table, searches);
            } catch (error) {
                console.error('Error updating reach history and stats:', error);
            }
        });
    }

    static updateTableRows(table, searches) {
        table.rows({ page: 'current' }).every(function() {
            const row = this.data();
            const reachCellId = `reach-${row.id}`;
            const statsCellId = `stats-${row.id}`;
            const reachCell = document.getElementById(reachCellId);
            const statsCell = document.getElementById(statsCellId);
            
            if (reachCell && statsCell) {
                TableInitializer.updateCells(row, searches, reachCell, statsCell);
            }
        });
    }

    static updateCells(row, searches, reachCell, statsCell) {
        const allReachData = TableInitializer.getAllReachData(row, searches);
        const statsContent = TableInitializer.generateStatsContent(allReachData);
        const reachContent = TableInitializer.generateReachContent(allReachData);
        
        statsCell.innerHTML = statsContent;
        reachCell.innerHTML = reachContent;
    }

    static getAllReachData(row, searches) {
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
        return allReachData;
    }

    static generateStatsContent(allReachData) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentData = allReachData.filter(data => data.fetchTime >= sevenDaysAgo);
        
        if (recentData.length >= 2) {
            const newestReach = recentData[0].reach;
            const oldestReach = recentData[recentData.length - 1].reach;
            
            if (oldestReach > 0) {
                const percentChange = ((newestReach - oldestReach) / oldestReach) * 100;
                const changeDirection = percentChange >= 0 ? 'increase' : 'decrease';
                const absChange = Math.abs(percentChange);
                
                return `
                    <div class="stats-change ${changeDirection}">
                        <i class="fas fa-${percentChange >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                        ${absChange.toFixed(1)}%
                        <div class="stats-period">7-day change</div>
                    </div>
                `;
            }
            return '<div class="stats-na">No previous data</div>';
        }
        return '<div class="stats-na">Insufficient data</div>';
    }

    static generateReachContent(allReachData) {
        return `
            <div class="stats-container">
                ${allReachData.map(data => `
                    <div class="stat-entry${data.isCurrent ? ' current' : ''}">
                        ${data.fetchTime.toLocaleString()}: ${data.reach.toLocaleString()}
                        ${data.isCurrent ? ' (Current)' : ''}
                    </div>
                `).join('')}
            </div>`;
    }
}