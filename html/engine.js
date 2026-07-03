const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Game State
let isPlaying = false;
let gameSpeed = 10;
let timeline = [];
let currentRepoName = '';
let currentIndex = 0;
let currentTime = 0; // Simulated timestamp
let lastFrameTime = 0;
let score = 0;
let totalCommits = 0;
let activePlayers = new Set();
let activeTracks = new Set();
let allRepoTracks = [];

// Entities
let stars = [];
let ships = new Map(); // branchName -> { x, targetX, y, color, avatarUrl, active }
let lasers = []; // { x, y, tx, ty, color, size, life }
let explosions = []; // { x, y, size, life, color }
let tagLines = []; // { y, text, life }
let avatars = new Map(); // avatarUrl -> HTMLImageElement

const mainShipImage = new Image();
let processedShipCanvas = null;
mainShipImage.onload = () => {
    const tmp = document.createElement('canvas');
    tmp.width = mainShipImage.width;
    tmp.height = mainShipImage.height;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(mainShipImage, 0, 0);
    const idata = tctx.getImageData(0, 0, tmp.width, tmp.height);
    for (let i = 0; i < idata.data.length; i += 4) {
        // Remove black or very dark background pixels
        if (idata.data[i] < 30 && idata.data[i+1] < 30 && idata.data[i+2] < 30) {
            idata.data[i+3] = 0; 
        }
    }
    tctx.putImageData(idata, 0, 0);
    processedShipCanvas = tmp;
};
mainShipImage.src = 'main_spaceship.png';

// Time UI & Dilation
let dynamicSpeedMultiplier = 1.0;
let activeBranches = 0;
let tractorBeams = []; // { x, y, tx, ty, color, life }

const COLORS = {
    main: '#f0f',
    green: '#0f0',
    red: '#f00',
    cyan: '#0ff',
    yellow: '#ff0',
    orange: '#f80'
};
const SHIP_COLORS = [
    COLORS.cyan, 
    COLORS.yellow, 
    COLORS.orange, 
    '#0f8', // Neon Green
    '#80f', // Neon Purple
    '#ff007f', // Rose/Pink
    '#00ff7f', // Spring Green
    '#7fff00', // Chartreuse
    '#ff00ff', // Magenta
    '#0080ff', // Azure Blue
    '#ff5555'  // Bright Coral
];

function initStars() {
    for(let i=0; i<100; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            speed: 1 + Math.random() * 3,
            size: Math.random() * 2
        });
    }
}

function preScanTimeline(timelineData) {
    const playersMap = new Map(); // email -> { name, email, avatarUrl, color, is_conductor, track, branches: Set }
    const tracksSet = new Set();
    
    timelineData.forEach(event => {
        if (event.track) {
            tracksSet.add(event.track);
        }
        if (event.email) {
            if (!playersMap.has(event.email)) {
                const color = SHIP_COLORS[playersMap.size % SHIP_COLORS.length];
                playersMap.set(event.email, {
                    name: event.author || 'Unknown',
                    email: event.email,
                    avatarUrl: event.avatarUrl,
                    color: color,
                    is_conductor: false,
                    track: null,
                    branches: new Set()
                });
            }
            const player = playersMap.get(event.email);
            player.branches.add(event.branch);
            if (event.is_conductor) {
                player.is_conductor = true;
            }
            if (event.track) {
                player.track = event.track_display || event.track;
            }
        }
    });

    return {
        players: Array.from(playersMap.values()),
        totalTracksCount: tracksSet.size
    };
}

