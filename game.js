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
    // Resources
    wood: 0,
    stone: 0,
    turretBulletDamage: 40,
    isGameOver: false
};

const game = new Phaser.Game(config);
let player, base, zombies, bullets, turretBullets, turrets, cursors, keys, shopContainer, shopItemsContainer, shopMask;
let waveTimer, spawnTimer, hpGraphics;
let resources, drops, sellZone;

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
    resources = this.physics.add.staticGroup();
    drops = this.physics.add.group();

    spawnResources(this);

    // Selling Zone around base
    sellZone = this.add.circle(400, 300, 100, 0x00ff88, 0.1);
    this.physics.add.existing(sellZone, true);

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

    // Resource Interactions
    this.physics.add.overlap(bullets, resources, (bullet, res) => damageResource(this, bullet, res));
    this.physics.add.overlap(player, drops, (p, d) => collectItem(this, p, d));
    this.physics.add.overlap(player, sellZone, () => sellResources(this));

    // Timers
    waveTimer = this.time.addEvent({ delay: 30000, callback: nextWave, callbackScope: this, loop: true });
    updateSpawnTimer(this);

    hpGraphics = this.add.graphics().setDepth(150);

    // HUD setup
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x000000, 0.7).fillRect(0, 0, 800, 50);
    hudBg.lineStyle(2, 0x00ff88, 0.5).lineBetween(0, 50, 800, 50);
    this.hudContainer.add(hudBg);

    const textStyle = { fontSize: '20px', fill: '#fff', fontStyle: 'bold', fontFamily: 'Arial Black', stroke: '#000', strokeThickness: 4 };
    this.goldText = this.add.text(20, 15, '💰 0', textStyle);
    this.woodText = this.add.text(180, 15, '🪵 0', textStyle);
    this.stoneText = this.add.text(320, 15, '🪨 0', textStyle);
    this.waveText = this.add.text(650, 15, 'ONDA: 1', textStyle);

    this.hudContainer.add([this.goldText, this.woodText, this.stoneText, this.waveText]);

    createShopMenu(this);
}

function update(time, delta) {
    if (gameState.isGameOver || gameState.isStoreOpen) {
        if (gameState.isStoreOpen) player.body.setVelocity(0);
        return;
    }

    updateHUD(this);

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
    // 1. Grass: More detailed with 100 random dots for noise
    const grass = scene.make.graphics({ x: 0, y: 0, add: false });
    grass.fillStyle(0x90ee90).fillRect(0, 0, 64, 64);
    for (let i = 0; i < 100; i++) {
        const x = Phaser.Math.Between(0, 64);
        const y = Phaser.Math.Between(0, 64);
        const color = Phaser.Math.RND.pick([0x7cfc00, 0x81c784, 0xaed581]);
        grass.fillStyle(color, 0.4).fillRect(x, y, 2, 2);
    }
    grass.generateTexture('grass_tex', 64, 64);

    // 2. Organic Trees
    const tree = scene.make.graphics({ x: 0, y: 0, add: false });
    // Shadow
    tree.fillStyle(0x000000, 0.2).fillEllipse(16, 28, 20, 10);
    // Trunk
    tree.lineStyle(2, 0x000000).fillStyle(0x5d4037).fillRect(14, 20, 6, 12).strokeRect(14, 20, 6, 12);
    // Leaves (Nuance of circles)
    tree.fillStyle(0x006400);
    tree.fillCircle(16, 10, 12).fillCircle(10, 14, 8).fillCircle(22, 14, 8);
    tree.strokeCircle(16, 10, 12).strokeCircle(10, 14, 8).strokeCircle(22, 14, 8);
    tree.generateTexture('tree_tex', 32, 40);

    // 3. Irregular Rocks with Internal Highlight
    const rock = scene.make.graphics({ x: 0, y: 0, add: false });
    rock.fillStyle(0x000000, 0.2).fillEllipse(16, 24, 24, 12); // Shadow
    rock.lineStyle(2, 0x000000);
    rock.fillStyle(0x607d8b); // Bluish gray
    const points = [{ x: 4, y: 20 }, { x: 2, y: 10 }, { x: 12, y: 2 }, { x: 24, y: 4 }, { x: 30, y: 12 }, { x: 26, y: 24 }, { x: 10, y: 28 }];
    rock.fillPoints(points, true).strokePoints(points, true);
    // Bevel/Highlight line
    rock.lineStyle(2, 0x90a4ae, 0.8).lineBetween(12, 4, 24, 6).lineBetween(12, 4, 6, 12);
    rock.generateTexture('rock_tex', 32, 32);

    // Bullet
    const b = scene.make.graphics({ x: 0, y: 0, add: false });
    b.fillStyle(0xffff00).fillCircle(4, 4, 4);
    b.generateTexture('bullet_tex', 8, 8);

    // 4. Detalhado Zombie Texture
    const z = scene.make.graphics({ x: 0, y: 0, add: false });
    z.fillStyle(0x27ae60).fillCircle(16, 16, 14).lineStyle(2, 0x145a32).strokeCircle(16, 16, 14);
    // Eyes: White with black pupils
    z.fillStyle(0xffffff).fillCircle(10, 12, 4).fillCircle(22, 12, 4);
    z.fillStyle(0x000000).fillCircle(10, 12, 2).fillCircle(22, 12, 2);
    // Mouth: Red curve
    z.lineStyle(2, 0xff0000).beginPath().arc(16, 20, 6, 0.2, 2.9).strokePath();
    z.generateTexture('zombie_tex', 32, 32);

    // Blood Particle
    const bp = scene.make.graphics({ x: 0, y: 0, add: false });
    bp.fillStyle(0x922b21).fillRect(0, 0, 4, 4);
    bp.generateTexture('blood_drop', 4, 4);

    // Drops
    const woodDrop = scene.make.graphics({ x: 0, y: 0, add: false });
    woodDrop.lineStyle(1, 0x000000).fillStyle(0x8d6e63).fillRect(0, 0, 10, 10).strokeRect(0, 0, 10, 10);
    woodDrop.generateTexture('wood_drop', 10, 10);

    const stoneDrop = scene.make.graphics({ x: 0, y: 0, add: false });
    stoneDrop.lineStyle(1, 0x000000).fillStyle(0x9e9e9e).fillRect(0, 0, 10, 10).strokeRect(0, 0, 10, 10);
    stoneDrop.generateTexture('stone_drop', 10, 10);
}

