// Required packages for the server
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Configure server middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Define important directory paths
const PUBLIC_DIR = path.join(__dirname, '../public');
const UPLOAD_FOLDER = path.join(__dirname, '../static/videos');
const DATA_DIR = path.join(__dirname, '..', 'data');
const SAVED_SEARCHES_DIR = path.join(DATA_DIR, 'saved_searches');
const PERMA_FILTER_FILE = path.join(DATA_DIR, 'perma_filter.json');

// Debug middleware
app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);
    console.log(`Looking for file: ${path.join(PUBLIC_DIR, req.url)}`);
    console.log('Request headers:', req.headers);
    next();
});

// Configure MIME types and static file serving
app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (req.url.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    // Add some debug logging
    console.log(`Requesting: ${req.url}, Content-Type:`, res.getHeader('Content-Type'));
    next();
});

// Serve static files with proper headers
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript; charset=utf-8');
        } else if (path.endsWith('.css')) {
            res.set('Content-Type', 'text/css; charset=utf-8');
        }
    }
}));

// Debug route to check file content
app.get('/debug-file', (req, res) => {
    const filePath = req.query.path;
    const fullPath = path.join(__dirname, '../public', filePath);
    
    try {
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            res.json({
                exists: true,
                content: content,
                path: fullPath
            });
        } else {
            res.json({
                exists: false,
                path: fullPath
            });
        }
    } catch (error) {
        res.json({
            error: error.message,
            path: fullPath
        });
    }
});

// Root path handler
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Route to fetch ads from Facebook's Ad Library API
app.post('/api/fetch-ads', async (req, res) => {
    try {
        const {
            search_terms,
            ad_active_status,
            ad_delivery_date_min,
            ad_reached_countries,
            ad_language,
            fields
        } = req.body;

        // Validate required parameters
        if (!currentAccessToken) {
            throw new Error('Access token not available');
        }

        let allAds = [];
        let nextPageUrl = null;
        const maxAds = 100000; // Set maximum number of ads to fetch
        
        // Construct the initial Facebook API URL
        const baseUrl = 'https://graph.facebook.com/v18.0/ads_archive';
        const queryParams = new URLSearchParams({
            access_token: currentAccessToken,
            search_terms: search_terms || 'all',
            ad_active_status: ad_active_status || 'ALL',
            ad_delivery_date_min: ad_delivery_date_min || '',
            ad_reached_countries: ad_reached_countries ? `["${ad_reached_countries}"]` : '',
            ad_type: 'ALL',
            fields: fields || 'ad_creation_time,page_name,ad_snapshot_url,eu_total_reach',
            languages: ad_language ? `["${ad_language}"]` : '',
            limit: '25000'
        });

        // Remove empty parameters
        Array.from(queryParams.entries()).forEach(([key, value]) => {
            if (!value) queryParams.delete(key);
        });

        let currentUrl = `${baseUrl}?${queryParams.toString()}`;
        
        while (currentUrl && allAds.length < maxAds) {
            console.log(`Fetching ads (current total: ${allAds.length})`);
            
            const response = await axios.get(currentUrl, {
                timeout: 30000,
                validateStatus: status => status < 500
            });

            if (response.data.error) {
                console.error('Facebook API Error:', response.data.error);
                throw new Error(response.data.error.message || 'Facebook API Error');
            }

            const timestamp = new Date().toISOString();
            const enrichedData = response.data.data.map(ad => ({
                ...ad,
                search_timestamp: timestamp,
                id: ad.id || crypto.randomUUID()
            }));

            allAds = allAds.concat(enrichedData);

            // Check if there's a next page
            nextPageUrl = response.data.paging?.next;
            if (!nextPageUrl) break;

            currentUrl = nextPageUrl;

            // Optional: Add a small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`Total ads fetched: ${allAds.length}`);

        res.json({
            data: allAds,
            total: allAds.length,
            hasMore: !!nextPageUrl
        });

    } catch (error) {
        console.error('Error fetching ads:', error);
        
        // Determine appropriate error message and status
        let statusCode = 500;
        let errorMessage = 'Internal server error';

        if (error.response) {
            // The request was made and the server responded with a status code
            statusCode = error.response.status;
            errorMessage = error.response.data?.error?.message || 'API request failed';
        } else if (error.request) {
            // The request was made but no response was received
            statusCode = 503;
            errorMessage = 'No response from Facebook API';
        } else {
            // Something happened in setting up the request
            statusCode = 400;
            errorMessage = error.message;
        }

        res.status(statusCode).json({
            error: {
                message: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
            }
        });
    }
});

// Route to fetch video URL using Puppeteer
app.post('/api/fetch-video', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(70000);
        
        console.log(`Navigating to ${url}`);
        await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // First try to find video
        let mediaUrl = await page.evaluate(() => {
            const video = document.querySelector('video');
            if (video && video.src) {
                return { url: video.src, type: 'video' };
            }
            
            // If no video, look for the main ad image
            // This selector targets the main ad image specifically
            const adImage = document.querySelector('img.xz62fqu.xh8yej3.x9ybwvh.x19kjcj4');
            if (adImage && adImage.src) {
                return { url: adImage.src, type: 'image' };
            }

            // Fallback to looking for any image in the ad container
            const adContainer = document.querySelector('div.x1ywc1zp.x78zum5.xl56j7k.x1e56ztr.x1277o0a img');
            if (adContainer && adContainer.src) {
                return { url: adContainer.src, type: 'image' };
            }

            return null;
        });

        await browser.close();

        if (!mediaUrl) {
            return res.status(404).json({ error: 'No media URL found' });
        }

        // Ensure URL is absolute
        if (!mediaUrl.url.startsWith('http')) {
            mediaUrl.url = new URL(mediaUrl.url, url).href;
        }

        console.log(`Found ${mediaUrl.type} URL:`, mediaUrl.url);

        // Return appropriate response based on media type
        const response = mediaUrl.type === 'video' 
            ? { videoUrl: mediaUrl.url }
            : { imageUrl: mediaUrl.url };

        res.json(response);

    } catch (error) {
        console.error('Error fetching media:', error);
        res.status(500).json({ 
            error: 'Failed to fetch media URL',
            details: error.message 
        });
    }
});

