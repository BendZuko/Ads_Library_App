// Required packages for the server
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer');
const crypto = require('crypto');

const app = express();

// Configure server middleware
app.use(express.json());
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
const DATA_FOLDER = path.join(__dirname, '../data');
const SAVED_SEARCHES_DIR = path.join(DATA_FOLDER, 'saved_searches');

// Create directories if they don't exist
[UPLOAD_FOLDER, DATA_FOLDER, SAVED_SEARCHES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Route to fetch ads from Facebook's Ad Library API
app.post('/api/fetch-ads', async (req, res) => {
    try {
        const {
            access_token,
            search_terms,
            ad_active_status,
            ad_delivery_date_min,
            ad_reached_countries,
            ad_language,
            fields
        } = req.body;

        if (!access_token) {
            return res.status(400).json({ error: { message: 'Access token is required' }});
        }

        let allAds = [];
        let pageCount = 0;
        
        // Construct initial URL with parameters
        let baseUrl = 'https://graph.facebook.com/v18.0/ads_archive';
        let params = new URLSearchParams({
            access_token,
            search_terms: search_terms || '',
            ad_active_status: ad_active_status || 'ALL',
            ad_delivery_date_min: ad_delivery_date_min || '',
            ad_reached_countries: ad_reached_countries || '',
            languages: ad_language ? [ad_language] : [],
            fields: fields || '',
        });

        let nextPage = `${baseUrl}?${params.toString()}`;
        console.log('Initial URL:', nextPage);

        while (nextPage && pageCount < 10) {
            pageCount++;
            console.log(`\nFetching page ${pageCount}...`);
            
            try {
                // Always ensure ad_language is in the URL
                const currentUrl = new URL(nextPage);
                if (ad_language) {
                    currentUrl.searchParams.set('languages', [ad_language]);
                }
                nextPage = currentUrl.toString();
                
                const response = await axios.get(nextPage);
                
                if (!response.data || !response.data.data) {
                    console.error('Invalid response:', response.data);
                    break;
                }

                const pageAds = response.data.data;
                console.log(`Page ${pageCount}: Retrieved ${pageAds.length} ads`);
                allAds = [...allAds, ...pageAds];
                
                // Get next page URL and ensure it includes ad_language
                nextPage = response.data.paging?.next || null;
                if (nextPage) {
                    const nextUrl = new URL(nextPage);
                    if (ad_language) {
                        nextUrl.searchParams.set('languages', [ad_language]);
                    }
                    nextPage = nextUrl.toString();
                }
                
                console.log('Next page URL:', nextPage);

                if (!nextPage) {
                    console.log('No more pages to fetch');
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error fetching page ${pageCount}:`, error.response?.data || error);
                break;
            }
        }

        console.log('\nFinal response:', {
            totalAds: allAds.length,
            totalPages: pageCount
        });
        
        res.json({
            data: allAds,
            paging: null  // We've already fetched all pages
        });

    } catch (error) {
        console.error('Error in fetch-ads:', error.response?.data || error);
        res.status(error.response?.status || 500).json({ 
            error: {
                message: error.response?.data?.error?.message || 'Failed to fetch ads',
                details: error.response?.data
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
        await page.setDefaultNavigationTimeout(30000);
        
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
app.post('/api/save-search', (req, res) => {
    try {
        const searchData = req.body;
        const filename = `search_${Date.now()}.json`;
        const filepath = path.join(SAVED_SEARCHES_DIR, filename);

        fs.writeFileSync(filepath, JSON.stringify(searchData, null, 2));
        res.json({ success: true, id: filename });
    } catch (error) {
        console.error('Error saving search:', error);
        res.status(500).json({ error: 'Failed to save search' });
    }
});

app.get('/api/saved-searches', (req, res) => {
    try {
        const files = fs.readdirSync(SAVED_SEARCHES_DIR);
        const searches = files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filepath = path.join(SAVED_SEARCHES_DIR, file);
                const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                return { ...data, id: file };
            });
        res.json(searches);
    } catch (error) {
        console.error('Error loading searches:', error);
        res.status(500).json({ error: 'Failed to load searches' });
    }
});

app.get('/api/saved-searches/:id', (req, res) => {
    try {
        const searchId = req.params.id;
        const filepath = path.join(SAVED_SEARCHES_DIR, searchId);
        
        console.log('Attempting to load file:', filepath);
        
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

// Start server
const PORT = process.env.PORT || 5004;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});