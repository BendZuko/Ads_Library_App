import { showErrorToast } from './Toast.js';

export class StatsChart {
    constructor() {
        this.chart = null;
        this.modal = null;
        this.initializeModal();
    }

    initializeModal() {
        if (!document.getElementById('statsModal')) {
            const modalHTML = `
                <div id="statsModal" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Reach Statistics</h3>
                            <button class="close-modal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <canvas id="reachChart"></canvas>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            const closeBtn = document.querySelector('#statsModal .close-modal');
            closeBtn.addEventListener('click', () => this.hideModal());
        }

        this.modal = document.getElementById('statsModal');
    }

    async showStats(adId) {
        try {
            const response = await fetch('/api/saved-searches');
            const searches = await response.json();
            
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

            this.renderChart(dataPoints);
            this.showModal();
        } catch (error) {
            console.error('Error loading stats:', error);
            showErrorToast('Failed to load statistics');
        }
    }

    renderChart(dataPoints) {
        const ctx = document.getElementById('reachChart');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(75, 192, 192, 0.5)');
        gradient.addColorStop(1, 'rgba(75, 192, 192, 0.0)');

        this.chart = new Chart(ctx, {
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
            options: {
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
            }
        });
    }

    showModal() {
        this.modal.style.display = 'block';
    }

    hideModal() {
        this.modal.style.display = 'none';
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
}