// Route to download and save video
app.post('/api/download-video', async (req, res) => {
    try {
        const { video_url } = req.body;

        if (!video_url) {
            return res.status(400).json({ error: 'No video URL provided' });
        }

        const videoHash = crypto.createHash('md5').update(video_url).digest('hex');
        const filename = `${videoHash}.mp4`;
        const filepath = path.join(UPLOAD_FOLDER, filename);

        if (fs.existsSync(filepath)) {
            return res.json({ video_url: `/static/videos/${filename}` });
        }

        const response = await axios({
            method: 'get',
            url: video_url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            res.json({ video_url: `/static/videos/${filename}` });
        });

        writer.on('error', (error) => {
            console.error('Error saving video:', error);
            res.status(500).json({ error: 'Failed to save video' });
        });

    } catch (error) {
        console.error('Error downloading video:', error);
        res.status(500).json({ error: 'Failed to download video' });
    }
});

// Save search parameters and results
app.post('/api/save-search', async (req, res) => {
    try {
        const searchData = req.body;
        if (!searchData || !searchData.name || !searchData.fetchTimestamp) {
            return res.status(400).json({ message: 'Invalid search data' });
        }

        const filename = `search_${Date.now()}.json`;
        const filePath = path.join(SAVED_SEARCHES_DIR, filename);

        // Ensure both timestamps are present
        const dataToSave = {
            ...searchData,
            fetchTimestamp: searchData.fetchTimestamp,
            saveTimestamp: new Date().toISOString()
        };

        await fs.promises.writeFile(
            filePath,
            JSON.stringify(dataToSave, null, 2),
            'utf8'
        );

        res.json({ 
            message: 'Search saved successfully',
            id: filename.replace('.json', '')
        });
    } catch (error) {
        console.error('Error saving search:', error);
        res.status(500).json({ message: 'Failed to save search' });
    }
});
app.get('/api/saved-searches/:id', (req, res) => {
    try {
        let searchId = req.params.id;
        
        // Ensure proper filename format
        if (!searchId.startsWith('search_')) {
            searchId = `search_${searchId}`;
        }
        if (!searchId.endsWith('.json')) {
            searchId = `${searchId}.json`;
        }

        const filepath = path.join(SAVED_SEARCHES_DIR, searchId);
        
        console.log('Looking for saved search file:', filepath);
        
        if (!fs.existsSync(filepath)) {
            console.log('File not found:', filepath);
            return res.status(404).json({ error: 'Search not found' });
        }
        
        const fileContent = fs.readFileSync(filepath, 'utf8');
        const searchData = JSON.parse(fileContent);
        
        console.log('Successfully loaded search data');
        res.json(searchData);
        
    } catch (error) {
        console.error('Error loading search:', error);
        res.status(500).json({ error: 'Failed to load search' });
    }
});

