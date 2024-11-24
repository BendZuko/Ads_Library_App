import { StatsHandler } from './StatsHandler.js';

export class StatsModal {
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
            
            const dataPoints = await StatsHandler.fetchReachHistory(adId, searches);
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

        this.chart = new Chart(ctx, StatsHandler.initializeChartConfig(dataPoints, ctx));
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