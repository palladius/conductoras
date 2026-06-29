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
let currentIndex = 0;
let currentTime = 0; // Simulated timestamp
let lastFrameTime = 0;
let currentMultiplier = 1000; // Starting timeStep multiplier
let score = 0;
let totalCommits = 0;

// Entities
let stars = [];
let ships = new Map(); // branchName -> { x, targetX, y, color, author, active, isConductor }
let tractorBeams = []; // { sx, sy, tx, ty, life, particles: [{progress, speed, color, offset}] }
let explosions = []; // { x, y, size, life, color }
let tagLines = []; // { y, text, dateStr, speed }

const COLORS = {
    main: '#f0f',
    green: '#0f0',
    red: '#f00',
    cyan: '#0ff',
    yellow: '#ff0',
    orange: '#f80'
};
const SHIP_COLORS = [COLORS.cyan, COLORS.yellow, COLORS.orange, '#0f8', '#80f'];

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

async function loadTimeline(repoName) {
    if (!repoName) return;
    
    // Reset state
    timeline = [];
    currentIndex = 0;
    score = 0;
    totalCommits = 0;
    ships.clear();
    tractorBeams = [];
    explosions = [];
    tagLines = [];
    isPlaying = false;
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('scoreDisplay').innerText = '000000';
    document.getElementById('commitsDisplay').innerText = '0';
    document.getElementById('dateDisplay').innerText = 'Loading...';

    try {
        const res = await fetch(`/api/timeline?repo=${encodeURIComponent(repoName)}`);
        timeline = await res.json();
        if (timeline && timeline.length > 0) {
            currentTime = new Date(timeline[0].timestamp).getTime();
            document.getElementById('dateDisplay').innerText = timeline[0].timestamp.split('T')[0];
            isPlaying = true; // Auto-play when loaded
        } else {
            document.getElementById('dateDisplay').innerText = 'No commits found';
        }
    } catch(e) {
        console.error("Failed to load timeline", e);
        document.getElementById('dateDisplay').innerText = 'Error loading repo';
    }
}

const GOOGLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];