app.get('/api/saved-searches', (req, res) => {
    try {
        const files = fs.readdirSync(SAVED_SEARCHES_DIR);
        const searches = files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                try {
                    const filepath = path.join(SAVED_SEARCHES_DIR, file);
                    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    return {
                        id: file.replace('.json', ''),
                        name: data.name || 'Unnamed Search',
                        fetchTimestamp: data.fetchTimestamp,
                        saveTimestamp: data.saveTimestamp,
                        parameters: data.parameters || {},
                        results: Array.isArray(data.results) ? data.results : []
                    };
                } catch (error) {
                    console.warn(`Error processing file ${file}:`, error);
                    return null;
                }
            })
            .filter(search => search !== null);
        
        res.json(searches);
    } catch (error) {
        console.error('Error loading searches:', error);
        res.status(500).json({ error: 'Failed to load searches' });
    }
});
app.delete('/api/saved-searches/:id', (req, res) => {
    try {
        const filepath = path.join(SAVED_SEARCHES_DIR, req.params.id);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Search not found' });
        }
    } catch (error) {
        console.error('Error deleting search:', error);
        res.status(500).json({ error: 'Failed to delete search' });
    }
});

// Add new endpoints for permanent filter management
app.post('/api/perma-filter', (req, res) => {
    try {
        const { pageName } = req.body;
        if (!pageName) {
            return res.status(400).json({ error: 'Page name is required' });
        }

        const filterData = JSON.parse(fs.readFileSync(PERMA_FILTER_FILE, 'utf8'));
        
        // Add page if it's not already in the list
        if (!filterData.pages.includes(pageName)) {
            filterData.pages.push(pageName);
            fs.writeFileSync(PERMA_FILTER_FILE, JSON.stringify(filterData, null, 2));
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding to permanent filter:', error);
        res.status(500).json({ error: 'Failed to add to permanent filter' });
    }
});

app.get('/api/perma-filter', (req, res) => {
    try {
        const filterData = JSON.parse(fs.readFileSync(PERMA_FILTER_FILE, 'utf8'));
        res.json(filterData);
    } catch (error) {
        console.error('Error reading permanent filter:', error);
        res.status(500).json({ error: 'Failed to read permanent filter' });
    }
});

// Add this endpoint alongside your other perma-filter endpoints
app.post('/api/perma-filter/remove', (req, res) => {
    try {
        const { pageName } = req.body;
        if (!pageName) {
            return res.status(400).json({ error: 'Page name is required' });
        }

        const filterData = JSON.parse(fs.readFileSync(PERMA_FILTER_FILE, 'utf8'));
        filterData.pages = filterData.pages.filter(page => page !== pageName);
        fs.writeFileSync(PERMA_FILTER_FILE, JSON.stringify(filterData, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing from permanent filter:', error);
        res.status(500).json({ error: 'Failed to remove from permanent filter' });
    }
});

// Add this new endpoint
app.get('/api/current-token', (req, res) => {
    res.json({ token: currentAccessToken });
});

// First, add all API routes
app.post('/extract', async (req, res) => {
    const logs = [];
    const logMessage = (type, message, details = null) => {
        let sanitizedDetails = null;
        if (details) {
            try {
                if (type === 'SUCCESS') {
                    const { logs, ...otherDetails } = details;
                    sanitizedDetails = otherDetails;
                } else {
                    sanitizedDetails = JSON.parse(JSON.stringify(details));
                }
            } catch (e) {
                sanitizedDetails = String(details);
            }
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            message,
            details: sanitizedDetails
        };
        logs.push(logEntry);
        console.log(`[${type}] ${message}`, sanitizedDetails || '');
    };

    try {
        const { url } = req.body;
        logMessage('INFO', 'Starting media extraction', { url });

        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        page.on('console', msg => {
            logMessage('BROWSER', msg.text());
        });
        
        const videoUrls = new Set();
        let lastVideoUrl = null;

        const isVideoUrl = (url) => {
            return url.includes('/t42.1790-2/') &&
                   (url.includes('.mp4') || url.includes('_n.?'));
        };
        
        await page.setRequestInterception(true);
        
        // Set up network listeners for video
        page.on('request', request => {
            const url = request.url();
            if (isVideoUrl(url)) {
                logMessage('VIDEO_REQUEST', 'Video URL intercepted', { url });
                videoUrls.add(url);
                lastVideoUrl = url;
            }
            request.continue();
        });
        
        page.on('response', async response => {
            const url = response.url();
            if (isVideoUrl(url)) {
                logMessage('VIDEO_RESPONSE', 'Video response received', { url });
                videoUrls.add(url);
                lastVideoUrl = url;
            }
        });

        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Navigate to page and wait for content to load
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Check if there's a video element (without waiting)
        const hasVideo = await page.$('video');
        
        if (hasVideo) {
            // Video handling logic
            await page.waitForSelector('video', { timeout: 5000 });
            
            // Get initial video source
            const initialSrc = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video ? video.src : null;
            });

            // Set up MutationObserver for video source changes
            await page.evaluate(() => {
                window.videoSourceChanged = false;
                const video = document.querySelector('video');
                if (video) {
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                                window.videoSourceChanged = true;
                            }
                        });
                    });
                    observer.observe(video, { attributes: true });
                }
            });

            // Try to click play button and access quality settings
            await page.evaluate(async () => {
                const wait = (ms) => new Promise(r => setTimeout(r, ms));
                const clickElement = async (selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.click();
                        await wait(1000);
                        return true;
                    }
                    return false;
                };

                await clickElement('div[aria-label="Play Video"]') ||
                await clickElement('[data-testid="video_player_play_button"]') ||
                await clickElement('.play_button');

                // Try to access quality settings
                const settingsButton = document.querySelector('div[aria-label="Settings"]');
                if (settingsButton) {
                    settingsButton.click();
                    await wait(1000);

                    const qualityButtons = Array.from(document.querySelectorAll('div[role="button"]'))
                        .filter(el => el.textContent.toLowerCase().includes('quality'));
                    
                    if (qualityButtons.length > 0) {
                        qualityButtons[0].click();
                        await wait(1000);

                        const hdOption = Array.from(document.querySelectorAll('div[role="button"]'))
                            .find(el => el.textContent.toLowerCase().includes('hd'));
                        
                        if (hdOption) {
                            hdOption.click();
                            await wait(1000);
                        }
                    }
                }
            });

            // Wait for any new video URLs
            await new Promise(resolve => setTimeout(resolve, 3000));

            const urls = Array.from(videoUrls);
            const hdUrl = urls.find(url => url.includes('_n.?') || url.includes('high'));
            const sdUrl = urls.find(url => url.includes('.mp4'));

            logMessage('SUCCESS', 'Video extraction completed', { hdUrl, sdUrl });
            await browser.close();
            
            res.json({
                sdUrl,
                hdUrl,
                allUrls: urls,
                logs
            });
        } else {
            // Image handling logic
            const imageUrl = await page.evaluate(() => {
                const adImage = document.querySelector('img.xz62fqu.xh8yej3.x9ybwvh.x19kjcj4');
                if (adImage && adImage.src) {
                    return adImage.src;
                }
                
                const adContainer = document.querySelector('div.x1ywc1zp.x78zum5.xl56j7k.x1e56ztr.x1277o0a img');
                return adContainer ? adContainer.src : null;
            });

            if (imageUrl) {
                logMessage('SUCCESS', 'Image URL found', { imageUrl });
                await browser.close();
                res.json({
                    imageUrl,
                    logs
                });
            } else {
                throw new Error('No media content found');
            }
        }

    } catch (error) {
        logMessage('ERROR', 'Error occurred during extraction', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Could not fetch media URL. ' + error.message,
            stack: error.stack,
            logs
        });
    }
});