function showBriefing(players, repoName, totalCommitsCount, totalTracksCount) {
    const overlay = document.getElementById('briefingOverlay');
    if (!overlay) return;

    document.getElementById('briefingRepoName').innerText = `REPO: ${repoName}`;
    document.getElementById('briefingCommits').innerText = totalCommitsCount.toLocaleString();
    document.getElementById('briefingPlayers').innerText = players.length;
    document.getElementById('briefingTracks').innerText = totalTracksCount || 0;

    const fleetList = document.getElementById('briefingFleetList');
    fleetList.innerHTML = '';

    players.forEach(player => {
        const badge = player.is_conductor ? '🪄' : '🌿';
        
        let shipSvg = '';
        if (player.is_conductor) {
            shipSvg = `
                <svg class="w-8 h-8 filter drop-shadow-[0_0_5px_currentColor]" viewBox="-15 -40 30 55" style="color: ${player.color}">
                    <rect x="-2" y="-20" width="4" height="30" fill="#b58863" rx="1"/>
                    <circle cx="0" cy="-25" r="6" fill="currentColor"/>
                    <polygon points="0,-35 2,-27 10,-25 2,-23 0,-15 -2,-23 -10,-25 -2,-27" fill="#fff"/>
                </svg>
            `;
        } else {
            shipSvg = `
                <svg class="w-8 h-8 filter drop-shadow-[0_0_5px_currentColor]" viewBox="-25 -35 50 65" style="color: ${player.color}">
                    <polygon points="0,-30 20,10 8,5 15,25 0,20 -15,25 -8,5 -20,10" fill="currentColor"/>
                    <polygon points="0,-10 5,5 -5,5" fill="rgba(255,255,255,0.8)"/>
                </svg>
            `;
        }

        const row = document.createElement('div');
        row.className = "flex items-center justify-between bg-gray-900/60 border border-gray-800 p-3 rounded-lg hover:border-[#0ff]/40 transition-all duration-200";
        row.innerHTML = `
            <div class="flex items-center gap-3 text-left">
                <img class="w-9 h-9 rounded-full border-2 border-gray-700 shadow-md" src="${player.avatarUrl}" alt="${player.name}" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp'">
                <div class="flex flex-col">
                    <span class="text-white text-sm font-bold tracking-wide">${player.name}</span>
                    <span class="text-gray-400 text-xs font-mono select-all">${player.email}</span>
                </div>
            </div>
            <div class="flex items-center gap-4">
                <div class="text-right">
                    <div class="text-[10px] text-gray-500 font-bold uppercase tracking-wider">LATEST TRACK</div>
                    <div class="text-xs font-bold font-mono text-[#0ff]" style="text-shadow: 0 0 3px #0ff;">
                        ${player.track ? `${badge} ${player.track}` : 'None'}
                    </div>
                </div>
                <div class="flex items-center justify-center bg-black/40 p-1.5 rounded border border-gray-800">
                    ${shipSvg}
                </div>
            </div>
        `;
        fleetList.appendChild(row);
    });

    overlay.classList.remove('hidden');
}

async function loadTimeline(repoName) {
    if (!repoName) return;
    currentRepoName = repoName;
    
    // Reset state
    timeline = [];
    currentIndex = 0;
    score = 0;
    totalCommits = 0;
    activePlayers.clear();
    activeTracks.clear();
    allRepoTracks = [];
    ships.clear();
    lasers = [];
    explosions = [];
    tagLines = [];
    isPlaying = false;
    dynamicSpeedMultiplier = 1.0;
    activeBranches = 0;
    tractorBeams = [];
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('scoreDisplay').innerText = '000000';
    document.getElementById('commitsDisplay').innerText = '0';
    document.getElementById('playersDisplay').innerText = '0';
    document.getElementById('tracksDisplay').innerText = '0';
    document.getElementById('dateDisplay').innerText = 'Loading...';

    // Load tracks list first
    try {
        let tracksRes = await fetch(`/api/tracks?repo=${encodeURIComponent(repoName)}&t=${Date.now()}`);
        if (!tracksRes.ok) {
            tracksRes = await fetch(`${repoName}/tracks.json`);
        }
        if (tracksRes.ok) {
            allRepoTracks = await tracksRes.json();
        }
    } catch (e) {
        console.error("Failed to load tracks list", e);
    }

    try {
        let res = await fetch(`/api/timeline?repo=${encodeURIComponent(repoName)}&t=${Date.now()}`);
        
        // Fallback to static deployment path if the API isn't running
        if (!res.ok) {
            res = await fetch(`${repoName}/timeline.json`);
        }
        
        if (!res.ok) {
            throw new Error("Timeline not found");
        }
 
        timeline = await res.json();
        if (timeline && timeline.length > 0) {
            currentTime = new Date(timeline[0].timestamp).getTime();
            document.getElementById('dateDisplay').innerText = timeline[0].timestamp.split('T')[0];
            isPlaying = false; // Do NOT auto-play
            
            // Pre-scan to build player and ship data
            const briefingData = preScanTimeline(timeline);
            showBriefing(briefingData.players, repoName, timeline.length, allRepoTracks.length || briefingData.totalTracksCount);
        } else {
            document.getElementById('dateDisplay').innerText = 'No commits found';
        }
    } catch(e) {
        console.error("Failed to load timeline", e);
        document.getElementById('dateDisplay').innerText = 'Error loading repo';
    }
}

