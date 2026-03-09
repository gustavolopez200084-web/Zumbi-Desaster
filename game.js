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

    hpGraphics = this.add.graphics().setDepth(50);
    this.hudText = this.add.text(10, 10, '', { fontSize: '18px', fill: '#00ff88', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);

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
    // Grass: Grass with tile dots
    const grass = scene.make.graphics({ x: 0, y: 0, add: false });
    grass.fillStyle(0x2d5a27).fillRect(0, 0, 64, 64);
    grass.fillStyle(0x1e3c1a);
    for (let i = 0; i < 20; i++) {
        grass.fillPoint(Phaser.Math.Between(0, 64), Phaser.Math.Between(0, 64), 2);
    }
    grass.generateTexture('grass_tex', 64, 64);

    // Tree Texture
    const tree = scene.make.graphics({ x: 0, y: 0, add: false });
    tree.fillStyle(0x5d4037).fillRect(14, 24, 4, 8); // Trunk
    tree.fillStyle(0x1b5e20).fillCircle(16, 12, 12); // Leaves
    tree.generateTexture('tree_tex', 32, 32);

    // Rock Texture
    const rock = scene.make.graphics({ x: 0, y: 0, add: false });
    rock.fillStyle(0x757575);
    rock.fillPoints([{ x: 8, y: 24 }, { x: 4, y: 12 }, { x: 16, y: 4 }, { x: 28, y: 12 }, { x: 24, y: 24 }]);
    rock.generateTexture('rock_tex', 32, 32);

    // Drops
    const woodDrop = scene.make.graphics({ x: 0, y: 0, add: false });
    woodDrop.fillStyle(0x8d6e63).fillRect(0, 0, 8, 8);
    woodDrop.generateTexture('wood_drop', 8, 8);

    const stoneDrop = scene.make.graphics({ x: 0, y: 0, add: false });
    stoneDrop.fillStyle(0x9e9e9e).fillRect(0, 0, 8, 8);
    stoneDrop.generateTexture('stone_drop', 8, 8);

    // Bullet
    const b = scene.make.graphics({ x: 0, y: 0, add: false });
    b.fillStyle(0xffff00).fillCircle(4, 4, 4);
    b.generateTexture('bullet_tex', 8, 8);

    // Realistic Zombie Texture
    const z = scene.make.graphics({ x: 0, y: 0, add: false });

    // Body (Rotting Skin)
    z.fillStyle(0x27ae60).fillCircle(16, 16, 14); // Main base

    // Skin texture noise/patches
    for (let i = 0; i < 20; i++) {
        const color = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(0x27ae60),
            Phaser.Display.Color.ValueToColor(0x145a32),
            100, Phaser.Math.Between(0, 100)
        );
        z.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b));
        z.fillCircle(Phaser.Math.Between(6, 26), Phaser.Math.Between(6, 26), Phaser.Math.Between(2, 6));
    }

    // Blood splatters
    z.fillStyle(0x7b241c);
    for (let i = 0; i < 10; i++) {
        z.fillCircle(Phaser.Math.Between(8, 24), Phaser.Math.Between(8, 24), Phaser.Math.Between(1, 3));
    }

    // Eyes (Sunken and glowing)
    z.fillStyle(0x000000).fillCircle(11, 10, 4).fillCircle(21, 10, 4); // Sockets
    z.fillStyle(0xffffff).fillCircle(11, 10, 2).fillCircle(21, 10, 2); // Whites
    z.fillStyle(0xff0000).fillCircle(11, 10, 1).fillCircle(21, 10, 1); // Pupils

    // Mouth (Ragged)
    z.fillStyle(0x1a1a1a);
    z.fillRect(10, 20, 12, 4);
    z.fillStyle(0xffffff); // Teeth
    for (let i = 0; i < 4; i++) {
        z.fillRect(11 + (i * 3), 20, 1, 2);
    }

    z.generateTexture('zombie_tex', 32, 32);

    // Blood Particle
    const bp = scene.make.graphics({ x: 0, y: 0, add: false });
    bp.fillStyle(0x922b21).fillRect(0, 0, 4, 4);
    bp.generateTexture('blood_drop', 4, 4);
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
    if (item.resourceType === 'wood') gameState.wood++;
    else gameState.stone++;

    updateHUD(scene);
    item.destroy();
}

function sellResources(scene) {
    if (gameState.wood === 0 && gameState.stone === 0) return;

    const profit = (gameState.wood * 10) + (gameState.stone * 25);
    gameState.gold += profit;

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
        if (spawnTimer) spawnTimer.paused = true;
    } else {
        shopContainer.setVisible(false);
        scene.physics.world.resume();
        if (spawnTimer) spawnTimer.paused = false;
    }
}

function updateHUD(scene) {
    scene.hudText.setText(`ONDA: ${gameState.wave} | OURO: ${gameState.gold}\nHP JOGADOR: ${Math.ceil(gameState.playerHp)} | HP BASE: ${Math.ceil(gameState.baseHp)}\nMADEIRA: ${gameState.wood} | PEDRA: ${gameState.stone}`);
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
        btn.on('pointerdown', (pointer, localX, localY, event) => {
            if (event) event.stopPropagation();

            if (gameState.gold >= it.cost) {
                let success = false;
                if (it.key === 'repair') {
                    if (gameState.baseHp < gameState.baseMaxHp) {
                        gameState.gold -= it.cost;
                        gameState.baseHp = Math.min(gameState.baseMaxHp, gameState.baseHp + 50);
                        success = true;
                    }
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
                    // Visual feedback: Flash green
                    btn.setFillStyle(0x00ff88);
                    scene.time.delayedCall(100, () => btn.setFillStyle(0x333333));
                }
            } else {
                // Not enough gold: Flash red
                btn.setFillStyle(0xff0000);
                scene.time.delayedCall(100, () => btn.setFillStyle(0x222222));
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
