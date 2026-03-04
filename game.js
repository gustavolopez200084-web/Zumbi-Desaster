/**
 * Zumbi Desaster - Core Game Logic
 * Using Phaser 3.60.0
 */

// Game Configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// Global State
const gameState = {
    gold: 0,
    wave: 1,
    baseHp: 100,
    baseMaxHp: 100,
    playerHp: 100,
    playerMaxHp: 100,
    playerSpeed: 200,
    fireRate: 400,
    bulletDamage: 50,
    bulletSpeed: 600,
    lastFired: 0,
    isStoreOpen: false,
    zombieHpMultiplier: 1.0,
    spawnDelay: 2000,
    turretsCount: 0,
    maxTurrets: 4,
    turretFireRate: 800,
    turretRange: 350,
    turretBulletDamage: 40,
    isGameOver: false
};

const game = new Phaser.Game(config);
let player, base, zombies, bullets, turretBullets, turrets, cursors, keys, shopContainer, shopItemsContainer, shopMask;
let waveTimer, spawnTimer, hpGraphics;

function preload() { }

function create() {
    generateTextures(this);

    // Ground: Grass with tile dots
    this.add.tileSprite(400, 300, 800, 600, 'grass_tex');

    // Base (Central rectangle)
    base = this.add.rectangle(400, 300, 80, 80, 0x444444);
    base.setStrokeStyle(4, 0x00ff88);
    this.physics.add.existing(base, true);

    // Player (Container)
    createPlayer(this);

    // Groups
    bullets = this.physics.add.group({ defaultKey: 'bullet_tex', maxSize: 100 });
    turretBullets = this.physics.add.group({ defaultKey: 'bullet_tex', maxSize: 100 });
    zombies = this.physics.add.group();
    turrets = this.add.group();

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys('W,A,S,D,P');

    this.input.keyboard.on('keydown-P', () => {
        if (!gameState.isGameOver) toggleUpgradeMenu(this);
    });

    // Collisions
    this.physics.add.collider(player, base);
    this.physics.add.overlap(bullets, zombies, (bullet, zombie) => damageZombie(this, bullet, zombie, gameState.bulletDamage));
    this.physics.add.overlap(turretBullets, zombies, (bullet, zombie) => damageZombie(this, bullet, zombie, gameState.turretBulletDamage));
    this.physics.add.overlap(zombies, base, (baseObj, zombie) => damageBase(this, zombie));
    this.physics.add.overlap(zombies, player, (playerObj, zombie) => damagePlayer(this, zombie));

    // Timers
    waveTimer = this.time.addEvent({ delay: 30000, callback: nextWave, callbackScope: this, loop: true });
    updateSpawnTimer(this);

    hpGraphics = this.add.graphics().setDepth(50);
    this.hudText = this.add.text(10, 10, '', { fontSize: '18px', fill: '#00ff88', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);

    createShopMenu(this);
}

function update(time, delta) {
    if (gameState.isGameOver || gameState.isStoreOpen) {
        if (gameState.isStoreOpen) player.body.setVelocity(0);
        return;
    }

    this.hudText.setText(`ONDA: ${gameState.wave} | OURO: ${gameState.gold}\nHP JOGADOR: ${Math.ceil(gameState.playerHp)} | HP BASE: ${Math.ceil(gameState.baseHp)}`);

    const pointer = this.input.activePointer;
    player.rotation = Phaser.Math.Angle.Between(player.x, player.y, pointer.x, pointer.y);

    player.body.setVelocity(0);
    let vx = 0, vy = 0;
    if (keys.W.isDown || cursors.up.isDown) vy = -gameState.playerSpeed;
    if (keys.S.isDown || cursors.down.isDown) vy = gameState.playerSpeed;
    if (keys.A.isDown || cursors.left.isDown) vx = -gameState.playerSpeed;
    if (keys.D.isDown || cursors.right.isDown) vx = gameState.playerSpeed;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    player.body.setVelocity(vx, vy);

    if (this.input.activePointer.isDown && time > gameState.lastFired) {
        firePlayerBullet(this);
        gameState.lastFired = time + gameState.fireRate;
    }

    zombies.children.iterate((zombie) => {
        if (!zombie || !zombie.active) return;
        const distToBase = Phaser.Math.Distance.Between(zombie.x, zombie.y, 400, 300);
        const distToPlayer = Phaser.Math.Distance.Between(zombie.x, zombie.y, player.x, player.y);
        const target = distToPlayer < 200 ? player : base;
        this.physics.moveToObject(zombie, target, 70);
        zombie.setRotation(Phaser.Math.Angle.Between(zombie.x, zombie.y, target.x, target.y));
    });

    turrets.children.iterate((t) => { if (t) updateTurret(this, t, time); });
    drawHPBars(this);
}

// --- Creation Helpers ---

function generateTextures(scene) {
    const grass = scene.make.graphics({ x: 0, y: 0, add: false });
    grass.fillStyle(0x2d5a27).fillRect(0, 0, 64, 64);
    grass.fillStyle(0x1e3c1a);
    for (let i = 0; i < 20; i++) {
        grass.fillPoint(Phaser.Math.Between(0, 64), Phaser.Math.Between(0, 64), 2);
    }
    grass.generateTexture('grass_tex', 64, 64);

    const b = scene.make.graphics({ x: 0, y: 0, add: false });
    b.fillStyle(0xffff00).fillCircle(4, 4, 4);
    b.generateTexture('bullet_tex', 8, 8);
}

function createPlayer(scene) {
    player = scene.add.container(400, 450);
    const body = scene.add.circle(0, 0, 20, 0x3498db).setStrokeStyle(2, 0x21618c);
    const visor = scene.add.rectangle(12, 0, 10, 18, 0x00ffff, 0.7);
    const gun = scene.add.rectangle(15, 8, 28, 8, 0x333333).setOrigin(0, 0.5);
    player.add([body, visor, gun]);
    scene.physics.add.existing(player);
    player.body.setCircle(20, -20, -20).setCollideWorldBounds(true);
    player.setDepth(10);
}

function createZombie(scene) {
    const side = Phaser.Math.Between(0, 3);
    let x, y;
    if (side === 0) { x = Phaser.Math.Between(0, 800); y = -100; }
    else if (side === 1) { x = Phaser.Math.Between(0, 800); y = 700; }
    else if (side === 2) { x = -100; y = Phaser.Math.Between(0, 600); }
    else { x = 900; y = Phaser.Math.Between(0, 600); }

    const zombie = scene.add.container(x, y);
    const body = scene.add.circle(0, 0, 16, 0x27ae60).setStrokeStyle(2, 0x1e8449);
    const eye1 = scene.add.circle(6, -6, 3, 0x000000);
    const eye2 = scene.add.circle(6, 6, 3, 0x000000);
    const mouth = scene.add.rectangle(9, 0, 2, 8, 0x000000);
    zombie.add([body, eye1, eye2, mouth]);
    scene.physics.add.existing(zombie);
    zombie.body.setCircle(16, -16, -16);

    zombie.maxHp = 80 * gameState.zombieHpMultiplier;
    zombie.hp = zombie.maxHp;
    zombie.lastDamageTime = 0;
    zombies.add(zombie);
}

function createTurret(scene, x, y) {
    const t = scene.add.container(x, y);
    const b = scene.add.circle(0, 0, 22, 0x7f8c8d).setStrokeStyle(2, 0x2c3e50);
    const g = scene.add.rectangle(0, 0, 34, 12, 0x34495e).setOrigin(0, 0.5);
    t.add([b, g]);
    t.gun = g;
    t.lastFired = 0;
    turrets.add(t);
}

// --- Combat ---

function firePlayerBullet(scene) {
    const b = bullets.get(player.x, player.y);
    if (b) {
        b.setActive(true).setVisible(true).setPosition(player.x, player.y);
        scene.physics.add.existing(b);
        b.body.setVelocity(Math.cos(player.rotation) * gameState.bulletSpeed, Math.sin(player.rotation) * gameState.bulletSpeed);
        scene.time.addEvent({ delay: 3000, callback: () => { if (b.active) b.destroy(); } });
    }
}

function updateTurret(scene, t, time) {
    if (time < t.lastFired + gameState.turretFireRate) return;
    let closest = null, minDist = gameState.turretRange;
    zombies.children.iterate((z) => {
        if (z && z.active) {
            const d = Phaser.Math.Distance.Between(t.x, t.y, z.x, z.y);
            if (d < minDist) { minDist = d; closest = z; }
        }
    });

    if (closest) {
        const angle = Phaser.Math.Angle.Between(t.x, t.y, closest.x, closest.y);
        t.gun.setRotation(angle);
        const b = turretBullets.get(t.x, t.y);
        if (b) {
            b.setActive(true).setVisible(true).setPosition(t.x, t.y);
            scene.physics.add.existing(b);
            b.body.setVelocity(Math.cos(angle) * 850, Math.sin(angle) * 850);
            scene.time.addEvent({ delay: 2000, callback: () => { if (b.active) b.destroy(); } });
            t.lastFired = time;
        }
    }
}

function damageZombie(scene, bullet, zombie, dmg) {
    if (!zombie.active) return;
    bullet.destroy();
    zombie.hp -= dmg;
    if (zombie.hp <= 0) {
        gameState.gold += 20;
        zombie.destroy();
    }
}

function damageBase(scene, zombie) {
    const now = scene.time.now;
    if (now > zombie.lastDamageTime + 1000) {
        gameState.baseHp -= 10;
        zombie.lastDamageTime = now;
        scene.cameras.main.shake(100, 0.005);
        if (gameState.baseHp <= 0) gameOver(scene);
    }
}

function damagePlayer(scene, zombie) {
    const now = scene.time.now;
    if (now > zombie.lastDamageTime + 1000) {
        gameState.playerHp -= 10;
        zombie.lastDamageTime = now;
        if (gameState.playerHp <= 0) gameOver(scene);
    }
}

// --- Progression ---

function nextWave() {
    gameState.wave++;
    gameState.zombieHpMultiplier *= 1.15;
    gameState.spawnDelay *= 0.90;
    updateSpawnTimer(this);
}

function updateSpawnTimer(scene) {
    if (spawnTimer) spawnTimer.destroy();
    spawnTimer = scene.time.addEvent({
        delay: gameState.spawnDelay,
        callback: () => createZombie(scene),
        callbackScope: scene,
        loop: true
    });
}

function drawHPBars(scene) {
    hpGraphics.clear();
    zombies.children.iterate((z) => {
        if (z && z.active && z.hp < z.maxHp) {
            hpGraphics.fillStyle(0x000000, 0.5).fillRect(z.x - 15, z.y - 25, 30, 4);
            hpGraphics.fillStyle(0x00ff88, 1).fillRect(z.x - 15, z.y - 25, 30 * (z.hp / z.maxHp), 4);
        }
    });
}

// --- Shop & Menu ---

function toggleUpgradeMenu(scene) {
    gameState.isStoreOpen = !gameState.isStoreOpen;
    if (gameState.isStoreOpen) {
        shopContainer.setVisible(true);
        scene.physics.world.pause();
    } else {
        shopContainer.setVisible(false);
        scene.physics.world.resume();
    }
}

function createShopMenu(scene) {
    shopContainer = scene.add.container(400, 300).setDepth(200).setVisible(false);
    const bg = scene.add.rectangle(0, 0, 480, 540, 0x111111, 0.95).setStrokeStyle(3, 0x00ff88);
    const title = scene.add.text(0, -230, 'LOJA DE SURVIVAL', { fontSize: '32px', color: '#00ff88', fontStyle: 'bold' }).setOrigin(0.5);

    shopItemsContainer = scene.add.container(0, 0);

    const items = [
        { name: 'Up Vel. Tiro', key: 'bulletSpeed', cost: 150, inc: 100 },
        { name: 'Up Dano Player', key: 'bulletDamage', cost: 200, inc: 25 },
        { name: 'Reparar Base (+50)', key: 'repair', cost: 300 },
        { name: 'Comprar Torreta', key: 'turret', cost: 1500 },
        { name: 'Up Dano Torreta', key: 'turretDmg', cost: 400, inc: 30 }
    ];

    items.forEach((it, i) => {
        const row = scene.add.container(0, -160 + (i * 70));
        const btn = scene.add.rectangle(0, 0, 420, 60, 0x222222).setInteractive({ useHandCursor: true });
        const label = scene.add.text(-200, 0, it.name, { fontSize: '20px', color: '#fff' }).setOrigin(0, 0.5);
        const costLabel = scene.add.text(200, 0, `G: ${it.cost}`, { fontSize: '20px', color: '#f1c40f' }).setOrigin(1, 0.5);
        row.add([btn, label, costLabel]);
        shopItemsContainer.add(row);

        btn.on('pointerover', () => btn.setFillStyle(0x333333));
        btn.on('pointerout', () => btn.setFillStyle(0x222222));
        btn.on('pointerdown', () => {
            if (gameState.gold >= it.cost) {
                if (it.key === 'repair') {
                    if (gameState.baseHp < gameState.baseMaxHp) {
                        gameState.gold -= it.cost;
                        gameState.baseHp = Math.min(gameState.baseMaxHp, gameState.baseHp + 50);
                    }
                } else if (it.key === 'turret' && gameState.turretsCount < 4) {
                    gameState.gold -= it.cost;
                    const pos = [[100, 100], [700, 100], [100, 500], [700, 500]][gameState.turretsCount];
                    createTurret(scene, pos[0], pos[1]);
                    gameState.turretsCount++;
                } else if (it.key === 'bulletSpeed') {
                    gameState.gold -= it.cost;
                    gameState.bulletSpeed += it.inc;
                } else if (it.key === 'bulletDamage') {
                    gameState.gold -= it.cost;
                    gameState.bulletDamage += it.inc;
                } else if (it.key === 'turretDmg') {
                    gameState.gold -= it.cost;
                    gameState.turretBulletDamage += it.inc;
                }
            }
        });
    });

    const closeTxt = scene.add.text(0, 240, '[ P - VOLTAR ]', { fontSize: '18px', color: '#888' }).setOrigin(0.5);
    shopContainer.add([bg, title, shopItemsContainer, closeTxt]);

    const mask = scene.make.graphics().fillRect(160, 120, 480, 400).setVisible(false).createGeometryMask();
    shopItemsContainer.setMask(mask);

    scene.input.on('wheel', (pointer, gameObjects, dx, dy) => {
        if (gameState.isStoreOpen) {
            shopItemsContainer.y -= dy * 0.4;
            shopItemsContainer.y = Phaser.Math.Clamp(shopItemsContainer.y, -250, 0);
        }
    });
}

function gameOver(scene) {
    if (gameState.isGameOver) return;
    gameState.isGameOver = true;
    scene.physics.pause();
    scene.add.rectangle(400, 300, 800, 600, 0x000000, 0.6).setDepth(300);
    scene.add.text(400, 250, 'GAME OVER', { fontSize: '80px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(301);
    const btn = scene.add.rectangle(400, 380, 220, 60, 0x333333).setInteractive({ useHandCursor: true }).setDepth(301);
    scene.add.text(400, 380, 'REINICIAR', { fontSize: '28px', color: '#fff' }).setOrigin(0.5).setDepth(302);
    btn.on('pointerdown', () => window.location.reload());
}