function spawnLaser(fromX, fromY, toX, toY, type, count) {
    const color = type === 'add' ? COLORS.green : COLORS.red;
    const baseSize = type === 'add' ? 3 : 4;
    
    // Scale count log-wise so it doesn't overload
    const visualCount = Math.min(20, Math.ceil(Math.log10(count + 1) * 3));
    
    for(let i=0; i<visualCount; i++) {
        lasers.push({
            x: fromX + (Math.random() - 0.5) * 20,
            y: fromY + (Math.random() - 0.5) * 20,
            tx: toX,
            ty: toY + (Math.random() - 0.5) * 100,
            color: color,
            size: baseSize + Math.random() * 2,
            life: 1.0,
            speed: 5 + Math.random() * 5
        });
    }
}

function spawnExplosion(x, y, color) {
    for(let i=0; i<30; i++) {
        explosions.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            size: 2 + Math.random() * 4,
            life: 1.0,
            color: color
        });
    }
}

function update(dt) {
    if (!isPlaying || timeline.length === 0 || currentIndex >= timeline.length) return;

    // Time Dilation calculation
    let targetSpeed = 1.0;
    if (currentIndex < timeline.length) {
        const nextTime = new Date(timeline[currentIndex].timestamp).getTime();
        const diffDays = (nextTime - currentTime) / (1000 * 60 * 60 * 24);
        if (diffDays > 30) targetSpeed = 8.0; // Warp Speed
        else if (diffDays > 7) targetSpeed = 4.0; // Cruise Speed
        else if (diffDays < 1) targetSpeed = 0.5; // Bullet Time
        else targetSpeed = 1.0;
    }
    
    // Smooth lerp for speed transitions
    dynamicSpeedMultiplier += (targetSpeed - dynamicSpeedMultiplier) * 0.05;

    // Advance time
    const timeStep = dt * (gameSpeed * dynamicSpeedMultiplier) * 100000; 
    currentTime += timeStep;
    
    // Recalculate active branches
    activeBranches = Array.from(ships.values()).filter(s => s.active).length;

    while (currentIndex < timeline.length) {
        const event = timeline[currentIndex];
        const eventTime = new Date(event.timestamp).getTime();
        
        if (eventTime > currentTime) break; // Not yet

        totalCommits++;
        score += (event.added + event.deleted) * 10 + (activeBranches * 100); // Massive score multiplier for complex branches!
        if (event.email) {
            activePlayers.add(event.email);
        }
        if (event.track) {
            activeTracks.add(event.track);
        }
        
        document.getElementById('scoreDisplay').innerText = score.toString().padStart(6, '0');
        document.getElementById('commitsDisplay').innerText = totalCommits;
        document.getElementById('playersDisplay').innerText = activePlayers.size;
        const totalTracksText = allRepoTracks.length ? `${activeTracks.size} / ${allRepoTracks.length}` : activeTracks.size;
        document.getElementById('tracksDisplay').innerText = totalTracksText;
        document.getElementById('dateDisplay').innerText = event.timestamp.split('T')[0];
        document.getElementById('progressBar').style.width = `${(currentIndex / timeline.length) * 100}%`;

        const isMain = event.branch === 'main' || event.branch === 'master';
        const mainX = width / 2;
        const mainY = height * 0.8;

        if (!isMain) {
            const shipKey = event.email || event.author || 'unknown';
            if (!ships.has(shipKey)) {
                const side = Math.random() > 0.5 ? 1 : -1;
                
                // Trigger Avatar Image Load
                if (event.avatarUrl && !avatars.has(event.avatarUrl)) {
                    const img = new Image();
                    img.src = event.avatarUrl;
                    avatars.set(event.avatarUrl, img);
                }

                ships.set(shipKey, {
                    x: mainX + side * (100 + Math.random() * 200),
                    targetX: mainX + side * (150 + Math.random() * 150),
                    y: height * 0.2 + Math.random() * (height * 0.4),
                    color: SHIP_COLORS[ships.size % SHIP_COLORS.length],
                    avatarUrl: event.avatarUrl,
                    is_conductor: event.is_conductor || false,
                    active: true,
                    name: event.author || 'Unknown',
                    branch: event.branch,
                    track: event.track_display || event.track || null
                });
            } else {
                const ship = ships.get(shipKey);
                const wasInactive = !ship.active;
                ship.branch = event.branch;
                if (event.is_conductor) {
                    ship.is_conductor = true;
                }
                if (event.track) {
                    ship.track = event.track_display || event.track;
                }
                ship.active = true;
                if (wasInactive) {
                    const side = Math.random() > 0.5 ? 1 : -1;
                    ship.x = mainX + side * (100 + Math.random() * 200);
                    ship.targetX = mainX + side * (150 + Math.random() * 150);
                    ship.y = height * 0.2 + Math.random() * (height * 0.4);
                }
            }

            const ship = ships.get(shipKey);
            
            if (event.is_merge) {
                ship.targetX = mainX;
                ship.y += 100; // dive
                
                const googleColors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];
                tractorBeams.push({
                    x: ship.x, y: ship.y,
                    tx: mainX, ty: mainY - 30, // shoot from top of mothership
                    color: googleColors[Math.floor(Math.random() * googleColors.length)],
                    life: 1.0
                });
                ship.active = false;
            } else {
                if (event.added > 0) spawnLaser(ship.x, ship.y, mainX, mainY - 30, 'add', event.added);
                if (event.deleted > 0) spawnLaser(ship.x, ship.y, mainX, mainY - 30, 'del', event.deleted);
            }
        }

        currentIndex++;
    }

    // Update stars (scaled by dynamic speed)
    stars.forEach(s => {
        s.y += s.speed * (gameSpeed * dynamicSpeedMultiplier / 10);
        if (s.y > height) {
            s.y = 0;
            s.x = Math.random() * width;
        }
    });

    // Update ships
    ships.forEach((ship, branch) => {
        if (ship.active) {
            ship.x += (ship.targetX - ship.x) * 0.05;
            ship.y += Math.sin(Date.now() / 500) * 0.5;
        }
    });

    // Update lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
        let l = lasers[i];
        const dx = l.tx - l.x;
        const dy = l.ty - l.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < l.speed) {
            lasers.splice(i, 1);
            continue;
        }

        l.x += (dx / dist) * l.speed;
        l.y += (dy / dist) * l.speed;
        l.life -= 0.02;
        if (l.life <= 0) lasers.splice(i, 1);
    }

    // Update explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        let e = explosions[i];
        e.x += e.vx;
        e.y += e.vy;
        e.life -= 0.05;
        if (e.life <= 0) explosions.splice(i, 1);
    }

    // Update Tractor Beams
    for (let i = tractorBeams.length - 1; i >= 0; i--) {
        let b = tractorBeams[i];
        b.life -= 0.015 * (gameSpeed * dynamicSpeedMultiplier / 10);
        if (b.life <= 0) tractorBeams.splice(i, 1);
    }
}

