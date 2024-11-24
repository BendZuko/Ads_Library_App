import { state } from '../../../../app.js';
import { showErrorToast, showSuccessToast, showWarningToast } from '../../../../components/Toast.js';

export class VideoHandler {
    static isLoadingVideos = false;
    static currentVideoRequest = null;
    
    static async loadVideo(videoUrl, buttonElement) {
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

    static async loadAllVideos() {
        const loadButton = document.querySelector('.load-all-videos-btn');
        
        if (VideoHandler.isLoadingVideos) {
            VideoHandler.isLoadingVideos = false;
            if (VideoHandler.currentVideoRequest) {
                VideoHandler.currentVideoRequest.abort();
            }
            
            const loadingButtons = document.querySelectorAll('.video-btn.loading');
            loadingButtons.forEach(button => {
                button.innerHTML = '<i class="fas fa-video"></i> Load';
                button.classList.remove('loading');
            });
            
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

        VideoHandler.isLoadingVideos = true;
        let loadedCount = 0;
        const totalVideos = videoButtons.length;
        const failedVideos = [];

        loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;
        loadButton.classList.add('loading');

        try {
            for (const button of videoButtons) {
                if (!VideoHandler.isLoadingVideos) break;

                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                button.classList.add('loading');

                const onClickAttr = button.getAttribute('onclick');
                const urlMatch = onClickAttr.match(/loadVideo\('([^']+)'/);
                if (!urlMatch) continue;

                const videoUrl = urlMatch[1];
                await VideoHandler.loadVideo(videoUrl, button);
                loadedCount++;
                
                loadButton.innerHTML = `<i class="fas fa-stop-circle"></i> Stop Loading (${loadedCount}/${totalVideos})`;

                // Add a small delay between videos
                if (VideoHandler.isLoadingVideos) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        } catch (error) {
            console.error('Error in loadAllVideos:', error);
        } finally {
            VideoHandler.isLoadingVideos = false;
            loadButton.innerHTML = '<i class="fas fa-play-circle"></i> Load All Media';
            loadButton.classList.remove('loading');

            if (loadedCount > 0) {
                showSuccessToast(`Successfully loaded ${loadedCount} media items${failedVideos.length > 0 ? `, ${failedVideos.length} failed` : ''}`);
            } else if (failedVideos.length > 0) {
                showErrorToast(`Failed to load ${failedVideos.length} media items`);
            }
        }
    }

    static downloadCSV() {
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
}

export const { loadVideo, loadAllVideos, downloadCSV } = VideoHandler;