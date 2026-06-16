import Phaser from "phaser";
import "./style.css";

// Import astronaut spritesheets
import idleImg from "./assets/Space Runner/Astronaut/Astronaut_Idle.png";
import runImg from "./assets/Space Runner/Astronaut/Astronaut_Run.png";
import jumpImg from "./assets/Space Runner/Astronaut/Astronaut_Jump.png";

// Import enemy spritesheets
import slimeWalkImg from "./assets/Monsters/Slime/walk.png";
import slimeDeathImg from "./assets/Monsters/Slime/death.png";

// Import diamond item
import diamondImg from "./assets/Space Runner/Other sprites/Diamond.png";

// 1. Define the Scene Class
class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private enemies!: Phaser.Physics.Arcade.Group;
  private lasers!: Phaser.Physics.Arcade.Group;
  private bg!: Phaser.GameObjects.TileSprite;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private platX!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private platY!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private platRotate!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private touchInputs = {
    left: false,
    right: false,
    jump: false,
    shoot: false,
  };
  private lastFired = 0; // Throttling for firing laser
  private activePlatform: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null =
    null;
  private wasTouchingDown = false;
  private worldLength = 1600 * 3;

  // Player state
  private playerHealth = 100;
  private playerMaxHealth = 100;
  private playerLives = 5;
  private playerGems = 0;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private diamonds!: Phaser.Physics.Arcade.Group;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private healthPack!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null;
  private playerIsInvincible = false;

  // Boss state
  private boss!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null;
  private bossHp = 10;
  private bossMaxHp = 10;
  private bossDirection = -1;
  private bossHealthBarGraphics!: Phaser.GameObjects.Graphics;
  private bossLabelText!: Phaser.GameObjects.Text;
  private isGameOver = false;
  private bossIsInvincible = false;

  constructor() {
    super("GameScene");
  }

  preload(): void {
    // Load Astronaut animation spritesheets
    this.load.spritesheet("astronaut-idle", idleImg, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.spritesheet("astronaut-run", runImg, {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.spritesheet("astronaut-jump", jumpImg, {
      frameWidth: 24,
      frameHeight: 24,
    });

    // Load Slime enemy spritesheets
    this.load.spritesheet("slime-walk", slimeWalkImg, {
      frameWidth: 156,
      frameHeight: 156,
    });
    this.load.spritesheet("slime-death", slimeDeathImg, {
      frameWidth: 156,
      frameHeight: 156,
    });

    // Load Diamond texture
    this.load.image("diamond", diamondImg);
  }

  create(): void {
    // Reset state variables on restart
    this.playerHealth = 100;
    this.playerLives = 5;
    this.playerGems = 0;
    this.healthPack = null;
    this.playerIsInvincible = false;
    this.bossHp = 10;
    this.bossIsInvincible = false;
    this.isGameOver = false;
    this.activePlatform = null;
    this.wasTouchingDown = false;

    // Set world physics bounds to be wide based on worldLength
    this.physics.world.setBounds(0, 0, this.worldLength, 600);

    // Generate a cosmic space background tile texture dynamically
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(0x0a0a1a, 1); // Deep space dark blue
    bgGraphics.fillRect(0, 0, 800, 600);
    // Draw 150 randomized stars
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * 800;
      const y = Math.random() * 600;
      const size = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.8 + 0.2;
      bgGraphics.fillStyle(0xffffff, alpha);
      bgGraphics.fillRect(x, y, size, size);
    }
    bgGraphics.generateTexture("space-bg", 800, 600);
    bgGraphics.destroy();

    // Add TileSprite with Parallax scroll factor (moves slower than foreground)
    this.bg = this.add.tileSprite(
      this.worldLength / 2,
      300,
      this.worldLength,
      600,
      "space-bg",
    );
    this.bg.setScrollFactor(0.2); // 20% scroll speed relative to camera

    // Create static ground group
    const groundGroup = this.physics.add.staticGroup();

    // Generate a quick ground texture (wide based on worldLength)
    const groundGraphics = this.add.graphics({
      fillStyle: { color: 0x228b22 }, // Better looking green
    });
    groundGraphics.fillRect(0, 0, this.worldLength, 30);
    groundGraphics.generateTexture("ground", this.worldLength, 30);
    groundGraphics.destroy();

    // Generate platform texture (150 wide)
    const platformGraphics = this.add.graphics({
      fillStyle: { color: 0x8b5a2b }, // Earthy brown wood/dirt tone
    });
    platformGraphics.fillRect(0, 0, 150, 20);
    platformGraphics.generateTexture("platform", 150, 20);
    platformGraphics.destroy();

    // Place the ground (centered at half worldLength)
    groundGroup.create(this.worldLength / 2, 585, "ground");

    // Create moving and rotating platforms physics group
    this.movingPlatforms = this.physics.add.group();

    // Spawn platforms in the level
    this.platX = this.movingPlatforms.create(
      300,
      420,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.platRotate = this.movingPlatforms.create(
      650,
      320,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.platY = this.movingPlatforms.create(
      1000,
      420,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.movingPlatforms.create(
      1350,
      320,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.movingPlatforms.create(
      1350,
      120,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.movingPlatforms.create(
      1750,
      420,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.movingPlatforms.create(
      1730,
      220,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    // Configure physics properties for the platforms
    this.movingPlatforms.getChildren().forEach((child) => {
      const plat = child as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      plat.body.allowGravity = false;
      plat.setImmovable(true);
    });

    // Set properties for the orbiting platform
    this.platRotate.setData("orbitAngle", 0);
    this.platRotate.setData("centerX", 650);
    this.platRotate.setData("centerY", 320);
    this.platRotate.setData("radius", 90);

    // Set velocities for the moving platforms
    this.platX.setVelocityX(80);
    this.platY.setVelocityY(60);

    // Generate a laser graphic texture
    const laserGraphics = this.add.graphics({
      fillStyle: { color: 0xff3333 }, // Laser red
    });
    laserGraphics.fillRect(0, 0, 20, 4);
    laserGraphics.generateTexture("laser", 20, 4);
    laserGraphics.destroy();

    // Generate a crude spike graphic texture (24x24)
    const spikeGraphics = this.add.graphics();
    spikeGraphics.fillStyle(0x7f8c8d, 1); // Dark steel gray
    spikeGraphics.beginPath();
    spikeGraphics.moveTo(0, 24);
    spikeGraphics.lineTo(12, 0);
    spikeGraphics.lineTo(24, 24);
    spikeGraphics.closePath();
    spikeGraphics.fillPath();
    // Shading on the left side of the spike
    spikeGraphics.fillStyle(0xbdc3c7, 1); // Light steel gray
    spikeGraphics.beginPath();
    spikeGraphics.moveTo(0, 24);
    spikeGraphics.lineTo(12, 0);
    spikeGraphics.lineTo(12, 24);
    spikeGraphics.closePath();
    spikeGraphics.fillPath();
    spikeGraphics.generateTexture("spike", 24, 24);
    spikeGraphics.destroy();

    // Generate a crude heart graphic texture (24x24)
    const heartGraphics = this.add.graphics();
    heartGraphics.fillStyle(0xff3366, 1); // Rose red/pink
    heartGraphics.fillCircle(6, 6, 6);
    heartGraphics.fillCircle(18, 6, 6);
    heartGraphics.beginPath();
    heartGraphics.moveTo(0, 8);
    heartGraphics.lineTo(12, 24);
    heartGraphics.lineTo(24, 8);
    heartGraphics.closePath();
    heartGraphics.fillPath();
    // Little highlight shiny spot
    heartGraphics.fillStyle(0xffffff, 0.6);
    heartGraphics.fillCircle(4, 4, 2);
    heartGraphics.generateTexture("heartPack", 24, 24);
    heartGraphics.destroy();

    // Define Astronaut animations
    this.anims.create({
      key: "idle",
      frames: this.anims.generateFrameNumbers("astronaut-idle", {
        start: 0,
        end: 5,
      }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "run",
      frames: this.anims.generateFrameNumbers("astronaut-run", {
        start: 0,
        end: 5,
      }),
      frameRate: 12,
      repeat: -1,
    });

    this.anims.create({
      key: "jump",
      frames: this.anims.generateFrameNumbers("astronaut-jump", {
        start: 0,
        end: 4,
      }),
      frameRate: 10,
      repeat: 0,
    });

    // Define Slime animations
    this.anims.create({
      key: "slime-move",
      frames: this.anims.generateFrameNumbers("slime-walk", {
        start: 0,
        end: 5,
      }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "slime-die",
      frames: this.anims.generateFrameNumbers("slime-death", {
        start: 0,
        end: 10,
      }),
      frameRate: 12,
      repeat: 0,
    });

    // Instantiate player with Astronaut spritesheet
    this.player = this.physics.add.sprite(200, 300, "astronaut-idle"); // Start further left
    this.player.setScale(2.5); // Scale up the pixel art so it's clearly visible
    this.player.setBounce(0.15);
    this.player.setCollideWorldBounds(true);

    // Adjust collision body to match the sprite nicely (offset to prevent visual floating ground)
    this.player.setBodySize(14, 16);
    this.player.setOffset(5, 0);

    // Play default animation
    this.player.play("idle");

    // Create Enemies physics group
    this.enemies = this.physics.add.group();

    // Spawn 4 initial slimes across the map (excluding boss area)
    this.spawnSlime(800, 300, false);
    this.spawnSlime(1600, 300, true);
    this.spawnSlime(2400, 300, false);
    this.spawnSlime(3200, 300, true);

    // Spawn Super Slime Boss at the end of the map (x = this.worldLength - 350, y = 450 to start close to ground)
    this.boss = this.physics.add.sprite(
      this.worldLength - 350,
      450,
      "slime-walk",
    );
    this.boss.setScale(2.5); // Giant sized end boss!
    this.boss.setBounce(0.1);
    this.boss.setCollideWorldBounds(true);
    this.boss.setTint(0xcc33ff); // Cosmic purple alien boss color

    // Set collision boundary matching its giant size (grounded properly)
    this.boss.setBodySize(80, 30);
    this.boss.setOffset(38, 50);
    this.boss.play("slime-move");

    // Create Lasers physics group
    this.lasers = this.physics.add.group();

    // Setup Camera to follow the player with a scroll bounds based on worldLength
    this.cameras.main.setBounds(0, 0, this.worldLength, 600);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // Add physics collisions
    this.physics.add.collider(this.player, groundGroup);
    this.physics.add.collider(
      this.player,
      this.movingPlatforms,
      this.handlePlayerPlatformCollision,
      undefined,
      this,
    );
    this.physics.add.collider(this.enemies, groundGroup);
    this.physics.add.collider(this.enemies, this.movingPlatforms);
    this.physics.add.collider(this.boss, groundGroup);
    this.physics.add.collider(this.boss, this.movingPlatforms);
    this.physics.add.collider(this.lasers, groundGroup, (laser) => {
      // Destroy laser when hitting platform
      laser.destroy();
    });
    this.physics.add.collider(this.lasers, this.movingPlatforms, (laser) => {
      laser.destroy();
    });

    // Add player-enemy collisions
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handlePlayerEnemyCollision,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.boss,
      this.handlePlayerBossCollision,
      undefined,
      this,
    );

    // Add laser-enemy collisions
    this.physics.add.overlap(
      this.lasers,
      this.enemies,
      this.handleLaserEnemyCollision,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.lasers,
      this.boss,
      this.handleLaserBossCollision,
      undefined,
      this,
    );

    // Create Diamonds group and spawn diamonds
    this.diamonds = this.physics.add.group();
    
    // Define diamond spawn points
    const spawnPoints = [
      { x: 300, y: 350 },
      { x: 500, y: 480 },
      { x: 650, y: 220 }, // Near rotating platform
      { x: 1000, y: 320 },
      { x: 1200, y: 480 },
      { x: 1500, y: 480 },
      { x: 1800, y: 480 },
      { x: 2100, y: 480 },
      { x: 2500, y: 480 },
      { x: 2900, y: 480 },
      { x: 3300, y: 480 },
    ];

    spawnPoints.forEach((point) => {
      const gem = this.diamonds.create(point.x, point.y, "diamond") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      gem.body.allowGravity = false;
      gem.setScale(2.0); // Make it highly visible
      gem.setData("startY", point.y);
    });

    // Add player overlap with diamonds to collect them
    this.physics.add.overlap(
      this.player,
      this.diamonds,
      this.handlePlayerDiamondOverlap,
      undefined,
      this,
    );

    // Create Spikes group and spawn spikes on the ground
    this.spikes = this.physics.add.staticGroup();
    
    // Define spike hazard cluster center locations
    const spikeLocations = [1150, 2250, 3450];
    spikeLocations.forEach((centerX) => {
      // Spawn a cluster of 3 spikes side-by-side
      for (let i = -1; i <= 1; i++) {
        const x = centerX + i * 24;
        // Ground top y level is 570 (585 center - 15 half-height). Spike height is 24, so center y is 570 - 12 = 558
        const spike = this.spikes.create(x, 558, "spike") as Phaser.Physics.Arcade.Sprite;
        spike.setBodySize(18, 18); // Sightly smaller collision box for better gameplay feel
        spike.setOffset(3, 6);
      }
    });

    // Add player overlap with spikes to trigger instant life loss
    this.physics.add.overlap(
      this.player,
      this.spikes,
      this.handlePlayerSpikeCollision,
      undefined,
      this,
    );

    // Collide enemies and boss with spikes so they turn around
    this.physics.add.collider(this.enemies, this.spikes);
    if (this.boss) {
      this.physics.add.collider(this.boss, this.spikes);
    }

    // Spawn Health Pack on top of the static platform (platStatic is at 1350, 320)
    this.healthPack = this.physics.add.sprite(1350, 290, "heartPack") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.healthPack.body.allowGravity = false;
    this.healthPack.setScale(2.0);

    // Add player overlap with health pack
    this.physics.add.overlap(
      this.player,
      this.healthPack,
      this.handlePlayerHealthOverlap,
      undefined,
      this,
    );

    // Initialize Keyboard inputs safely
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.spaceKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE,
      );
    }

    // Initialize Boss HUD graphics
    this.bossHealthBarGraphics = this.add.graphics();
    this.bossHealthBarGraphics.setScrollFactor(0);

    this.bossLabelText = this.add.text(400, 12, "SUPER SLIME BOSS", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontWeight: "bold",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.bossLabelText.setOrigin(0.5, 0);
    this.bossLabelText.setScrollFactor(0);
    this.bossLabelText.setVisible(false);

    // Initialize Player HUD
    this.hudGraphics = this.add.graphics();
    this.hudGraphics.setScrollFactor(0);

    this.hudText = this.add.text(16, 12, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontWeight: "bold",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.hudText.setScrollFactor(0);
    this.updateHUD();

    // Set up touch control listeners
    this.setupTouchControls();
  }

  private handlePlayerPlatformCollision(player: any, platform: any): void {
    const plat = platform as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    // Set active platform only if player is resting on top of it
    if (this.player.body.touching.down) {
      this.activePlatform = plat;
    }
  }

  private spawnSlime(x: number, y: number, isMedium = false): void {
    const slime = this.enemies.create(
      x,
      y,
      "slime-walk",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    slime.setBounce(0.1);
    slime.setCollideWorldBounds(true);

    if (isMedium) {
      slime.setScale(1.6);
      slime.setTint(0xff8800); // Orange
      slime.setData("hp", 2);
      slime.setData("isMedium", true);
    } else {
      slime.setScale(1.2);
      slime.setData("hp", 1);
      slime.setData("isMedium", false);
    }

    // Set custom collision box for the slime body (aligned to prevent floating)
    slime.setBodySize(80, 30);
    slime.setOffset(38, 50);
    // Play slime animation
    slime.play("slime-move");

    // Set directions & active state data attributes
    slime.setData("direction", Math.random() < 0.5 ? -1 : 1);
    slime.setData("isDying", false);
  }

  private killSlime(
    slime: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ): void {
    slime.setData("isDying", true);
    slime.setVelocity(0, 0);
    slime.body.enable = false; // Disable physics collision instantly
    slime.play("slime-die");

    const wasMedium = slime.getData("isMedium") as boolean;

    slime.on("animationcomplete", () => {
      slime.destroy();
      // Respawn replacement slime after a delay to keep slimes on the screen
      this.time.delayedCall(1200, () => {
        const randomX = Phaser.Math.Between(150, this.worldLength - 1200);
        this.spawnSlime(randomX, 300, wasMedium);
      });
    });
  }

  private updateHUD(): void {
    this.hudGraphics.clear();

    // 1. Draw Player Health Bar Frame
    this.hudGraphics.fillStyle(0x000000, 0.4);
    this.hudGraphics.fillRect(16, 36, 200, 16);

    const healthPercent = Math.max(0, this.playerHealth / this.playerMaxHealth);
    let barColor = 0x00ffcc; // Cyan/Green
    if (healthPercent < 0.3) {
      barColor = 0xff3333; // Red
    } else if (healthPercent < 0.6) {
      barColor = 0xffaa00; // Orange/Yellow
    }

    this.hudGraphics.fillStyle(barColor, 1);
    this.hudGraphics.fillRect(18, 38, healthPercent * 196, 12);

    this.hudGraphics.lineStyle(1.5, 0xffffff, 0.8);
    this.hudGraphics.strokeRect(16, 36, 200, 16);

    // 2. Draw Lives Text
    let hearts = "";
    for (let i = 0; i < this.playerLives; i++) {
      hearts += "❤️";
    }
    this.hudText.setText(`HP  |  LIVES: ${hearts}  |  💎 ${this.playerGems}`);
  }

  private handlePlayerDiamondOverlap(player: any, diamond: any): void {
    const gem = diamond as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    if (!gem.active || gem.getData("collected")) return;
    gem.setData("collected", true);
    gem.body.enable = false; // Disable physics instantly to prevent multiple overlap counts

    // Increment gem count and update HUD
    this.playerGems += 1;
    this.updateHUD();

    // Visual effect: Tween scale to zero and destroy gem
    this.tweens.add({
      targets: gem,
      scale: 0,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        gem.destroy();
      }
    });
  }

  private handlePlayerSpikeCollision(player: any, spike: any): void {
    if (this.isGameOver || this.playerIsInvincible) return;

    // Flash screen red slightly, deal 25% damage, and bounce player back
    this.cameras.main.flash(100, 255, 0, 0);
    const s = spike as Phaser.Physics.Arcade.Sprite;
    const knockbackDirection = this.player.x < s.x ? -220 : 220;
    this.damagePlayer(25, knockbackDirection, -200);
  }

  private handlePlayerHealthOverlap(player: any, pack: any): void {
    if (this.playerHealth >= this.playerMaxHealth || this.isGameOver) return;

    // Consume health pack to restore up to 50 HP (max 100)
    this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 50);
    this.updateHUD();

    const healthPackSprite = pack as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    healthPackSprite.body.enable = false; // Disable physics overlap instantly

    this.tweens.add({
      targets: healthPackSprite,
      scale: 0,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        healthPackSprite.destroy();
        if (this.healthPack === healthPackSprite) {
          this.healthPack = null;
        }
      }
    });
  }

  private damagePlayer(amount: number, knockbackX: number, knockbackY: number): void {
    if (this.isGameOver || this.playerIsInvincible) return;
    this.playerIsInvincible = true;

    this.playerHealth -= amount;
    this.updateHUD();

    this.player.setTint(0xff0000);
    this.player.setVelocityX(knockbackX);
    this.player.setVelocityY(knockbackY);

    if (this.input.keyboard) {
      this.input.keyboard.enabled = false;
    }
    this.touchInputs.left = false;
    this.touchInputs.right = false;

    // Input lock and red color lasts 300ms
    this.time.delayedCall(300, () => {
      this.player.clearTint();
      if (this.input.keyboard && !this.isGameOver) {
        this.input.keyboard.enabled = true;
      }
    });

    // Invincibility visual flashing for 1 second
    let isVisible = true;
    const flashTimer = this.time.addEvent({
      delay: 100,
      callback: () => {
        isVisible = !isVisible;
        this.player.setVisible(isVisible);
      },
      repeat: 8
    });

    this.time.delayedCall(1000, () => {
      flashTimer.destroy();
      this.player.setVisible(true);
      this.playerIsInvincible = false;
    });

    if (this.playerHealth <= 0) {
      this.handlePlayerDeath();
    }
  }

  private handlePlayerDeath(): void {
    this.playerLives -= 1;
    this.updateHUD();

    if (this.playerLives <= 0) {
      this.triggerGameOver();
    } else {
      this.playerHealth = 100;
      this.updateHUD();

      // Reset position
      this.player.setPosition(200, 300);
      this.player.setVelocity(0, 0);
      this.activePlatform = null;

      // Enforce invincibility on respawn
      this.playerIsInvincible = true;
      this.player.clearTint();

      // Flash player for invincibility visual
      let isVisible = true;
      const flashTimer = this.time.addEvent({
        delay: 100,
        callback: () => {
          isVisible = !isVisible;
          this.player.setVisible(isVisible);
        },
        repeat: 10
      });

      this.time.delayedCall(1100, () => {
        flashTimer.destroy();
        this.player.setVisible(true);
        this.playerIsInvincible = false;
      });
    }
  }

  private triggerGameOver(): void {
    this.isGameOver = true;
    this.physics.pause();
    this.player.setVelocity(0, 0);
    this.player.play("idle");

    const gameOverText = this.add.text(400, 250, "GAME OVER", {
      fontFamily: "sans-serif",
      fontSize: "48px",
      color: "#ff3333",
      align: "center",
      stroke: "#000000",
      strokeThickness: 6,
    });
    gameOverText.setOrigin(0.5);
    gameOverText.setScrollFactor(0);

    const restartText = this.add.text(
      400,
      360,
      "Tap Screen or Press SPACE to restart",
      {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      },
    );
    restartText.setOrigin(0.5);
    restartText.setScrollFactor(0);

    const restartGame = () => {
      this.scene.restart();
    };

    this.input.once("pointerdown", restartGame);
    if (this.spaceKey) {
      this.spaceKey.once("down", restartGame);
    }
  }

  private handlePlayerEnemyCollision(player: any, enemy: any): void {
    const slime = enemy as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    if (slime.getData("isDying")) return;

    // If player is falling down on top of the enemy
    if (this.player.body.velocity.y > 0 && this.player.y < slime.y - 30) {
      // Bounce the player up
      this.player.setVelocityY(-300);
      this.killSlime(slime);
    } else {
      const isMedium = slime.getData("isMedium") as boolean;
      const damageAmount = isMedium ? 25 : 20; // at most 25% of life
      const knockbackDirection = this.player.x < slime.x ? -220 : 220;
      this.damagePlayer(damageAmount, knockbackDirection, -150);
    }
  }

  private handleLaserEnemyCollision(laser: any, enemy: any): void {
    if (!laser || !laser.active) return;

    this.lasers.remove(laser, true, true);

    const slime = enemy as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    if (slime.getData("isDying")) return;

    let hp = slime.getData("hp") as number;
    hp -= 1;
    slime.setData("hp", hp);

    if (hp <= 0) {
      this.killSlime(slime);
    } else {
      slime.setTint(0xffffff);
      this.time.delayedCall(150, () => {
        if (slime && slime.active && !slime.getData("isDying")) {
          const isMedium = slime.getData("isMedium") as boolean;
          if (isMedium) {
            slime.setTint(0xff8800);
          } else {
            slime.clearTint();
          }
        }
      });
    }
  }

  private handlePlayerBossCollision(player: any, bossSprite: any): void {
    if (this.bossHp <= 0 || this.isGameOver) return;

    // Stomp on boss head (player is falling and above boss) - bounces player without dealing damage
    if (this.player.body.velocity.y > 0 && this.player.y < this.boss!.y - 80) {
      this.player.setVelocityY(-350); // High bounce
    } else {
      const knockbackDirection = this.player.x < this.boss!.x ? -250 : 250;
      this.damagePlayer(40, knockbackDirection, -180);
    }
  }

  private handleLaserBossCollision(laser: any, bossSprite: any): void {
    if (!laser || !laser.active) return;

    // Remove laser from group and destroy its body and sprite cleanly
    this.lasers.remove(laser, true, true);

    if (this.bossHp <= 0 || this.isGameOver || this.bossIsInvincible) return;

    this.damageBoss(1); // Laser deals 1 damage
  }

  private damageBoss(amount: number): void {
    if (this.bossIsInvincible) return;
    this.bossIsInvincible = true;

    this.bossHp -= amount;

    // Hit flash effect
    this.boss!.setTint(0xffffff); // White flash
    this.cameras.main.shake(150, 0.005); // Screen shake feedback

    this.time.delayedCall(150, () => {
      if (this.bossHp > 0) {
        if (this.boss && this.boss.active) {
          this.boss.setTint(0xcc33ff); // Restore purple color
        }
        // End invincibility frame cooldown after flash ends (300ms total)
        this.time.delayedCall(150, () => {
          this.bossIsInvincible = false;
        });
      } else {
        this.killBoss();
      }
    });
  }

  private killBoss(): void {
    this.isGameOver = true;
    this.bossLabelText.setVisible(false);
    this.bossHealthBarGraphics.clear();

    // Disable physics and play death animation
    this.boss!.setVelocity(0, 0);
    this.boss!.body.enable = false;
    this.boss!.play("slime-die");

    this.boss!.on("animationcomplete", () => {
      this.boss!.destroy();
      this.boss = null;
      this.triggerVictory();
    });
  }

  private triggerVictory(): void {
    this.physics.pause();
    this.player.setVelocity(0, 0);
    this.player.play("idle");

    // Display level victory text overlay
    const victoryText = this.add.text(400, 250, "VICTORY!\nLevel 1 Complete", {
      fontFamily: "sans-serif",
      fontSize: "48px",
      color: "#ffd700",
      align: "center",
      stroke: "#000000",
      strokeThickness: 6,
    });
    victoryText.setOrigin(0.5);
    victoryText.setScrollFactor(0);

    // Prompt to restart
    const restartText = this.add.text(
      400,
      360,
      "Tap Screen or Press SPACE to restart",
      {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      },
    );
    restartText.setOrigin(0.5);
    restartText.setScrollFactor(0);

    const restartGame = () => {
      this.scene.restart();
    };

    this.input.once("pointerdown", restartGame);
    if (this.spaceKey) {
      this.spaceKey.once("down", restartGame);
    }
  }

  private updateBossHealthBar(): void {
    this.bossHealthBarGraphics.clear();

    if (
      !this.boss ||
      !this.boss.active ||
      this.bossHp <= 0 ||
      this.player.x < this.worldLength - 1200
    ) {
      return;
    }

    // Outer frame (dark border)
    this.bossHealthBarGraphics.fillStyle(0x000000, 0.6);
    this.bossHealthBarGraphics.fillRect(200, 40, 400, 18);

    // Inner health bar (red filling)
    this.bossHealthBarGraphics.fillStyle(0xdd2222, 1);
    const healthWidth = Math.max(0, (this.bossHp / this.bossMaxHp) * 396);
    this.bossHealthBarGraphics.fillRect(202, 42, healthWidth, 14);

    // Gold borders
    this.bossHealthBarGraphics.lineStyle(2, 0xffd700, 1);
    this.bossHealthBarGraphics.strokeRect(200, 40, 400, 18);
  }

  private setupTouchControls(): void {
    const setupButton = (
      id: string,
      key: "left" | "right" | "jump" | "shoot",
    ) => {
      const element = document.getElementById(id);
      if (!element) return;

      const handleStart = (e: Event) => {
        e.preventDefault();
        this.touchInputs[key] = true;
        element.classList.add("active");
      };

      const handleEnd = (e: Event) => {
        e.preventDefault();
        this.touchInputs[key] = false;
        element.classList.remove("active");
      };

      // Touch events
      element.addEventListener("touchstart", handleStart, { passive: false });
      element.addEventListener("touchend", handleEnd, { passive: false });
      element.addEventListener("touchcancel", handleEnd, { passive: false });

      // Mouse events for testing on desktop
      element.addEventListener("mousedown", handleStart);
      element.addEventListener("mouseup", handleEnd);
      element.addEventListener("mouseleave", handleEnd);
    };

    setupButton("btn-left", "left");
    setupButton("btn-right", "right");
    setupButton("btn-jump", "jump");
    setupButton("btn-shoot", "shoot");

    // Force show controls if touched anywhere on the screen initially
    const showControls = () => {
      const container = document.getElementById("touch-controls");
      if (container) {
        container.classList.add("force-show");
      }
      window.removeEventListener("touchstart", showControls);
    };
    window.addEventListener("touchstart", showControls);
  }

  private fireLaser(time: number): void {
    // Check shooting cooldown
    if (time < this.lastFired + 250) return;
    this.lastFired = time;

    // Laser position starts near character gun arm
    const facingLeft = this.player.flipX;
    const laserX = this.player.x + (facingLeft ? -25 : 25);
    const laserY = this.player.y + 2;

    const laser = this.lasers.create(
      laserX,
      laserY,
      "laser",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    laser.body.allowGravity = false;

    // Shoot direction and speed
    const velocityX = facingLeft ? -500 : 500;
    laser.setVelocityX(velocityX);

    // Fade and destroy laser after 800ms if it doesn't hit anything
    this.time.delayedCall(800, () => {
      if (laser.active) laser.destroy();
    });
  }

  override update(time: number): void {
    if (!this.player) return;

    if (this.isGameOver) {
      this.player.setVelocityX(0);
      return;
    }

    // 1. Player Movement Inputs
    let moveLeft = this.touchInputs.left;
    let moveRight = this.touchInputs.right;
    let jumpPressed = this.touchInputs.jump;
    let shootPressed = this.touchInputs.shoot;

    // Check keyboards inputs (only if enabled)
    if (this.input.keyboard && this.input.keyboard.enabled) {
      if (this.cursors) {
        if (this.cursors.left.isDown) moveLeft = true;
        if (this.cursors.right.isDown) moveRight = true;
        if (this.cursors.up.isDown) jumpPressed = true;
      }
      if (this.spaceKey && this.spaceKey.isDown) {
        shootPressed = true;
      }
    }

    const touchingDown = this.player.body.touching.down;

    // Detect if we just walked off the active platform
    if (
      this.wasTouchingDown &&
      !touchingDown &&
      this.activePlatform &&
      this.activePlatform.body
    ) {
      // Inherit the platform's velocity as starting horizontal drift momentum
      this.player.setVelocityX(
        this.player.body.velocity.x + this.activePlatform.body.velocity.x,
      );
      this.activePlatform = null;
    }
    this.wasTouchingDown = touchingDown;

    // Reset active platform if we are in the air and not touching anything
    if (!touchingDown) {
      this.activePlatform = null;
    }

    // Get active platform velocities if standing on one
    let platformVelocityX = 0;
    let platformVelocityY = 0;
    if (this.activePlatform && this.activePlatform.body) {
      platformVelocityX = this.activePlatform.body.velocity.x;
      platformVelocityY = this.activePlatform.body.velocity.y;
    }

    // Horizontal movement
    if (moveLeft) {
      // If standing on a moving platform, relative velocity: base velocity + platform velocity
      this.player.setVelocityX(-200 + platformVelocityX);
      this.player.setFlipX(true);
      if (touchingDown) {
        this.player.play("run", true);
      }
    } else if (moveRight) {
      this.player.setVelocityX(200 + platformVelocityX);
      this.player.setFlipX(false);
      if (touchingDown) {
        this.player.play("run", true);
      }
    } else {
      if (touchingDown) {
        // If on a platform, move with the platform, otherwise stop
        this.player.setVelocityX(platformVelocityX);
        this.player.play("idle", true);
      } else {
        // In the air: apply gentle horizontal deceleration/drag, but preserve the inertia/momentum
        this.player.setVelocityX(this.player.body.velocity.x * 0.985);
      }
    }

    // Jump logic
    if (jumpPressed && touchingDown) {
      // Base jump force of -380, plus vertical momentum if jumping off a platform moving upwards
      const jumpBoostY = -380 + (platformVelocityY < 0 ? platformVelocityY : 0);
      this.player.setVelocityY(jumpBoostY);

      // Add additional horizontal momentum from the platform to starting jump speed
      this.player.setVelocityX(this.player.body.velocity.x + platformVelocityX);
      this.player.play("jump", true);

      // Clear active platform since we are launching into the air
      this.activePlatform = null;
    }

    // Variable jump height: cut upward velocity if jump input is released early
    if (!jumpPressed && this.player.body.velocity.y < -100) {
      this.player.setVelocityY(this.player.body.velocity.y * 0.5);
    }

    // Fall animation handling
    if (!touchingDown && this.player.body.velocity.y > 0) {
      this.player.play("jump", true);
    }

    // Fire laser logic
    if (shootPressed) {
      this.fireLaser(time);
    }

    // 2. Enemy Behavior (Walk back & forth, random turns for each slime)
    this.enemies.getChildren().forEach((child) => {
      const slime = child as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      if (!slime || !slime.active || slime.getData("isDying")) return;

      let direction = slime.getData("direction") as number;

      // Check blockages to turn around
      if (slime.body.blocked.left) {
        direction = 1;
        slime.setData("direction", direction);
      } else if (slime.body.blocked.right) {
        direction = -1;
        slime.setData("direction", direction);
      }

      // Random turn direction occasionally (0.6% chance per frame)
      if (Math.random() < 0.006) {
        direction *= -1;
        slime.setData("direction", direction);
      }

      slime.setVelocityX(direction * 90);
      // Sprite naturally faces left, so flipX should be true when walking right
      slime.setFlipX(direction > 0);
    });

    // 3. Platform Movement Updates
    // Horizontal platform X moves back and forth between x = 200 and x = 500
    if (this.platX && this.platX.body) {
      if (this.platX.x >= 500) {
        this.platX.setVelocityX(-80);
      } else if (this.platX.x <= 200) {
        this.platX.setVelocityX(80);
      }
    }

    // Vertical platform Y moves back and forth between y = 220 and y = 470
    if (this.platY && this.platY.body) {
      if (this.platY.y >= 470) {
        this.platY.setVelocityY(-60);
      } else if (this.platY.y <= 220) {
        this.platY.setVelocityY(60);
      }
    }

    // Orbital Platform rotation (remains horizontal for perfect collision, but paths in a circle)
    if (this.platRotate && this.platRotate.body) {
      let angle = this.platRotate.getData("orbitAngle") as number;
      angle += 0.015; // Slow incremental orbital angle
      this.platRotate.setData("orbitAngle", angle);

      const cx = this.platRotate.getData("centerX") as number;
      const cy = this.platRotate.getData("centerY") as number;
      const r = this.platRotate.getData("radius") as number;

      const targetX = cx + Math.cos(angle) * r;
      const targetY = cy + Math.sin(angle) * r;

      // Calculate velocities required to arrive at target positions in the next step
      const vx = (targetX - this.platRotate.x) * 60;
      const vy = (targetY - this.platRotate.y) * 60;
      this.platRotate.setVelocity(vx, vy);
    }

    // 4. Boss behavior (Walks back and forth in its arena: 2x faster than normal monsters at 180 speed)
    if (this.boss && this.boss.active && this.bossHp > 0) {
      if (this.player.x > this.worldLength - 1200) {
        this.bossLabelText.setVisible(true);
      }

      // Check blockages or bounds
      const minX = this.worldLength - 1000; // 3800
      const maxX = this.worldLength - 50; // 4750
      if (this.boss.x >= maxX || this.boss.body.blocked.right) {
        this.bossDirection = -1;
      } else if (this.boss.x <= minX || this.boss.body.blocked.left) {
        this.bossDirection = 1;
      }

      this.boss.setVelocityX(this.bossDirection * 180); // 180 speed (2x of slimes)
      this.boss.setFlipX(this.bossDirection > 0);

      // Slime boss leaps into the air occasionally (1.5% chance per frame when touching ground)
      if (this.boss.body.touching.down && Math.random() < 0.015) {
        this.boss.setVelocityY(-400); // Massive leap!
      }
    }

    // 5. Gem Bobbing Animation
    this.diamonds.getChildren().forEach((child) => {
      const gem = child as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      const startY = gem.getData("startY") as number;
      if (startY !== undefined) {
        // Smooth bobbing up and down
        gem.y = startY + Math.sin(time / 200) * 8;
      }
    });

    // 6. Health Pack Bobbing Animation
    if (this.healthPack && this.healthPack.active) {
      this.healthPack.y = 290 + Math.sin(time / 250) * 5;
    }

    this.updateBossHealthBar();
  }
}

// 2. Main Game Configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  backgroundColor: "#1a1a2e", // Nice cosmic dark background
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 350, x: 0 }, // Slightly higher gravity for crisper jumping
      debug: false,
    },
  },
  scene: GameScene,
};

// Initialize the game instance
new Phaser.Game(config);
