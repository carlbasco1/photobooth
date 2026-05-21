const express = require('express');
const fs = require('fs').promises;
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const multer = require('multer');
const os = require('os');

const app = express();

app.use(express.static('public'));
app.use(express.json({ limit: '200mb' }));

const tempDir = path.join(__dirname, 'temp');
const assetsDir = path.join(__dirname, 'public', 'assets');
const galleriesDir = path.join(__dirname, 'public', 'galleries');
if (!existsSync(tempDir)) mkdirSync(tempDir);
if (!existsSync(assetsDir)) mkdirSync(assetsDir);
if (!existsSync(galleriesDir)) mkdirSync(galleriesDir);

const upload = multer({ dest: tempDir, limits: { fieldSize: 200 * 1024 * 1024 } });
const adminUpload = multer({ dest: tempDir });

const settingsFile = path.join(__dirname, 'settings.json');

const defaultSettings = {
    cameraMode: "webcam", // Default to webcam to prevent DSLR hanging
    textColor: "#ff4d6d",
    bgImage: "",
    totalShots: 8,
    captureTimer: 5, 
    frames1x3: [], 
    frames1x4: [],
    frames2x2: [],
    stickers: [],
    marginPresets: {
        '1x3': [{ name: 'Default 1x3', top: 20, bot: 60, side: 20, gap: 15 }],
        '1x4': [{ name: 'Default 1x4', top: 20, bot: 70, side: 20, gap: 15 }],
        '2x2': [{ name: 'Default 2x2', top: 20, bot: 60, side: 20, gap: 15 }]
    },
    layout1x3: { paddingTop: 20, paddingBottom: 60, paddingSide: 20, gap: 15 },
    layout1x4: { paddingTop: 20, paddingBottom: 70, paddingSide: 20, gap: 15 },
    layout2x2: { paddingTop: 20, paddingBottom: 60, paddingSide: 20, gap: 15 }
};

if (!existsSync(settingsFile)) {
    require('fs').writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
}

async function moveFile(oldPath, newPath) {
    try {
        await fs.copyFile(oldPath, newPath);
        await fs.unlink(oldPath);
    } catch (err) {
        console.error(`Failed to move file to ${newPath}:`, err);
    }
}

app.get('/api/settings', async (req, res) => {
    try {
        const data = await fs.readFile(settingsFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json(defaultSettings);
    }
});

app.post('/api/settings', async (req, res) => {
    await fs.writeFile(settingsFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.post('/api/upload-asset', adminUpload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const ext = path.extname(req.file.originalname);
    const filename = `${req.body.assetType}_${Date.now()}${ext}`; 
    const targetPath = path.join(assetsDir, filename);
    
    await moveFile(req.file.path, targetPath);
    res.json({ success: true, url: `/assets/${filename}` });
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) return iface.address; 
            }
        }
    }
    return '127.0.0.1';
}

