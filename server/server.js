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
app.use(cors());

// Add middleware for proper MIME types
app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }
    next();
});

// Serve static files
app.use('/', express.static(path.join(__dirname, '../public')));

// Debug middleware
app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);
    console.log(`Looking for file: ${path.join(__dirname, '../public', req.url)}`);
    next();
});

// Define important directory paths
const UPLOAD_FOLDER = path.join(__dirname, '../static/videos');
const DATA_DIR = path.join(__dirname, '..', 'data');
const SAVED_SEARCHES_DIR = path.join(DATA_DIR, 'saved_searches');
const PERMA_FILTER_FILE = path.join(DATA_DIR, 'perma_filter.json');

// Create directories if they don't exist
[UPLOAD_FOLDER, DATA_DIR, SAVED_SEARCHES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Initialize perma_filter.json if it doesn't exist
if (!fs.existsSync(PERMA_FILTER_FILE)) {
    fs.writeFileSync(PERMA_FILTER_FILE, JSON.stringify({ pages: [] }));
}

// Add this near the top after imports
let currentAccessToken = process.env.FB_ACCESS_TOKEN;

// Add this right after to ensure the token is loaded
console.log('Initial access token loaded:', currentAccessToken ? 'Yes' : 'No');

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
        
        // Set a reasonable timeout
        await page.setDefaultNavigationTimeout(70000);
        
        // Enable request interception to capture video URLs
        await page.setRequestInterception(true);
        
        let videoUrl = null;
        
        page.on('request', request => {
            const url = request.url();
            if (url.includes('.mp4') || url.includes('video')) {
                videoUrl = url;
            }
            request.continue();
        });

        console.log(`Navigating to ${url}`);
        await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // If we didn't catch the video URL through requests, try to find it in the DOM
        if (!videoUrl) {
            videoUrl = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video ? video.src : null;
            });
        }

        await browser.close();

        if (!videoUrl) {
            return res.status(404).json({ error: 'No video URL found' });
        }

        res.json({ videoUrl });
    } catch (error) {
        console.error('Error fetching video:', error);
        res.status(500).json({ 
            error: 'Failed to fetch video URL',
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

// Add a catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
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
        // Ensure currentAccessToken is set before refresh attempt
        currentAccessToken = process.env.FB_ACCESS_TOKEN;
        console.log('Starting server with token:', currentAccessToken ? 'Token present' : 'No token');
        
        // Attempt to refresh token
        await refreshLongLivedToken();
        
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log('Current access token:', currentAccessToken ? 'Token present' : 'No token');
        });
    } catch (error) {
        console.error('Server startup error:', error);
    }
};

// Call startServer instead of app.listen
startServer();