function spawnTractorBeam(fromX, fromY, toX, toY, count) {
    // Scale count log-wise so it doesn't overload
    const visualCount = Math.min(40, Math.ceil(Math.log10(count + 1) * 8));
    
    let beam = {
        sx: fromX, sy: fromY, 
        tx: toX, ty: toY,
        life: 1.0, 
        particles: []
    };
    
    for(let i=0; i<visualCount; i++) {
        beam.particles.push({
            progress: -Math.random(), // Start delayed
            speed: 0.02 + Math.random() * 0.04, 
            color: GOOGLE_COLORS[Math.floor(Math.random() * GOOGLE_COLORS.length)],
            offset: (Math.random() - 0.5) * 30
        });
    }
    tractorBeams.push(beam);
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
    // Always update stars for background effect
    stars.forEach(s => {
        s.y += s.speed * (gameSpeed / 10);
        if (s.y > height) {
            s.y = 0;
            s.x = Math.random() * width;
        }
    });

    if (!isPlaying || timeline.length === 0) return;

    if (currentIndex < timeline.length) {
        // Time Dilation Logic
        const nextEvent = timeline[currentIndex];
        const nextTime = new Date(nextEvent.timestamp).getTime();
        let deltaMs = nextTime - currentTime;
        if (deltaMs < 0) deltaMs = 0;

        // Base target: consume deltaMs in ~30 frames (0.5 seconds)
        let targetTimeStep = deltaMs / 30; 
        
        // Boundaries: don't go slower than 1 min/frame, or faster than 2 days/frame
        const MIN_STEP = 60 * 1000; 
        const MAX_STEP = 2 * 24 * 3600 * 1000; 
        
        targetTimeStep = Math.max(MIN_STEP, Math.min(targetTimeStep, MAX_STEP));
        
        // Scale with user gameSpeed slider
        targetTimeStep *= (gameSpeed / 10);

        // Smooth acceleration/deceleration (Time Dilation effect)
        currentMultiplier += (targetTimeStep - currentMultiplier) * 0.1;
        
        currentTime += currentMultiplier;

        // Process events up to currentTime
        while (currentIndex < timeline.length) {
            const event = timeline[currentIndex];
            const eventTime = new Date(event.timestamp).getTime();
            
            if (eventTime > currentTime) break; // Not yet

            // Process this commit
            totalCommits++;
            score += (event.added + event.deleted) * 10;
            
            document.getElementById('scoreDisplay').innerText = score.toString().padStart(6, '0');
            document.getElementById('commitsDisplay').innerText = totalCommits;
            document.getElementById('progressBar').style.width = `${(currentIndex / timeline.length) * 100}%`;

            if (event.tags && event.tags.length > 0) {
                event.tags.forEach(t => {
                    tagLines.push({
                        y: 0,
                        text: `Tag: ${t}`,
                        dateStr: event.timestamp.split('T')[0],
                        speed: 2 // Same speed scale as stars
                    });
                });
            }

            const isMain = event.branch === 'main' || event.branch === 'master';
            const mainX = width / 2;
            const mainY = height * 0.8; // Target area is low-center

            if (!isMain) {
                // Manage ship
                if (!ships.has(event.branch)) {
                    // New branch spawned
                    const side = Math.random() > 0.5 ? 1 : -1;
                    ships.set(event.branch, {
                        x: mainX + side * (100 + Math.random() * 200),
                        targetX: mainX + side * (150 + Math.random() * 150),
                        y: height * 0.2 + Math.random() * (height * 0.4),
                        color: event.is_conductor ? '#ffd700' : SHIP_COLORS[ships.size % SHIP_COLORS.length],
                        author: event.author,
                        active: true,
                        isConductor: event.is_conductor
                    });
                }

                const ship = ships.get(event.branch);
                if (event.is_conductor) {
                    ship.isConductor = true;
                    ship.color = '#ffd700';
                }
                
                if (event.is_merge) {
                    // Merge into main (Mostro Finale)
                    ship.targetX = mainX;
                    ship.y += 100; // dive
                    spawnExplosion(mainX, mainY - 100, ship.color);
                    ship.active = false;
                } else {
                    // Shoot tractor beams
                    const totalData = event.added + event.deleted;
                    if (totalData > 0) spawnTractorBeam(ship.x, ship.y, mainX, mainY, totalData);
                }
            } else {
                // Main branch commit, just explosion or visual pulse
                spawnExplosion(mainX, mainY, '#4285F4');
            }

            currentIndex++;
        }
    }


    // Update tagLines
    for (let i = tagLines.length - 1; i >= 0; i--) {
        let t = tagLines[i];
        t.y += t.speed * (gameSpeed / 10);
        if (t.y > height + 50) {
            tagLines.splice(i, 1);
        }
    }

    // Update ships
    let activeBranches = 0;
    ships.forEach((ship, branch) => {
        if (ship.active) {
            activeBranches++;
            // drift towards targetX
            ship.x += (ship.targetX - ship.x) * 0.05;
            // bobbing effect
            ship.y += Math.sin(Date.now() / 500) * 0.5;
        }
    });

    document.getElementById('branchesDisplay').innerText = activeBranches;
    if (isPlaying && activeBranches > 0) {
        score += activeBranches * (dt / 16) * 0.1;
        document.getElementById('scoreDisplay').innerText = Math.floor(score).toString().padStart(6, '0');
    }

    // Update tractor beams
    for (let i = tractorBeams.length - 1; i >= 0; i--) {
        let b = tractorBeams[i];
        b.life -= 0.015; // Beam lasts roughly a second
        
        // Update particles
        b.particles.forEach(p => {
            p.progress += p.speed;
            if (p.progress > 1) {
                p.progress = 0; // Wrap around to simulate continuous flow
            }
        });

        if (b.life <= 0) {
            tractorBeams.splice(i, 1);
        }
    }

    // Update explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        let e = explosions[i];
        e.x += e.vx;
        e.y += e.vy;
        e.life -= 0.05;
        if (e.life <= 0) explosions.splice(i, 1);
    }
}

