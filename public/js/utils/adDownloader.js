import { showToast } from '../components/Toast.js';

export async function downloadAd(adUrl) {
    try {
        showToast('Fetching video URL...', 'info');

        // Step 1: Get the video URL
        const extractResponse = await fetch('/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: adUrl })
        });

        if (!extractResponse.ok) {
            throw new Error('Failed to extract video URL');
        }

        const data = await extractResponse.json();
        console.log('Extraction response:', data);

        if (data.error) {
            throw new Error(data.error);
        }

        // Get the highest quality URL available
        const videoUrl = data.hdUrl || data.sdUrl;
        
        if (!videoUrl) {
            throw new Error('No video URL found');
        }

        showToast('Starting download...', 'info');

        // Step 2: Download through proxy
        const quality = data.hdUrl ? 'HD' : 'SD';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `fb_ad_${quality}_${timestamp}.mp4`;

        // Create a link element
        const link = document.createElement('a');
        link.href = `/proxy-download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
        link.download = filename;
        
        // Append, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Download started!', 'success');

    } catch (error) {
        console.error('Download error:', error);
        showToast(`Download failed: ${error.message}`, 'error');
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