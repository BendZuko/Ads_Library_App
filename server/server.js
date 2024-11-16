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
app.use(cors());
app.use(express.json());
// Serve static files from public and static directories
app.use(express.static(path.join(__dirname, '../public')));
app.use('/static', express.static(path.join(__dirname, '../static')));

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

// Debug middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Route to fetch ads from Facebook's Ad Library API
app.post('/api/fetch-ads', async (req, res) => {
    try {
        // Extract query parameters
        const {
            access_token,
            search_terms,
            ad_active_status,
            ad_delivery_date_min,
            ad_reached_countries,
            fields
        } = req.body;

        if (!access_token) {
            return res.status(400).json({ error: { message: 'Access token is required' }});
        }

        // Create URL parameters
        const params = new URLSearchParams({
            access_token,
            search_terms,
            ad_active_status,
            ad_delivery_date_min,
            ad_reached_countries,
            fields
        });

        // Logging (with hidden token for security)
        console.log('Making request to Facebook API with params:', {
            ...Object.fromEntries(params),
            access_token: '***hidden***'
        });

        const response = await axios.get(
            `https://graph.facebook.com/v18.0/ads_archive?${params.toString()}`
        );

        console.log('Received response with', response.data.data?.length || 0, 'ads');
        
        res.json(response.data);

    } catch (error) {
        console.error('Error fetching ads:', error.response?.data || error);
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
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        console.log(`Navigating to ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2' });

        const videoUrl = await page.evaluate(() => {
            const video = document.querySelector('video');
            return video ? video.src : null;
        });

        await browser.close();

        if (!videoUrl) {
            return res.status(404).json({ error: 'No video URL found' });
        }

        res.json({ videoUrl });
    } catch (error) {
        console.error('Error fetching video:', error);
        res.status(500).json({ error: 'Failed to fetch video URL' });
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

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5004;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});