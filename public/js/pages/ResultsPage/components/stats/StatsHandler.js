import { showErrorToast } from '../../../../components/Toast.js';

export class StatsHandler {
    static calculateReachChange(rowData) {
        if (!rowData.reachHistory || rowData.reachHistory.length < 8) {
            return null;
        }
        
        const currentReach = rowData.reachHistory[0];
        const previousReach = rowData.reachHistory[7];
        
        if (previousReach === 0) return 0;
        
        return ((currentReach - previousReach) / previousReach) * 100;
    }

    static updateStatsCell(rowId, statsData) {
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

    static async fetchReachHistory(adId, searches) {
        const dataPoints = [];
        searches.forEach(search => {
            const ad = search.results.find(result => result.id === adId);
            if (ad) {
                dataPoints.push({
                    date: new Date(search.fetchTimestamp),
                    reach: parseInt(ad.eu_total_reach) || 0
                });
            }
        });

        // Sort by date
        dataPoints.sort((a, b) => a.date - b.date);

        // Add creation date point
        const firstAd = searches.flatMap(s => s.results).find(ad => ad.id === adId);
        if (firstAd && firstAd.ad_creation_time) {
            dataPoints.unshift({
                date: new Date(firstAd.ad_creation_time),
                reach: 0
            });
        }

        return dataPoints;
    }

    static initializeChartConfig(dataPoints, ctx) {
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(75, 192, 192, 0.5)');
        gradient.addColorStop(1, 'rgba(75, 192, 192, 0.0)');

        return {
            type: 'line',
            data: {
                labels: dataPoints.map(d => d.date.toLocaleDateString()),
                datasets: [{
                    label: 'Total Reach',
                    data: dataPoints.map(d => d.reach),
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: 'white',
                    pointBorderColor: 'rgb(75, 192, 192)',
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: 'rgb(75, 192, 192)',
                    pointHoverBorderColor: 'white'
                }]
            },
            options: StatsHandler.getChartOptions(dataPoints)
        };
    }

    static getChartOptions(dataPoints) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    title: {
                        display: true,
                        text: 'Reach'
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#000',
                    bodyColor: '#000',
                    borderColor: 'rgba(75, 192, 192, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(tooltipItems) {
                            const date = dataPoints[tooltipItems[0].dataIndex].date;
                            return date.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            });
                        },
                        label: function(context) {
                            const reach = context.raw;
                            const prevReach = context.dataIndex > 0 ? 
                                context.dataset.data[context.dataIndex - 1] : 0;
                            const change = reach - prevReach;
                            const changePercent = prevReach === 0 ? 100 : 
                                ((change / prevReach) * 100).toFixed(1);
                            
                            return [
                                `Total Reach: ${reach.toLocaleString()}`,
                                `Change: ${change >= 0 ? '+' : ''}${change.toLocaleString()}`,
                                `Growth: ${changePercent}%`
                            ];
                        }
                    }
                }
            }
        };
    }
}