function draw() {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, width, height);

    // Draw stars
    ctx.fillStyle = '#fff';
    stars.forEach(s => {
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1.0;

    const mainX = width / 2;
    const mainY = height * 0.8;

    // --- Parallax Time Grid ---
    if (currentTime > 0) {
        const msPerDay = 24 * 3600 * 1000;
        const pixelsPerDay = 150; // Distance between days on screen

        const timeAtTop = currentTime + mainY * (msPerDay / pixelsPerDay);
        const timeAtBottom = currentTime - (height - mainY) * (msPerDay / pixelsPerDay);

        const startDay = Math.floor(timeAtBottom / msPerDay);
        const endDay = Math.ceil(timeAtTop / msPerDay);

        for (let d = startDay; d <= endDay; d++) {
            const lineTime = d * msPerDay;
            const y = mainY - (lineTime - currentTime) * (pixelsPerDay / msPerDay);
            
            const dateObj = new Date(lineTime);
            
            ctx.beginPath();
            if (dateObj.getDate() === 1) {
                // Monthly Line
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 2;
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();

                const monthStr = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = 'bold 20px "Share Tech Mono"';
                ctx.fillText(monthStr, 20, y - 10);
            } else if (dateObj.getDay() === 1) { 
                // Weekly Line (Monday)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            } else {
                // Daily Line
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.lineWidth = 1;
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        }
    }
    // --------------------------

    // Update Date Display smoothly
    if (currentTime > 0) {
        const d = new Date(currentTime);
        document.getElementById('dateDisplay').innerText = 
            d.getFullYear() + '/' + 
            String(d.getMonth()+1).padStart(2,'0') + '/' + 
            String(d.getDate()).padStart(2,'0') + ' ' +
            String(d.getHours()).padStart(2,'0') + ':' +
            String(d.getMinutes()).padStart(2,'0') + ':' +
            String(d.getSeconds()).padStart(2,'0');
    }

    // Draw Main Starship (Sprite)
    const shipWidth = 140;
    const shipHeight = 140;
    if (mainShipImage.complete) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4285F4';
        ctx.drawImage(mainShipImage, mainX - shipWidth/2, mainY - shipHeight/2, shipWidth, shipHeight);
        ctx.shadowBlur = 0;
    }

    // Draw TagLines
    tagLines.forEach(t => {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, t.y);
        ctx.lineTo(width, t.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#0ff';
        ctx.font = '16px "Share Tech Mono"';
        const msg = `On day ${t.dateStr} we reached ${t.text}`;
        const tw = ctx.measureText(msg).width;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(width/2 - tw/2 - 10, t.y - 20, tw + 20, 24);
        
        ctx.fillStyle = '#0ff';
        ctx.fillText(msg, width/2 - tw/2, t.y - 4);
    });

    // Draw Tractor Beams
    ctx.lineCap = 'round';
    tractorBeams.forEach(b => {
        // Draw the main beam glow
        ctx.strokeStyle = `rgba(66, 133, 244, ${b.life * 0.3})`;
        ctx.lineWidth = 15;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4285F4';
        ctx.beginPath();
        ctx.moveTo(b.sx, b.sy);
        ctx.lineTo(b.tx, b.ty);
        ctx.stroke();

        // Draw the teleporting data particles
        ctx.shadowBlur = 10;
        b.particles.forEach(p => {
            if (p.progress < 0) return; // Delayed start

            // Calculate exact position on the line
            let px = b.sx + (b.tx - b.sx) * p.progress;
            let py = b.sy + (b.ty - b.sy) * p.progress;
            
            // Add perpendicular offset for width of the beam
            const angle = Math.atan2(b.ty - b.sy, b.tx - b.sx);
            px += Math.cos(angle + Math.PI/2) * p.offset;
            py += Math.sin(angle + Math.PI/2) * p.offset;

            ctx.shadowColor = p.color;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = b.life * Math.sin(p.progress * Math.PI); // Fade at edges
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    });
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // Draw Ships
    ctx.globalAlpha = 1.0;
    ships.forEach((ship, branch) => {
        if (!ship.active) return;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = ship.color;
        
        // Ship shape
        ctx.fillStyle = ship.color;
        if (ship.isConductor) {
            ctx.shadowColor = ship.color;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.moveTo(ship.x, ship.y - 10);
        ctx.lineTo(ship.x - 10, ship.y + 10);
        ctx.lineTo(ship.x + 10, ship.y + 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Badge
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = ship.color;
        ctx.lineWidth = 2;
        const text = ship.isConductor ? `🪄 ${branch}` : `🌿 ${branch}`;
        ctx.font = '12px "Share Tech Mono"';
        const tw = ctx.measureText(text).width;
        ctx.fillRect(ship.x - tw/2 - 5, ship.y - 45, tw + 10, 20);
        ctx.strokeRect(ship.x - tw/2 - 5, ship.y - 45, tw + 10, 20);
        
        ctx.fillStyle = '#fff';
        ctx.fillText(text, ship.x - tw/2, ship.y - 31);
    });

    // Draw Explosions
    explosions.forEach(e => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.color;
        ctx.globalAlpha = Math.max(0, e.life);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    // --- Draw Lunar Cycle Widget ---
    if (currentTime > 0) {
        const moonRadius = 40;
        const moonX = width - 70;
        const moonY = height - 70;
        const lunarMonthMs = 29.53 * 24 * 3600 * 1000;
        let phase = (currentTime % lunarMonthMs) / lunarMonthMs; 

        // Moon Background (Dark side)
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
        ctx.fill();

        // Moon Illuminated (Bright side)
        ctx.fillStyle = '#fffacd';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#fffacd';
        
        ctx.beginPath();
        if (phase <= 0.5) {
            ctx.arc(moonX, moonY, moonRadius, -Math.PI/2, Math.PI/2);
            ctx.fill();
            
            const termPhase = phase * 2; 
            const termWidth = Math.abs(Math.cos(termPhase * Math.PI)) * moonRadius;
            
            ctx.shadowBlur = 0;
            ctx.beginPath();
            if (termPhase < 0.5) {
                ctx.fillStyle = '#111'; 
                ctx.ellipse(moonX, moonY, termWidth, moonRadius, 0, -Math.PI/2, Math.PI/2);
            } else {
                ctx.fillStyle = '#fffacd'; 
                ctx.ellipse(moonX, moonY, termWidth, moonRadius, 0, Math.PI/2, Math.PI*1.5);
            }
            ctx.fill();
        } else {
            ctx.arc(moonX, moonY, moonRadius, Math.PI/2, Math.PI*1.5);
            ctx.fill();
            
            const termPhase = (phase - 0.5) * 2; 
            const termWidth = Math.abs(Math.cos(termPhase * Math.PI)) * moonRadius;
            
            ctx.shadowBlur = 0;
            ctx.beginPath();
            if (termPhase < 0.5) {
                ctx.fillStyle = '#111'; 
                ctx.ellipse(moonX, moonY, termWidth, moonRadius, 0, Math.PI/2, Math.PI*1.5);
            } else {
                ctx.fillStyle = '#fffacd'; 
                ctx.ellipse(moonX, moonY, termWidth, moonRadius, 0, -Math.PI/2, Math.PI/2);
            }
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }
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
    isPlaying = true;
    document.getElementById('playIcon').innerText = '▶ PLAY';
};
document.getElementById('btnPause').onclick = () => {
    isPlaying = false;
    document.getElementById('playIcon').innerText = '⏸ PAUSE';
};
document.getElementById('btnReset').onclick = () => {
    if (timeline.length > 0) {
        currentIndex = 0;
        currentTime = new Date(timeline[0].timestamp).getTime();
        ships.clear();
        lasers = [];
        explosions = [];
        tagLines = [];
        score = 0;
        totalCommits = 0;
        currentMultiplier = 1000;
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('scoreDisplay').innerText = '000000';
        document.getElementById('commitsDisplay').innerText = '0';
        document.getElementById('branchesDisplay').innerText = '0';
        
        const d = new Date(currentTime);
        document.getElementById('dateDisplay').innerText = 
            d.getFullYear() + '/' + 
            String(d.getMonth()+1).padStart(2,'0') + '/' + 
            String(d.getDate()).padStart(2,'0') + ' ' +
            String(d.getHours()).padStart(2,'0') + ':' +
            String(d.getMinutes()).padStart(2,'0') + ':' +
            String(d.getSeconds()).padStart(2,'0');
    }
};

document.getElementById('speedSlider').oninput = (e) => {
    gameSpeed = parseInt(e.target.value);
    document.getElementById('speedDisplay').innerText = gameSpeed + 'x';
};

async function initRepos() {
    try {
        const res = await fetch('/api/repos');
        const repos = await res.json();
        
        const select = document.getElementById('repoSelect');
        select.innerHTML = '';
        
        repos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.name;
            option.innerText = repo.name + (repo.has_conductor ? ' (Conductor)' : '');
            select.appendChild(option);
        });

        if (repos.length > 0) {
            loadTimeline(repos[0].name);
        }

        select.addEventListener('change', (e) => {
            loadTimeline(e.target.value);
        });
        
    } catch(e) {
        console.error("Failed to load repos", e);
        document.getElementById('repoSelect').innerHTML = '<option>Static Mode (No Server)</option>';
        // Fallback to static JSON
        fetch('timeline.json').then(r=>r.json()).then(data => {
            timeline = data;
            if(timeline.length > 0) {
                currentTime = new Date(timeline[0].timestamp).getTime();
                const d = new Date(currentTime);
                document.getElementById('dateDisplay').innerText = 
                    d.getFullYear() + '/' + 
                    String(d.getMonth()+1).padStart(2,'0') + '/' + 
                    String(d.getDate()).padStart(2,'0') + ' ' +
                    String(d.getHours()).padStart(2,'0') + ':' +
                    String(d.getMinutes()).padStart(2,'0') + ':' +
                    String(d.getSeconds()).padStart(2,'0');
            }
        });
    }
}

const mainShipImage = new Image();
mainShipImage.src = 'astronave_main.png';

initStars();
initRepos();
requestAnimationFrame(loop);