// Then add other API routes...
app.get('/proxy-download', async (req, res) => {
    try {
        const { url, filename } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const response = await axios({
            method: 'GET',
            url: decodeURIComponent(url),
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Set appropriate Content-Type based on filename
        const isVideo = filename.toLowerCase().endsWith('.mp4');
        res.setHeader('Content-Type', isVideo ? 'video/mp4' : 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Pipe the video stream to response
        response.data.pipe(res);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download video' });
    }
});

// Add logging middleware for JavaScript files
app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
        const filePath = path.join(__dirname, '../public', req.url);
        console.log('Serving JS file:', req.url);
        console.log('File exists:', fs.existsSync(filePath));
        if (fs.existsSync(filePath)) {
            console.log('File content preview:', fs.readFileSync(filePath, 'utf8').substring(0, 100));
        }
    }
    next();
});

// Place this after all API routes
app.get('*', (req, res, next) => {
    // Check if it's an API request
    if (req.path.startsWith('/api/')) {
        return next();
    }
    
    // Check if the requested file exists
    const filePath = path.join(PUBLIC_DIR, req.path);
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return res.sendFile(filePath);
        }
    } catch (error) {
        console.error('Error checking file:', error);
    }
    
    // If not an API request and file doesn't exist, serve index.html
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).send('Error loading page');
        }
    });
});

