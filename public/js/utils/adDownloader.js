import { showToast } from '../components/Toast.js';

export async function downloadAd(adUrl) {
    const downloadButton = document.querySelector(`button[onclick="downloadAd('${adUrl}')"]`);
    const originalButtonContent = downloadButton ? downloadButton.innerHTML : null;

    try {
        if (downloadButton) {
            downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            downloadButton.disabled = true;
            downloadButton.classList.add('loading');
        }
        
        showToast('Fetching media URL...', 'info');

        // Step 1: Get the media URL
        const extractResponse = await fetch('/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: adUrl })
        });

        if (!extractResponse.ok) {
            throw new Error('Failed to extract media URL');
        }

        const data = await extractResponse.json();
        console.log('Extraction response:', data);

        if (data.error) {
            throw new Error(data.error);
        }

        // Handle both video and image cases
        if (data.imageUrl) {
            // Handle image download
            showToast('Starting image download...', 'info');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `fb_ad_image_${timestamp}.jpg`;
            
            // Use proxy-download for images too
            const link = document.createElement('a');
            link.href = `/proxy-download?url=${encodeURIComponent(data.imageUrl)}&filename=${encodeURIComponent(filename)}`;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Image download started!', 'success');
        } else {
            // Existing video download logic
            const videoUrl = data.hdUrl || data.sdUrl;
            
            if (!videoUrl) {
                throw new Error('No media URL found');
            }

            showToast('Starting video download...', 'info');

            const quality = data.hdUrl ? 'HD' : 'SD';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `fb_ad_${quality}_${timestamp}.mp4`;

            const link = document.createElement('a');
            link.href = `/proxy-download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast('Download started!', 'success');
        }

    } catch (error) {
        console.error('Download error:', error);
        showToast(`Download failed: ${error.message}`, 'error');
    } finally {
        if (downloadButton) {
            downloadButton.innerHTML = originalButtonContent;
            downloadButton.disabled = false;
            downloadButton.classList.remove('loading');
        }
    }
}

// Helper function to get current token
async function getCurrentToken() {
    try {
        const response = await fetch('/api/current-token');
        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Error getting token:', error);
        return null;
    }
}

// Helper function to validate Facebook Ad URL
function isValidFacebookAdUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('facebook.com') && 
               urlObj.pathname.includes('/ads/archive/render_ad/') &&
               urlObj.searchParams.has('id') &&
               urlObj.searchParams.has('access_token');
    } catch {
        return false;
    }
}