app.post('/upload', upload.fields([
    { name: 'btsVideo', maxCount: 1 },
    { name: 'finalStrip', maxCount: 1 },
    { name: 'rawPhoto0', maxCount: 1 },
    { name: 'rawPhoto1', maxCount: 1 },
    { name: 'rawPhoto2', maxCount: 1 },
    { name: 'rawPhoto3', maxCount: 1 }
]), async (req, res) => {
    const sessionTime = Date.now();
    const galleryDir = path.join(galleriesDir, `Session_${sessionTime}`);
    
    try {
        await fs.mkdir(galleryDir, { recursive: true });

        if (req.files['finalStrip']) {
            await moveFile(req.files['finalStrip'][0].path, path.join(galleryDir, 'photobooth_strip.jpg'));
        }

        let rawPhotosHtml = '';
        for (let i = 0; i < 4; i++) {
            if (req.files[`rawPhoto${i}`]) {
                const rawFilename = `raw_photo_${i + 1}.jpg`;
                await moveFile(req.files[`rawPhoto${i}`][0].path, path.join(galleryDir, rawFilename));
                rawPhotosHtml += `
                <div class="raw-item">
                    <img src="${rawFilename}" alt="Raw Photo ${i + 1}">
                    <a href="${rawFilename}" download="${rawFilename}" class="download-btn small-btn">Save Photo</a>
                </div>`;
            }
        }

        let videoFilename = '';
        if (req.files['btsVideo']) {
            videoFilename = req.files['btsVideo'][0].originalname;
            await moveFile(req.files['btsVideo'][0].path, path.join(galleryDir, videoFilename));
        }

        const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Your Photobooth Session</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap');
                body { margin: 0; padding: 20px; font-family: 'Nunito', sans-serif; background: linear-gradient(135deg, #fff0f3 0%, #ffccd5 100%); color: #4a4a4a; text-align: center; }
                h1 { color: #ff4d6d; margin-bottom: 5px; font-size: 2.5rem;}
                p.subtitle { margin-top: 0; margin-bottom: 30px; font-weight: bold; color: #666;}
                .container { max-width: 500px; margin: 0 auto; background: rgba(255,255,255,0.6); padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                img, video { width: 100%; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); display: block;}
                .download-btn { display: inline-block; background: #ff4d6d; color: white; text-decoration: none; padding: 15px 0; width: 100%; border-radius: 30px; font-weight: bold; margin-bottom: 40px; font-size: 1.1rem; box-sizing: border-box;}
                .download-btn.small-btn { padding: 10px 0; font-size: 0.9rem; margin-bottom: 0; }
                h3 { margin-top: 10px; color: #333; text-transform: uppercase; letter-spacing: 1px;}
                .raw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
                .raw-item { background: rgba(255,255,255,0.7); padding: 10px; border-radius: 15px; display: flex; flex-direction: column; justify-content: space-between;}
                .raw-item img { margin-bottom: 10px; box-shadow: none; border-radius: 5px;}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Your Photos! 📸</h1>
                <p class="subtitle">Download your memories below.</p>
                
                ${videoFilename ? `
                <h3>Animated Strip</h3>
                <video src="${videoFilename}" autoplay loop muted playsinline></video>
                <a href="${videoFilename}" download="${videoFilename}" class="download-btn">Download Video</a>
                ` : ''}
                
                <h3>Photobooth Strip</h3>
                <img src="photobooth_strip.jpg" alt="Your Strip">
                <a href="photobooth_strip.jpg" download="photobooth_strip.jpg" class="download-btn">Download Strip</a>

                ${rawPhotosHtml ? `
                <h3>Original Raw Shots</h3>
                <div class="raw-grid">${rawPhotosHtml}</div>
                ` : ''}
            </div>
        </body>
        </html>`;
        
        await fs.writeFile(path.join(galleryDir, 'index.html'), htmlTemplate);

        const hostHeader = req.get('host') || '';
        let galleryHost = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1') ? `${getLocalIp()}:3000` : hostHeader;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const galleryUrl = `${protocol}://${galleryHost}/galleries/Session_${sessionTime}/index.html`;
        
        const qrCodeDataUrl = await QRCode.toDataURL(galleryUrl, { color: { dark: '#ff4d6d', light: '#ffffff' }, width: 400 });
        res.json({ success: true, qrCodeUrl: qrCodeDataUrl });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- UPGRADED GALLERY & SESSIONS API (Safe Version) ---
app.get('/api/sessions', async (req, res) => {
    try {
        // 1. Check if the galleries folder even exists yet
        if (!existsSync(galleriesDir)) {
            return res.json({ success: true, sessions: [] }); // Return empty array safely
        }

        const dirs = await fs.readdir(galleriesDir);
        const sessions = [];
        
        for (const dir of dirs) {
            // 2. Make sure we are only looking at directories, not random files
            const fullPath = path.join(galleriesDir, dir);
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
                const stripPath = path.join(fullPath, 'photobooth_strip.jpg');
                
                // 3. Only add the session if the final strip actually exists inside
                if (existsSync(stripPath)) {
                    const rawPhotos = [];
                    // Find all raw photos saved in this session's folder
                    for (let i = 1; i <= 4; i++) {
                        if (existsSync(path.join(fullPath, `raw_photo_${i}.jpg`))) {
                            rawPhotos.push(`/galleries/${dir}/raw_photo_${i}.jpg`);
                        }
                    }
                    
                    sessions.push({
                        id: dir,
                        strip: `/galleries/${dir}/photobooth_strip.jpg`,
                        rawPhotos: rawPhotos
                    });
                }
            }
        }
        
        // Sort by newest first
        sessions.sort((a, b) => b.id.localeCompare(a.id));
        res.json({ success: true, sessions });
        
    } catch (error) {
        console.error("Gallery Fetch Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const frontendRoutes = ['/', '/start', '/layout', '/photo', '/select', '/results', '/qr'];
app.get(frontendRoutes, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const { exec } = require('child_process');

app.post('/api/capture-dslr', async (req, res) => {
    const filename = `dslr_${Date.now()}.jpg`;
    const targetPath = path.join(assetsDir, filename);

    const cmd = `"C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe" /capture /filename "${targetPath}"`;

    console.log("📸 Triggering Windows DSLR...");
    exec(cmd, async (error, stdout, stderr) => {
        try {
            const stats = await fs.stat(targetPath);
            if (stats.size > 0) {
                console.log("✅ DSLR Photo captured and verified.");
                res.json({ success: true, imageUrl: `/assets/${filename}` });
            } else {
                throw new Error("File is empty (0 bytes). DSLR misfired.");
            }
        } catch (err) {
            console.error(`DSLR Fallback Triggered: ${err.message || error.message}`);
            res.status(500).json({ success: false, error: 'Failed to capture from DSLR' });
        }
    });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`📸 Photobooth Running! Connect to: http://${getLocalIp()}:${PORT}`);
    console.log(`===========================================`);
});