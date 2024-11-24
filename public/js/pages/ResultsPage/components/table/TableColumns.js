import { state } from '../../../../app.js';

export class TableColumns {
    static getColumnDefinitions() {
        return [
            this.getSearchDateColumn(),
            this.getCreationDateColumn(),
            this.getPageNameColumn(),
            this.getReachColumn(),
            this.getVideoColumn(),
            this.getFilterColumn(),
            this.getStatsColumn(),
            this.getActionsColumn()
        ];
    }

    static getSearchDateColumn() {
        return { 
            data: 'search_timestamp',
            title: 'Search Date',
            width: '100px',
            className: 'dt-center all',
            render: function(data) {
                return data ? new Date(data).toLocaleDateString() : '';
            }
        };
    }

    static getCreationDateColumn() {
        return { 
            data: 'ad_creation_time',
            title: 'Creation Date',
            width: '100px',
            className: 'dt-center all',
            render: function(data) {
                return data ? new Date(data).toLocaleDateString() : '';
            }
        };
    }

    static getPageNameColumn() {
        return { 
            data: 'page_name',
            title: 'Page Name',
            width: '180px',
            className: 'dt-center all'
        };
    }

    static getReachColumn() {
        return { 
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
        };
    }

    static getVideoColumn() {
        return {
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
        };
    }

    static getFilterColumn() {
        return { 
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
        };
    }

    static getStatsColumn() {
        return { 
            data: null,
            title: 'Stats',
            width: '150px',
            className: 'dt-center all',
            render: function(data, type, row) {
                const cellId = `stats-${row.id}`;
                
                if (type === 'sort') {
                    const statsCell = document.getElementById(cellId);
                    if (statsCell) {
                        const percentText = statsCell.querySelector('.stats-change')?.textContent.match(/-?\d+\.?\d*/);
                        return percentText ? parseFloat(percentText[0]) : 0;
                    }
                    return 0;
                }
                
                if (type === 'display') {
                    const reachChange = TableColumns.calculateReachChange(row.id);
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
        };
    }

    static getActionsColumn() {
        return { 
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
        };
    }

    static calculateReachChange(rowId) {
        const row = state.currentAdsData.find(ad => ad.id === rowId);
        if (!row || !row.reachHistory || row.reachHistory.length < 8) {
            return 0;
        }
        
        const currentReach = row.reachHistory[0];
        const previousReach = row.reachHistory[7];
        
        if (previousReach === 0) return 0;
        
        return ((currentReach - previousReach) / previousReach) * 100;
    }
}