function draw() {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#fff';
    stars.forEach(s => {
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1.0;
    
    const mainX = width / 2;
    const mainY = height * 0.8;
    
    // Draw Time Grid Lines (Mathematically Absolute)
    const msPerDay = 1000 * 60 * 60 * 24;
    const pixelsPerDay = 5; 
    
    const msToTop = (mainY / pixelsPerDay) * msPerDay;
    const msToBottom = ((height - mainY) / pixelsPerDay) * msPerDay;
    const startTime = currentTime - msToBottom;
    const endTime = currentTime + msToTop;
    
    const startD = new Date(startTime);
    
    // Draw Months
    let dMonth = new Date(startD.getFullYear(), startD.getMonth(), 1);
    while (dMonth.getTime() < endTime) {
        const diffMs = dMonth.getTime() - currentTime;
        const y = mainY - (diffMs / msPerDay) * pixelsPerDay;
        
        ctx.fillStyle = 'rgba(0, 255, 255, 0.15)'; 
        ctx.fillRect(0, y, width, 4);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.font = '24px "Share Tech Mono"';
        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        ctx.fillText(`${monthNames[dMonth.getMonth()]} ${dMonth.getFullYear()}`, 30, y - 10);
        
        dMonth.setMonth(dMonth.getMonth() + 1);
    }
    
    // Draw Days
    let dDay = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate());
    while (dDay.getTime() < endTime) {
        const diffMs = dDay.getTime() - currentTime;
        const y = mainY - (diffMs / msPerDay) * pixelsPerDay;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(0, y, width, 1);
        dDay.setDate(dDay.getDate() + 1);
    }

    // Draw Main Ship Sprite
    if (processedShipCanvas) {
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#0ff';
        // Sprite is large, draw it centered
        const sW = 120;
        const sH = 120;
        ctx.drawImage(processedShipCanvas, mainX - sW/2, mainY - sH/2, sW, sH);
        ctx.restore();
    }

    lasers.forEach(l => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = l.color;
        ctx.fillStyle = l.color;
        ctx.globalAlpha = l.life;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.size, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.globalAlpha = 1.0;
    ships.forEach((ship, branch) => {
        // Calculate angle pointing towards main (target where they shoot lasers)
        const dx = mainX - ship.x;
        const dy = (height * 0.8) - ship.y;
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(angle);

        ctx.shadowBlur = 15;
        ctx.shadowColor = ship.color;
        
        // Draw Graphic (Wand vs Ship)
        if (ship.is_conductor) {
            // Magic Wand
            ctx.fillStyle = '#b58863'; // Wood handle
            ctx.fillRect(-2, -20, 4, 30);
            
            // Glowing star tip
            ctx.fillStyle = ship.color;
            ctx.beginPath();
            ctx.arc(0, -25, 6, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(0, -35); ctx.lineTo(2, -27);
            ctx.lineTo(10, -25); ctx.lineTo(2, -23);
            ctx.lineTo(0, -15); ctx.lineTo(-2, -23);
            ctx.lineTo(-10, -25); ctx.lineTo(-2, -27);
            ctx.closePath();
            ctx.fill();
        } else {
            // Elaborate spaceship (Gyruss style)
            ctx.fillStyle = ship.color;
            ctx.beginPath();
            ctx.moveTo(0, -30); // nose
            ctx.lineTo(20, 10);  // right wing tip
            ctx.lineTo(8, 5);   // right inner wing
            ctx.lineTo(15, 25);  // right engine
            ctx.lineTo(0, 20);   // engine exhaust center
            ctx.lineTo(-15, 25); // left engine
            ctx.lineTo(-8, 5);  // left inner wing
            ctx.lineTo(-20, 10); // left wing tip
            ctx.closePath();
            ctx.fill();

            // Cockpit
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(5, 5);
            ctx.lineTo(-5, 5);
            ctx.fill();
        }
        ctx.restore();

        // Draw Gravatar Avatar (2x size)
        if (ship.avatarUrl) {
            const img = avatars.get(ship.avatarUrl);
            if (img && img.complete) {
                ctx.save();
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(ship.x, ship.y + 45, 24, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, ship.x - 24, ship.y + 21, 48, 48);
                ctx.restore();
                
                ctx.beginPath();
                ctx.arc(ship.x, ship.y + 45, 24, 0, Math.PI * 2);
                ctx.strokeStyle = ship.color;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }

        // Badge (Conductor Wand emoji vs Branch Leaf emoji)
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = ship.color;
        ctx.lineWidth = 2;
        
        const titleText = ship.is_conductor ? `🪄 ${ship.name}` : `🌿 ${ship.name}`;
        const subtitleText = ship.track ? `Track: ${ship.track}` : '';
        
        ctx.font = '12px "Share Tech Mono"';
        const titleWidth = ctx.measureText(titleText).width;
        
        ctx.font = '10px "Share Tech Mono"';
        const subtitleWidth = subtitleText ? ctx.measureText(subtitleText).width : 0;
        
        const tw = Math.max(titleWidth, subtitleWidth);
        const boxHeight = subtitleText ? 36 : 20;
        
        ctx.fillRect(ship.x - tw/2 - 6, ship.y - 65, tw + 12, boxHeight);
        ctx.strokeRect(ship.x - tw/2 - 6, ship.y - 65, tw + 12, boxHeight);
        
        // Draw title
        ctx.fillStyle = '#fff';
        ctx.font = '12px "Share Tech Mono"';
        ctx.fillText(titleText, ship.x - titleWidth/2, ship.y - 51);
        
        // Draw subtitle (track name)
        if (subtitleText) {
            ctx.fillStyle = '#0ff'; // neon cyan for the track
            ctx.font = '10px "Share Tech Mono"';
            ctx.fillText(subtitleText, ship.x - subtitleWidth/2, ship.y - 38);
        }
    });

    explosions.forEach(e => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.color;
        ctx.globalAlpha = e.life;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Tractor Beams
    ctx.globalCompositeOperation = 'screen';
    tractorBeams.forEach(b => {
        ctx.beginPath();
        ctx.moveTo(b.tx, b.ty);
        // Google colored bezier curve pull
        ctx.quadraticCurveTo(b.tx + (Math.random()-0.5)*100, (b.y + b.ty)/2, b.x, b.y);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2 + (b.life * 8);
        ctx.globalAlpha = b.life;
        ctx.shadowBlur = 20;
        ctx.shadowColor = b.color;
        ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // Draw Tag Lines (Mathematically Absolute)
    timeline.forEach(event => {
        if (event.tag) {
            const eventTime = new Date(event.timestamp).getTime();
            const diffMs = eventTime - currentTime;
            const y = mainY - (diffMs / msPerDay) * pixelsPerDay;
            
            if (y > -50 && y < height + 50) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#0ff';
                ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
                ctx.fillRect(0, y, width, 2); 

                ctx.shadowBlur = 0;
                ctx.fillStyle = '#0ff';
                ctx.font = 'bold 18px "Share Tech Mono"';
                const text = `🏁 On ${event.timestamp.split('T')[0]} we reached tag ${event.tag}`;
                const tw = ctx.measureText(text).width;
                ctx.fillText(text, width / 2 - tw / 2, y - 10);
            }
        }
    });

    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // Draw Lunar Cycle UI (Bottom Right)
    const moonRadius = 40;
    const moonX = width - 80;
    const moonY = height - 120; // Shifted up a bit
    const lunarCycleMs = 29.53 * 24 * 60 * 60 * 1000;
    const phase = (currentTime % lunarCycleMs) / lunarCycleMs; // 0 to 1

    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111'; // Shadow color
    ctx.beginPath();
    if (phase < 0.5) {
        // Waxing
        ctx.arc(moonX, moonY, moonRadius, Math.PI/2, Math.PI*1.5, false);
        ctx.fill();
        ctx.fillStyle = phase < 0.25 ? '#111' : '#ccc';
        ctx.beginPath();
        ctx.ellipse(moonX, moonY, Math.abs(Math.cos(phase * Math.PI * 2)) * moonRadius, moonRadius, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Waning
        ctx.arc(moonX, moonY, moonRadius, -Math.PI/2, Math.PI/2, false);
        ctx.fill();
        ctx.fillStyle = phase < 0.75 ? '#ccc' : '#111';
        ctx.beginPath();
        ctx.ellipse(moonX, moonY, Math.abs(Math.cos(phase * Math.PI * 2)) * moonRadius, moonRadius, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw VHS Overlay (Top Right)
    ctx.fillStyle = '#0ff';
    ctx.font = '20px "Press Start 2P"';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#0ff';
    
    const dString = new Date(currentTime).toISOString().replace('T', ' ').substring(0, 19) + ' Z';
    const dateWidth = ctx.measureText(dString).width;
    ctx.fillText(dString, width - dateWidth - 30, 50);
    
    ctx.fillStyle = '#f0f';
    ctx.shadowColor = '#f0f';
    const activeText = `ACTIVE BRANCHES: ${activeBranches}`;
    const activeWidth = ctx.measureText(activeText).width;
    ctx.fillText(activeText, width - activeWidth - 30, 90);
    
    // Speed display
    ctx.fillStyle = '#ff0';
    ctx.shadowColor = '#ff0';
    let speedText = "";
    if (dynamicSpeedMultiplier > 2.0) speedText = ">>> WARP SPEED";
    else if (dynamicSpeedMultiplier < 0.8) speedText = "> BULLET TIME";
    else speedText = ">> CRUISE SPEED";
    const speedWidth = ctx.measureText(speedText).width;
    ctx.fillText(speedText, width - speedWidth - 30, 130);

    ctx.shadowBlur = 0;
}

function loop(timestamp) {
    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    
    update(dt);
    draw();
    
    requestAnimationFrame(loop);
}

// Controls
document.getElementById('btnPlay').onclick = () => {
    const overlay = document.getElementById('briefingOverlay');
    if (overlay) overlay.classList.add('hidden');
    isPlaying = true;
};
document.getElementById('btnPause').onclick = () => isPlaying = false;
const btnStartBriefing = document.getElementById('btnStartBriefing');
if (btnStartBriefing) {
    btnStartBriefing.onclick = () => {
        document.getElementById('briefingOverlay').classList.add('hidden');
        isPlaying = true;
    };
}
const btnReset = document.getElementById('btnReset');
if (btnReset) {
    btnReset.onclick = () => {
        if (timeline && timeline.length > 0) {
            currentIndex = 0;
            currentTime = new Date(timeline[0].timestamp).getTime();
            score = 0;
            totalCommits = 0;
            activePlayers.clear();
            activeTracks.clear();
            ships.clear();
            lasers = [];
            explosions = [];
            tractorBeams = [];
            activeBranches = 0;
            isPlaying = false;
            document.getElementById('playersDisplay').innerText = '0';
            document.getElementById('tracksDisplay').innerText = '0';
            
            // Show briefing again
            const briefingData = preScanTimeline(timeline);
            showBriefing(briefingData.players, currentRepoName, timeline.length, briefingData.totalTracksCount);
        }
    };
}
document.getElementById('speedSlider').oninput = (e) => {
    gameSpeed = parseInt(e.target.value);
    document.getElementById('speedDisplay').innerText = gameSpeed + 'x';
};

async function initRepos() {
    let repos = [];
    try {
        let res = await fetch('/api/repos');
        if (!res.ok) {
            res = await fetch('repos.json'); // Static fallback
        }
        if (res.ok) {
            repos = await res.json();
        }
    } catch (e) {
        console.error("Failed to load repos list", e);
    }

    const select = document.getElementById('repoSelect');
    if (!select) return;

    if (repos.length > 0) {
        select.innerHTML = '';
        repos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.name;
            option.innerText = repo.name + (repo.has_conductor ? ' (Conductor)' : '');
            select.appendChild(option);
        });

        // Check for URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const urlRepo = urlParams.get('repo');
        
        if (urlRepo && repos.find(r => r.name === urlRepo)) {
            select.value = urlRepo;
            loadTimeline(urlRepo);
        } else {
            loadTimeline(repos[0].name);
        }

        select.addEventListener('change', (e) => {
            // Update URL without reloading
            const url = new URL(window.location);
            url.searchParams.set('repo', e.target.value);
            window.history.pushState({}, '', url);
            loadTimeline(e.target.value);
        });
    } else {
        // Ultimate fallback
        select.innerHTML = '<option>Static Mode (No Server)</option>';
        const urlParams = new URLSearchParams(window.location.search);
        const urlRepo = urlParams.get('repo');
        
        if (urlRepo) {
            loadTimeline(urlRepo);
        } else {
            fetch('timeline.json').then(r=>r.json()).then(data => {
                timeline = data;
                if(timeline && timeline.length > 0) {
                    currentTime = new Date(timeline[0].timestamp).getTime();
                    document.getElementById('dateDisplay').innerText = timeline[0].timestamp.split('T')[0];
                }
            }).catch(() => {
                document.getElementById('dateDisplay').innerText = 'No data';
            });
        }
    }
}

initStars();
initRepos();
requestAnimationFrame(loop);
