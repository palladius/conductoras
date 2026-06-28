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
let ships = new Map(); // branchName -> { x, targetX, y, color, author, active }
let lasers = []; // { x, y, tx, ty, color, size, life }
let explosions = []; // { x, y, size, life, color }

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

async function loadTimeline() {
    try {
        const res = await fetch('timeline.json');
        timeline = await res.json();
        if (timeline.length > 0) {
            currentTime = new Date(timeline[0].timestamp).getTime();
            document.getElementById('dateDisplay').innerText = timeline[0].timestamp.split('T')[0];
        }
    } catch(e) {
        console.error("Failed to load timeline.json", e);
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

    // Advance simulated time
    // gameSpeed means how many seconds of real time pass per frame
    // Let's say gameSpeed 10 = 10 hours per second? 
    // We'll jump time based on delta.
    const timeStep = dt * gameSpeed * 100000; 
    currentTime += timeStep;

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
        document.getElementById('dateDisplay').innerText = event.timestamp.split('T')[0];
        document.getElementById('progressBar').style.width = `${(currentIndex / timeline.length) * 100}%`;

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
                    color: SHIP_COLORS[ships.size % SHIP_COLORS.length],
                    author: event.author,
                    active: true
                });
            }

            const ship = ships.get(event.branch);
            
            if (event.is_merge) {
                // Merge into main (Mostro Finale)
                ship.targetX = mainX;
                ship.y += 100; // dive
                spawnExplosion(mainX, mainY - 100, ship.color);
                ship.active = false;
            } else {
                // Shoot lasers
                if (event.added > 0) spawnLaser(ship.x, ship.y, mainX, mainY, 'add', event.added);
                if (event.deleted > 0) spawnLaser(ship.x, ship.y, mainX, mainY, 'del', event.deleted);
            }
        } else {
            // Main branch commit, just explosion or visual pulse
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
            // drift towards targetX
            ship.x += (ship.targetX - ship.x) * 0.05;
            // bobbing effect
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

    // Draw Main Column (The Mostro Finale / Hub)
    ctx.shadowBlur = 20;
    ctx.shadowColor = COLORS.main;
    ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.fillRect(mainX - 30, 0, 60, height);
    ctx.fillStyle = COLORS.main;
    ctx.fillRect(mainX - 5, 0, 10, height);
    ctx.shadowBlur = 0;

    // Draw Lasers
    lasers.forEach(l => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = l.color;
        ctx.fillStyle = l.color;
        ctx.globalAlpha = l.life;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Ships
    ctx.globalAlpha = 1.0;
    ships.forEach((ship, branch) => {
        if (!ship.active) return;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = ship.color;
        
        // Ship Triangle
        ctx.fillStyle = ship.color;
        ctx.beginPath();
        ctx.moveTo(ship.x, ship.y - 20);
        ctx.lineTo(ship.x + 15, ship.y + 15);
        ctx.lineTo(ship.x - 15, ship.y + 15);
        ctx.fill();

        // Badge
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = ship.color;
        ctx.lineWidth = 2;
        const text = `[${ship.author}: ${branch}]`;
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
        ctx.globalAlpha = e.life;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
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

initStars();
loadTimeline().then(() => {
    requestAnimationFrame(loop);
});