// Global error handler - keep at the very end
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Debug middleware for static files
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Add a new route to update the server's token
app.post('/api/update-server-token', (req, res) => {
    const { newToken } = req.body;
    if (!newToken) {
        return res.status(400).json({ error: 'No token provided' });
    }
    
    currentAccessToken = newToken;
    res.json({ success: true, message: 'Server token updated successfully' });
});

// Start server
const PORT = process.env.PORT || 5004;

async function refreshLongLivedToken() {
    try {
        // Use currentAccessToken instead of process.env.FB_ACCESS_TOKEN
        const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.App_ID,
                client_secret: process.env.App_secret,
                fb_exchange_token: currentAccessToken
            }
        });

        const newToken = response.data.access_token;
        
        // Update both the environment variable and the currentAccessToken
        process.env.FB_ACCESS_TOKEN = newToken;
        currentAccessToken = newToken;
        
        // Update the .env file
        const envPath = path.join(__dirname, '.env');
        const envContent = await fs.promises.readFile(envPath, 'utf8');
        const updatedContent = envContent.replace(
            /FB_ACCESS_TOKEN=.*/,
            `FB_ACCESS_TOKEN=${newToken}`
        );
        await fs.promises.writeFile(envPath, updatedContent);
        
        console.log('Facebook token refreshed successfully');
    } catch (error) {
        console.error('Error refreshing Facebook token:', error);
    }
}

// Modify your server startup
const startServer = async () => {
    try {
        currentAccessToken = process.env.FB_ACCESS_TOKEN;
        console.log('Starting server with token:', currentAccessToken ? 'Token present' : 'No token');
        
        await refreshLongLivedToken();
        
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log('Current access token:', currentAccessToken ? 'Token present' : 'No token');
            console.log(`Server is serving files from: ${PUBLIC_DIR}`);
            
            // Log directory structure
            const indexPath = path.join(PUBLIC_DIR, 'index.html');
            const appJsPath = path.join(PUBLIC_DIR, 'js/pages/ResultsPage/ResultsPage.js');
            
            console.log('Directory structure check:');
            console.log(`- public directory exists: ${fs.existsSync(PUBLIC_DIR)}`);
            console.log(`- index.html exists: ${fs.existsSync(indexPath)}`);
            console.log(`- ResultsPage.js exists: ${fs.existsSync(appJsPath)}`);
            
            // List files in public directory
            if (fs.existsSync(PUBLIC_DIR)) {
                console.log('\nFiles in public directory:');
                const listDir = (dir, prefix = '') => {
                    const items = fs.readdirSync(dir);
                    items.forEach(item => {
                        const fullPath = path.join(dir, item);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            console.log(`${prefix}📁 ${item}/`);
                            listDir(fullPath, prefix + '  ');
                        } else {
                            console.log(`${prefix}📄 ${item}`);
                        }
                    });
                };
                listDir(PUBLIC_DIR);
            }
        });
    } catch (error) {
        console.error('Server startup error:', error);
    }
};

// Call startServer instead of app.listen
startServer();
