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
let score = 0;
let totalCommits = 0;

// Entities
let stars = [];
let ships = new Map(); // branchName -> { x, targetX, y, color, avatarUrl, active }
let lasers = []; // { x, y, tx, ty, color, size, life }
let explosions = []; // { x, y, size, life, color }
let tagLines = []; // { y, text, life }
let avatars = new Map(); // avatarUrl -> HTMLImageElement

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
    lasers = [];
    explosions = [];
    tagLines = [];
    isPlaying = false;
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('scoreDisplay').innerText = '000000';
    document.getElementById('commitsDisplay').innerText = '0';
    document.getElementById('dateDisplay').innerText = 'Loading...';

    try {
        let res = await fetch(`/api/timeline?repo=${encodeURIComponent(repoName)}`);
        
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
            isPlaying = true; // Auto-play when loaded
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

    const timeStep = dt * gameSpeed * 100000; 
    currentTime += timeStep;

    while (currentIndex < timeline.length) {
        const event = timeline[currentIndex];
        const eventTime = new Date(event.timestamp).getTime();
        
        if (eventTime > currentTime) break; // Not yet

        totalCommits++;
        score += (event.added + event.deleted) * 10;
        
        document.getElementById('scoreDisplay').innerText = score.toString().padStart(6, '0');
        document.getElementById('commitsDisplay').innerText = totalCommits;
        document.getElementById('dateDisplay').innerText = event.timestamp.split('T')[0];
        document.getElementById('progressBar').style.width = `${(currentIndex / timeline.length) * 100}%`;

        // Spawn Tag Line if commit has a tag
        if (event.tag) {
            tagLines.push({
                y: 0, // spawn at the top
                text: `🏁 On ${event.timestamp.split('T')[0]} we reached tag ${event.tag}`,
                life: 1.0
            });
        }

        const isMain = event.branch === 'main' || event.branch === 'master';
        const mainX = width / 2;
        const mainY = height * 0.8;

        if (!isMain) {
            if (!ships.has(event.branch)) {
                const side = Math.random() > 0.5 ? 1 : -1;
                
                // Trigger Avatar Image Load
                if (event.avatarUrl && !avatars.has(event.avatarUrl)) {
                    const img = new Image();
                    img.src = event.avatarUrl;
                    avatars.set(event.avatarUrl, img);
                }

                ships.set(event.branch, {
                    x: mainX + side * (100 + Math.random() * 200),
                    targetX: mainX + side * (150 + Math.random() * 150),
                    y: height * 0.2 + Math.random() * (height * 0.4),
                    color: SHIP_COLORS[ships.size % SHIP_COLORS.length],
                    avatarUrl: event.avatarUrl,
                    active: true
                });
            }

            const ship = ships.get(event.branch);
            
            if (event.is_merge) {
                ship.targetX = mainX;
                ship.y += 100; // dive
                spawnExplosion(mainX, mainY - 100, ship.color);
                ship.active = false;
            } else {
                if (event.added > 0) spawnLaser(ship.x, ship.y, mainX, mainY, 'add', event.added);
                if (event.deleted > 0) spawnLaser(ship.x, ship.y, mainX, mainY, 'del', event.deleted);
            }
        } else {
            spawnExplosion(mainX, mainY, COLORS.main);
        }

        currentIndex++;
    }

    // Update stars
    stars.forEach(s => {
        s.y += s.speed * (gameSpeed / 10);
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

    // Update tags
    for (let i = tagLines.length - 1; i >= 0; i--) {
        let t = tagLines[i];
        t.y += 2 * (gameSpeed / 10); // Scroll down matching speed
        if (t.y > height + 50) tagLines.splice(i, 1);
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

    ctx.shadowBlur = 20;
    ctx.shadowColor = COLORS.main;
    ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.fillRect(mainX - 30, 0, 60, height);
    ctx.fillStyle = COLORS.main;
    ctx.fillRect(mainX - 5, 0, 10, height);
    ctx.shadowBlur = 0;

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

        // Badge (Just branch name with emoji)
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = ship.color;
        ctx.lineWidth = 2;
        const text = `🌿 ${branch}`;
        ctx.font = '12px "Share Tech Mono"';
        const tw = ctx.measureText(text).width;
        ctx.fillRect(ship.x - tw/2 - 5, ship.y - 65, tw + 10, 20);
        ctx.strokeRect(ship.x - tw/2 - 5, ship.y - 65, tw + 10, 20);
        
        ctx.fillStyle = '#fff';
        ctx.fillText(text, ship.x - tw/2, ship.y - 51);
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

    // Draw Tag Lines
    tagLines.forEach(t => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0ff';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
        ctx.fillRect(0, t.y, width, 2); // Horizontal glowing line

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 18px "Share Tech Mono"';
        const tw = ctx.measureText(t.text).width;
        ctx.fillText(t.text, width / 2 - tw / 2, t.y - 10);
    });

    ctx.globalAlpha = 1.0;
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
document.getElementById('btnPlay').onclick = () => isPlaying = true;
document.getElementById('btnPause').onclick = () => isPlaying = false;
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