function createPlayer(scene) {
    player = scene.add.container(400, 450);
    // Body (Cobalt Blue Metallic)
    const body = scene.add.circle(0, 0, 20, 0x3d5afe).setStrokeStyle(2, 0x000000);
    // Visor (Cyan with glow)
    const visor = scene.add.rectangle(12, 0, 12, 18, 0x00e5ff, 1);
    // Gun (Dark Gray Metallic Barrel)
    const gun = scene.add.rectangle(0, 8, 32, 10, 0x1a1a1a).setOrigin(0, 0.5);
    player.add([body, visor, gun]);
    scene.physics.add.existing(player);
    player.body.setCircle(20, -20, -20).setCollideWorldBounds(true);
    player.setDepth(10);
}

function createZombie(scene) {
    if (gameState.isStoreOpen || gameState.isGameOver) return;

    const side = Phaser.Math.Between(0, 3);
    let x, y;
    if (side === 0) { x = Phaser.Math.Between(0, 800); y = -100; }
    else if (side === 1) { x = Phaser.Math.Between(0, 800); y = 700; }
    else if (side === 2) { x = -100; y = Phaser.Math.Between(0, 600); }
    else { x = 900; y = Phaser.Math.Between(0, 600); }

    // Using the new detailed texture
    const zombie = scene.add.sprite(x, y, 'zombie_tex');

    // Add random variety (scale and tint)
    zombie.setScale(Phaser.Math.FloatBetween(0.9, 1.2));
    const tint = Phaser.Math.Between(0xdddddd, 0xffffff);
    zombie.setTint(tint);

    // Subtle breathing/pulsing effect
    scene.tweens.add({
        targets: zombie,
        scale: zombie.scale * 1.05,
        duration: Phaser.Math.Between(800, 1200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });

    scene.physics.add.existing(zombie);
    zombie.body.setCircle(14, 2, 2);

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

    // Blood splatter effect
    const particles = scene.add.particles(zombie.x, zombie.y, 'blood_drop', {
        speed: { min: 50, max: 150 },
        scale: { start: 1, end: 0 },
        lifespan: 300,
        gravityY: 0,
        quantity: 5,
        emitting: false
    });
    particles.explode(8);
    // Cleanup particles after some time
    scene.time.delayedCall(500, () => particles.destroy());

    bullet.destroy();
    zombie.hp -= dmg;

    // Visual feedback (flash red)
    zombie.setTint(0xff0000);
    scene.time.delayedCall(100, () => {
        if (zombie.active) zombie.setTint(0xffffff);
    });

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

function spawnResources(scene) {
    // 10 Trees
    for (let i = 0; i < 10; i++) {
        let x, y;
        do {
            x = Phaser.Math.Between(50, 750);
            y = Phaser.Math.Between(50, 550);
        } while (Phaser.Math.Distance.Between(x, y, 400, 300) < 150);

        const tree = resources.create(x, y, 'tree_tex');
        tree.type = 'wood';
        tree.hp = 100;
    }
    // 5 Rocks
    for (let i = 0; i < 5; i++) {
        let x, y;
        do {
            x = Phaser.Math.Between(50, 750);
            y = Phaser.Math.Between(50, 550);
        } while (Phaser.Math.Distance.Between(x, y, 400, 300) < 150);

        const rock = resources.create(x, y, 'rock_tex');
        rock.type = 'stone';
        rock.hp = 150;
    }
}

function damageResource(scene, bullet, resource) {
    bullet.destroy();
    resource.hp -= 25;

    // Shake effect
    scene.tweens.add({
        targets: resource,
        x: resource.x + Phaser.Math.Between(-2, 2),
        duration: 50,
        yoyo: true
    });

    if (resource.hp <= 0) {
        const dropKey = resource.type === 'wood' ? 'wood_drop' : 'stone_drop';
        const drop = drops.create(resource.x, resource.y, dropKey);
        drop.resourceType = resource.type;
        resource.destroy();
    }
}

function collectItem(scene, player, item) {
    if (item.resourceType === 'wood') {
        gameState.wood++;
        pulseIcon(scene, scene.woodText);
    } else {
        gameState.stone++;
        pulseIcon(scene, scene.stoneText);
    }
    updateHUD(scene);
    item.destroy();
}

function pulseIcon(scene, textObj) {
    scene.tweens.add({
        targets: textObj,
        scale: 1.4,
        duration: 120,
        yoyo: true,
        ease: 'Back.easeOut'
    });
}

function sellResources(scene) {
    if (gameState.wood === 0 && gameState.stone === 0) return;

    const profit = (gameState.wood * 10) + (gameState.stone * 25);
    gameState.gold += profit;
    pulseIcon(scene, scene.goldText);
    pulseIcon(scene, scene.goldText);

    // Feedback text
    const txt = scene.add.text(400, 260, `+${profit} OURO!`, { fontSize: '24px', color: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5);
    scene.tweens.add({
        targets: txt,
        y: 200,
        alpha: 0,
        duration: 1000,
        onComplete: () => txt.destroy()
    });

    gameState.wood = 0;
    gameState.stone = 0;
    updateHUD(scene);
}

function drawHPBars(scene) {
    hpGraphics.clear();

    // Player HP Bar
    drawEntityHP(scene, player.x, player.y - 35, gameState.playerHp, gameState.playerMaxHp);
    // Base HP Bar
    drawEntityHP(scene, 400, 300 - 55, gameState.baseHp, gameState.baseMaxHp, 60);

    zombies.children.iterate((z) => {
        if (z && z.active && z.hp < z.maxHp) {
            drawEntityHP(scene, z.x, z.y - 25, z.hp, z.maxHp, 30);
        }
    });
}

function drawEntityHP(scene, x, y, hp, maxHp, width = 40) {
    const percent = Math.max(0, hp / maxHp);
    const color = percent > 0.4 ? 0x00ff88 : 0xff0000;
    hpGraphics.fillStyle(0x000000, 0.5);
    hpGraphics.fillRect(x - width / 2, y, width, 6);
    hpGraphics.fillStyle(color, 1);
    hpGraphics.fillRect(x - width / 2, y, width * percent, 6);
    hpGraphics.lineStyle(1, 0x000000, 1);
    hpGraphics.strokeRect(x - width / 2, y, width, 6);
}

// --- Shop & Menu ---

function toggleUpgradeMenu(scene) {
    gameState.isStoreOpen = !gameState.isStoreOpen;
    if (gameState.isStoreOpen) {
        shopContainer.setVisible(true);
        scene.physics.world.pause();
        if (spawnTimer) spawnTimer.paused = true;
    } else {
        shopContainer.setVisible(false);
        scene.physics.world.resume();
        if (spawnTimer) spawnTimer.paused = false;
    }
}

function updateHUD(scene) {
    scene.goldText.setText(`💰 ${gameState.gold}`);
    scene.woodText.setText(`🪵 ${gameState.wood}`);
    scene.stoneText.setText(`🪨 ${gameState.stone}`);
    scene.waveText.setText(`ONDA: ${gameState.wave}`);
}

function createShopMenu(scene) {
    shopContainer = scene.add.container(400, 300).setDepth(300).setVisible(false);

    // Glassmorphism background
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRoundedRect(-240, -270, 480, 540, 20);
    bg.lineStyle(4, 0x00ff88, 0.8); // Neon green border
    bg.strokeRoundedRect(-240, -270, 480, 540, 20);

    const title = scene.add.text(0, -230, 'TECNOLOGIAS DE DEFESA', {
        fontSize: '32px',
        color: '#00ff88',
        fontStyle: 'bold',
        fontFamily: 'Arial Black',
        stroke: '#000',
        strokeThickness: 6
    }).setOrigin(0.5).setShadow(3, 3, '#000', 4);

    shopItemsContainer = scene.add.container(0, 0);

    const items = [
        { name: 'Up Vel. Tiro', key: 'bulletSpeed', cost: 150, inc: 100, type: 'up' },
        { name: 'Up Dano Player', key: 'bulletDamage', cost: 200, inc: 25, type: 'up' },
        { name: 'Reparar Base (+50)', key: 'repair', cost: 300, type: 'buy' },
        { name: 'Comprar Torreta', key: 'turret', cost: 1500, type: 'buy' },
        { name: 'Up Dano Torreta', key: 'turretDmg', cost: 400, inc: 30, type: 'up' }
    ];

    items.forEach((it, i) => {
        const row = scene.add.container(0, -160 + (i * 70));

        // Button style based on type
        const baseColor = it.type === 'buy' ? 0x27ae60 : 0x2980b9;
        const btn = scene.add.rectangle(0, 0, 420, 60, baseColor, 0.6).setInteractive({ useHandCursor: true });
        btn.setStrokeStyle(2, 0xffffff, 0.3);

        const label = scene.add.text(-200, 0, it.name, { fontSize: '20px', color: '#fff', fontStyle: 'bold', fontFamily: 'Arial Black' }).setOrigin(0, 0.5).setShadow(2, 2, '#000', 4);
        const costLabel = scene.add.text(200, 0, `💰 ${it.cost}`, { fontSize: '20px', color: '#f1c40f', fontStyle: 'bold', fontFamily: 'Arial Black' }).setOrigin(1, 0.5).setShadow(2, 2, '#000', 4);

        row.add([btn, label, costLabel]);
        shopItemsContainer.add(row);

        btn.on('pointerover', () => {
            btn.setFillStyle(baseColor, 1);
            btn.setScale(1.02);
        });
        btn.on('pointerout', () => {
            btn.setFillStyle(baseColor, 0.6);
            btn.setScale(1);
        });

        btn.on('pointerdown', (pointer, localX, localY, event) => {
            if (event) event.stopPropagation();

            if (gameState.gold >= it.cost) {
                let success = false;
                if (it.key === 'repair' && gameState.baseHp < gameState.baseMaxHp) {
                    gameState.gold -= it.cost;
                    gameState.baseHp = Math.min(gameState.baseMaxHp, gameState.baseHp + 50);
                    success = true;
                } else if (it.key === 'turret' && gameState.turretsCount < 4) {
                    gameState.gold -= it.cost;
                    const pos = [[100, 100], [700, 100], [100, 500], [700, 500]][gameState.turretsCount];
                    createTurret(scene, pos[0], pos[1]);
                    gameState.turretsCount++;
                    success = true;
                } else if (it.key === 'bulletSpeed') {
                    gameState.gold -= it.cost;
                    gameState.bulletSpeed += it.inc;
                    success = true;
                } else if (it.key === 'bulletDamage') {
                    gameState.gold -= it.cost;
                    gameState.bulletDamage += it.inc;
                    success = true;
                } else if (it.key === 'turretDmg') {
                    gameState.gold -= it.cost;
                    gameState.turretBulletDamage += it.inc;
                    success = true;
                }

                if (success) {
                    updateHUD(scene);
                    btn.setFillStyle(0x00ff88, 1); // Flash success
                    scene.time.delayedCall(100, () => btn.setFillStyle(baseColor, 1));
                }
            } else {
                btn.setFillStyle(0xff0000, 1); // Flash error
                scene.time.delayedCall(100, () => btn.setFillStyle(baseColor, 0.6));
            }
        });
    });

    const closeTxt = scene.add.text(0, 240, '[ P - VOLTAR ]', { fontSize: '18px', color: '#888', fontStyle: 'bold' }).setOrigin(0.5);
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
