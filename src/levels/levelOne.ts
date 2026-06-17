import Phaser from "phaser";

// Import enemy spritesheets
import slimeWalkImg from "../assets/Monsters/Slime/walk.png";
import slimeDeathImg from "../assets/Monsters/Slime/death.png";
import slimeAttackImg from "../assets/Monsters/Slime/attack.png";

// Import diamond item
import diamondImg from "../assets/Space Runner/Other sprites/Diamond.png";
import tileSetImg from "../assets/Space Runner/Tiles/RunnerTileSet.png";

import { Player } from "../player";
import { SlimeBoss } from "../enemies/slimeBoss";
import { networkManager } from "../network";

export class LevelOne extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private lasers!: Phaser.Physics.Arcade.Group;
  private bg!: Phaser.GameObjects.TileSprite;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private platX!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private platY!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private platDiag!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private touchInputs = {
    left: false,
    right: false,
    jump: false,
    down: false,
  };
  private lastFired = 0; // Throttling for firing laser

  private worldLength = 1600 * 3;

  // Player state
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private diamonds!: Phaser.Physics.Arcade.Group;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private healthPack!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null;

  // Boss state
  private boss!: SlimeBoss | null;
  private bossHealthBarGraphics!: Phaser.GameObjects.Graphics;
  private bossLabelText!: Phaser.GameObjects.Text;
  private isGameOver = false;
  private isAutoWalking = false;
  private activeBlocks: Phaser.Physics.Arcade.Sprite[] = [];

  private isMultiplayer = false;
  private isHostPlayer = false;
  private remotePlayer: Player | null = null;
  private unsubscribeNetwork: (() => void) | null = null;

  constructor() {
    super("LevelOne");
  }

  init(data: { multiplayer?: boolean; isHost?: boolean }): void {
    this.isMultiplayer = !!data.multiplayer;
    this.isHostPlayer = !!data.isHost;
    this.remotePlayer = null;
  }

  preload(): void {
    // Load Slime enemy spritesheets
    this.load.spritesheet("slime-walk", slimeWalkImg, {
      frameWidth: 156,
      frameHeight: 156,
    });
    this.load.spritesheet("slime-death", slimeDeathImg, {
      frameWidth: 156,
      frameHeight: 156,
    });
    this.load.spritesheet("slime-attack", slimeAttackImg, {
      frameWidth: 156,
      frameHeight: 156,
    });

    // Load Diamond texture
    this.load.image("diamond", diamondImg);

    // Load Tileset spritesheet
    this.load.spritesheet("tiles", tileSetImg, {
      frameWidth: 16,
      frameHeight: 16,
    });
    Player.preload(this);
  }
  private setPlatformTexture(texture: Phaser.Textures.CanvasTexture | null) {
    if (texture) {
      const context = texture.context;
      const tilesTexture = this.textures.get("tiles");
      const frame = tilesTexture.get(4);

      const sourceImage = frame.source.image;
      if (sourceImage) {
        const sx = frame.cutX;
        const sy = frame.cutY;
        const sWidth = frame.cutWidth;
        const sHeight = frame.cutHeight;

        for (let i = 0; i < 8; i++) {
          // Draw the 16x16 tile frame scaled to 20x20 onto the canvas
          context.drawImage(
            sourceImage,
            sx,
            sy,
            sWidth,
            sHeight,
            i * 20,
            0,
            20,
            20,
          );
        }
      }
      // Instantly upload the canvas pixels to the GPU
      texture.refresh();
    }
  }
  create(): void {
    // Reset state variables on restart
    Player.createAnimations(this);
    this.player = new Player(this, 200, 300);
    if (this.isMultiplayer) {
      if (!this.isHostPlayer) {
        // Player 2 is red spaceman
        this.player.setTint(0xff3333);
      }

      this.remotePlayer = new Player(this, 200, 300);
      this.remotePlayer.body.setAllowGravity(false);
      this.remotePlayer.body.enable = false;
      if (this.isHostPlayer) {
        // Player 2 is red spaceman
        this.remotePlayer.setTint(0xff3333);
      }

      // Network listener
      this.unsubscribeNetwork = networkManager.onMessage((data) => {
        if (data.type === "move") {
          if (this.remotePlayer) {
            this.remotePlayer.setPosition(data.x, data.y);
            this.remotePlayer.body.setVelocity(data.vx, data.vy);
            this.remotePlayer.setFlipX(data.flipX);
            if (data.anim) {
              this.remotePlayer.play(data.anim, true);
            }
            this.remotePlayer.health = data.health;
            this.remotePlayer.lives = data.lives;
            this.remotePlayer.gems = data.gems;
            this.remotePlayer.isInvincible = data.isInvincible;
            if (data.isInvincible) {
              this.remotePlayer.setAlpha(0.5);
            } else {
              this.remotePlayer.setAlpha(1.0);
            }
          }

          // Host dictates platform positions to client to prevent desync
          if (!this.isHostPlayer) {
            if (data.platX && this.platX) {
              this.platX.setPosition(data.platX.x, data.platX.y);
              this.platX.body.setVelocity(data.platX.vx, data.platX.vy);
            }
            if (data.platY && this.platY) {
              this.platY.setPosition(data.platY.x, data.platY.y);
              this.platY.body.setVelocity(data.platY.vx, data.platY.vy);
            }
            if (data.platDiag && this.platDiag) {
              this.platDiag.setPosition(data.platDiag.x, data.platDiag.y);
              this.platDiag.body.setVelocity(data.platDiag.vx, data.platDiag.vy);
            }
          }
        } else if (data.type === "fire_laser") {
          this.spawnRemoteLaser(data.x, data.y, data.facingLeft);
        } else if (data.type === "spawn_block") {
          this.spawnRemoteBlock(data.x, data.y);
        } else if (data.type === "loadLevel") {
          if (!this.isHostPlayer) {
            this.scene.start(data.levelName, {
              multiplayer: true,
              isHost: false,
              health: data.stats.health,
              lives: data.stats.lives,
              gems: data.stats.gems,
            });
          }
        }
      });
    }
    
    this.healthPack = null;
    this.isGameOver = false;
    this.activeBlocks = [];

    // Cleanup network subscription on shutdown
    this.events.on("shutdown", () => {
      if (this.unsubscribeNetwork) {
        this.unsubscribeNetwork();
        this.unsubscribeNetwork = null;
      }
    });

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
    Player.createAnimations(this);
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

    // Place the ground tiles (each 40px wide at 2.5x scale)
    const tileWidth = 40;
    const numTiles = Math.ceil(this.worldLength / tileWidth);
    for (let i = 0; i < numTiles; i++) {
      const x = i * tileWidth + tileWidth / 2;
      const y = 580; // Sit on the bottom of the screen (600 - 20)
      const tile = groundGroup.create(
        x,
        y,
        "tiles",
        1,
      ) as Phaser.Physics.Arcade.Sprite;
      tile.setScale(2.5);
      tile.refreshBody();
    }

    // Generate platform texture (150 wide, 20 high) by tiling frame 4 (glowing orange vents) synchronously onto a CanvasTexture
    // Generate platform texture (150 wide, 20 high) by tiling frame 4 (glowing orange vents) synchronously onto a CanvasTexture
    const canvasTexture = this.textures.createCanvas("platform", 150, 20);
    this.setPlatformTexture(canvasTexture);

    if (!this.textures.exists("playerPlatform")) {
      const canvasTexturePlayerMade = this.textures.createCanvas(
        "playerPlatform",
        30,
        20,
      );
      if (canvasTexturePlayerMade) {
        const context = canvasTexturePlayerMade.context;
        const tilesTexture = this.textures.get("tiles");
        const frame = tilesTexture.get(4);
        const sourceImage = frame.source.image;
        if (sourceImage) {
          context.drawImage(
            sourceImage,
            frame.cutX,
            frame.cutY,
            frame.cutWidth,
            frame.cutHeight,
            0,
            0,
            30,
            20,
          );
        }
        canvasTexturePlayerMade.refresh();
      }
    }

    // Create moving and rotating platforms physics group
    this.movingPlatforms = this.physics.add.group();

    // Spawn platforms in the level
    this.platX = this.movingPlatforms.create(
      300,
      420,
      "platform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.platDiag = this.movingPlatforms.create(
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

    // Set velocities for the moving platforms
    this.platX.setVelocityX(80);
    this.platY.setVelocityY(60);
    this.platDiag.setVelocity(80, 80);

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

    this.anims.create({
      key: "slime-attack",
      frames: this.anims.generateFrameNumbers("slime-attack", {
        start: 0,
        end: 18,
      }),
      frameRate: 14,
      repeat: 0,
    });

    // Instantiate player with Astronaut spritesheet (already instantiated in create start)

    // Create Enemies physics group
    this.enemies = this.physics.add.group();

    // Spawn 4 initial slimes across the map (excluding boss area)
    this.spawnSlime(800, 300, false);
    this.spawnSlime(1600, 300, true);
    this.spawnSlime(2400, 300, false);
    this.spawnSlime(3200, 300, true);

    // Spawn Super Slime Boss at the end of the map (x = this.worldLength - 350, y = 450 to start close to ground)
    this.boss = new SlimeBoss(this, this.worldLength - 350, 450);

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
      const gem = this.diamonds.create(
        point.x,
        point.y,
        "diamond",
      ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
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
        // Ground top y level is 560 (580 center - 20 half-height). Spike height is 24, so center y is 560 - 12 = 548
        const spike = this.spikes.create(
          x,
          548,
          "spike",
        ) as Phaser.Physics.Arcade.Sprite;
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
    this.healthPack = this.physics.add.sprite(
      1350,
      290,
      "heartPack",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
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
      const bKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
      bKey.on("down", () => {
        this.spawnPlayerBlock();
      });
    }

    // Initialize Boss HUD graphics
    this.bossHealthBarGraphics = this.add.graphics();
    this.bossHealthBarGraphics.setScrollFactor(0);

    this.bossLabelText = this.add.text(400, 12, "OFUR SLÍM", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
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
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.hudText.setScrollFactor(0);
    this.updateHUD();
    // Place crude building entrance at the end of the map (right edge of the world is 4800, ground y is 560)
    const entranceX = this.worldLength - 180; // 4620
    const entranceY = 440; // 560 - 120
    const baseEntrance = this.add.graphics();
    // Exterior grey walls
    baseEntrance.fillStyle(0x33333d, 1);
    baseEntrance.fillRect(entranceX, entranceY, 120, 120);
    // Cyan neon frame
    baseEntrance.lineStyle(4, 0x00ffcc, 1);
    baseEntrance.strokeRect(entranceX, entranceY, 120, 120);
    // Black door frame
    baseEntrance.fillStyle(0x050505, 1);
    baseEntrance.fillRect(entranceX + 35, entranceY + 40, 50, 80);
    // Magenta neon door highlight
    baseEntrance.lineStyle(2, 0xff00ff, 1);
    baseEntrance.strokeRect(entranceX + 35, entranceY + 40, 50, 80);

    // Add screen tap listener to fire laser (ignoring control buttons)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const target = pointer.event.target as HTMLElement;
      if (target && target.closest(".control-btn")) {
        return;
      }
      this.fireLaser(this.time.now);
    });

    // Set up touch control listeners
    this.setupTouchControls();
  }

  private handlePlayerPlatformCollision(_player: any, platform: any): void {
    const plat = platform as Phaser.Physics.Arcade.Sprite;
    if (this.player.body.touching.down) {
      this.player.activePlatform = plat;
      this.player.relativeX = this.player.x - plat.x;
      this.player.body.setAllowGravity(true); // Always keep gravity enabled to prevent separation jitters
    }
  }

  private spawnSlime(x: number, _y: number, isMedium = false): void {
    // Determine Y coordinate dynamically so slimes spawn flat on the ground (top Y is 560)
    // Small slime center Y = 560 - 18 = 542
    // Medium slime center Y = 560 - 24 = 536
    const spawnY = isMedium ? 536 : 542;

    const slime = this.enemies.create(
      x,
      spawnY,
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

    const healthPercent = Math.max(
      0,
      this.player.health / this.player.maxHealth,
    );
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
    for (let i = 0; i < this.player.lives; i++) {
      hearts += "❤️";
    }
    this.hudText.setText(`HP  |  LIVES: ${hearts}  |  💎 ${this.player.gems}`);
  }

  private handlePlayerDiamondOverlap(_player: any, diamond: any): void {
    const gem = diamond as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    if (!gem.active || gem.getData("collected")) return;
    gem.setData("collected", true);
    gem.body.enable = false; // Disable physics instantly to prevent multiple overlap counts

    // Increment gem count and update HUD
    this.player.gems += 1;
    this.updateHUD();

    // Visual effect: Tween scale to zero and destroy gem
    this.tweens.add({
      targets: gem,
      scale: 0,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        gem.destroy();
      },
    });
  }

  private handlePlayerSpikeCollision(_player: any, spike: any): void {
    if (this.isGameOver || this.player.isInvincible) return;

    // Flash screen red slightly, deal 25% damage, and bounce player back
    this.cameras.main.flash(100, 255, 0, 0);
    const s = spike as Phaser.Physics.Arcade.Sprite;
    const knockbackDirection = this.player.x < s.x ? -220 : 220;
    this.damagePlayer(25, knockbackDirection, -200);
  }

  private handlePlayerHealthOverlap(_player: any, pack: any): void {
    if (this.player.health >= this.player.maxHealth || this.isGameOver) return;

    // Consume health pack to restore up to 50 HP (max 100)
    this.player.health = Math.min(
      this.player.maxHealth,
      this.player.health + 50,
    );
    this.updateHUD();

    const healthPackSprite =
      pack as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
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
      },
    });
  }

  private damagePlayer(
    amount: number,
    knockbackX: number,
    knockbackY: number,
  ): void {
    if (this.isGameOver || this.player.isInvincible) return;
    this.player.isInvincible = true;

    // Restore gravity and clear platform state if damaged
    this.player.body.setAllowGravity(true);
    this.player.activePlatform = null;

    this.player.health -= amount;
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
      repeat: 8,
    });

    this.time.delayedCall(1000, () => {
      flashTimer.destroy();
      this.player.setVisible(true);
      this.player.isInvincible = false;
    });

    if (this.player.health <= 0) {
      this.player.handleRespawn();
      this.updateHUD();

      if (this.player.lives <= 0) {
        this.triggerGameOver();
      }
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

    // Scene switching: Callback function to restart the current scene (GameScene) on retry/restart
    const restartGame = () => {
      this.scene.restart();
    };

    // Scene switching: Bind temporary click or spacebar handlers to trigger the scene restart
    this.input.once("pointerdown", restartGame);
    if (this.spaceKey) {
      this.spaceKey.once("down", restartGame);
    }
  }

  private handlePlayerEnemyCollision(_player: any, enemy: any): void {
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

  private handlePlayerBossCollision(_player: any, _bossSprite: any): void {
    if (!this.boss || this.boss.hp <= 0 || this.isGameOver) return;

    // Stomp on boss head (player is falling and above boss) - bounces player without dealing damage
    if (this.player.body.velocity.y > 0 && this.player.y < this.boss.y - 80) {
      this.player.setVelocityY(-350); // High bounce
    } else {
      const knockbackDirection = this.player.x < this.boss.x ? -250 : 250;
      this.damagePlayer(40, knockbackDirection, -180);
    }
  }

  private handleLaserBossCollision(laser: any, _bossSprite: any): void {
    if (!laser || !laser.active) return;

    // Remove laser from group and destroy its body and sprite cleanly
    this.lasers.remove(laser, true, true);

    if (
      !this.boss ||
      this.boss.hp <= 0 ||
      this.isGameOver ||
      this.boss.isInvincible
    )
      return;

    this.damageBoss(1); // Laser deals 1 damage
  }

  private damageBoss(amount: number): void {
    if (!this.boss || this.boss.isInvincible) return;
    this.boss.isInvincible = true;

    this.boss.hp -= amount;

    // Hit flash effect
    this.boss.setTint(0xffffff); // White flash
    this.cameras.main.shake(150, 0.005); // Screen shake feedback

    this.time.delayedCall(150, () => {
      if (this.boss && this.boss.hp > 0) {
        if (this.boss.active) {
          this.boss.setTint(0xcc33ff); // Restore purple color
        }
        // End invincibility frame cooldown after flash ends (300ms total)
        this.time.delayedCall(150, () => {
          if (this.boss) this.boss.isInvincible = false;
        });
      } else {
        this.killBoss();
      }
    });
  }

  private killBoss(): void {
    if (!this.boss) return;
    this.bossLabelText.setVisible(false);
    this.bossHealthBarGraphics.clear();

    // Disable physics and play death animation
    this.boss.setVelocity(0, 0);
    this.boss.body.enable = false;
    this.boss.play("slime-die");

    this.boss.on("animationcomplete", () => {
      if (this.boss) {
        this.boss.destroy();
        this.boss = null;
      }
      // Start auto walk sequence instead of showing victory screen instantly
      this.isAutoWalking = true;
      if (this.input.keyboard) {
        this.input.keyboard.enabled = false;
      }
    });
  }

  private triggerVictory(): void {
    this.physics.pause();
    this.player.setVelocity(0, 0);
    this.player.play("idle");

    // Add spaceman speech bubble above player's head
    const bubbleText = this.add.text(
      this.player.x,
      this.player.y - 70,
      "jæja nú hreinsum við rotturnar",
      {
        fontFamily: "sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#00ffcc",
        backgroundColor: "#111122",
        padding: { x: 10, y: 6 },
        stroke: "#ffffff",
        strokeThickness: 1.5,
        align: "left",
      },
    );
    bubbleText.setOrigin(0.5);

    // Display level victory text overlay
    const victoryText = this.add.text(
      400,
      220,
      "SÚPER SLÍMIÐ ER SIGRAÐ!\nNúna förum við inní base-ið okkar og sjáum um rotturnar...",
      {
        fontFamily: "sans-serif",
        fontSize: "26px",
        fontStyle: "bold",
        color: "#ffd700",
        align: "center",
        stroke: "#000000",
        strokeThickness: 5,
      },
    );
    victoryText.setOrigin(0.5);
    victoryText.setScrollFactor(0);

    // Prompt to proceed to Level 2
    const proceedText = this.add.text(
      400,
      340,
      "Ýttu á space eða á skáinn til að fara inní base-ið",
      {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      },
    );
    proceedText.setOrigin(0.5);
    proceedText.setScrollFactor(0);

    // Scene switching: Callback function to start LevelTwo
    const startLevelTwo = () => {
      const stats = {
        health: this.player.health,
        lives: this.player.lives,
        gems: this.player.gems,
      };
      if (this.isMultiplayer && this.isHostPlayer) {
        networkManager.send({
          type: "loadLevel",
          levelName: "LevelTwo",
          stats: stats,
        });
      }
      this.scene.start("LevelTwo", {
        multiplayer: this.isMultiplayer,
        isHost: this.isHostPlayer,
        ...stats
      });
    };

    // Scene switching: Bind temporary click or spacebar handlers
    this.input.once("pointerdown", startLevelTwo);
    if (this.spaceKey) {
      this.spaceKey.once("down", startLevelTwo);
    }
  }

  private updateBossHealthBar(): void {
    this.bossHealthBarGraphics.clear();

    if (
      !this.boss ||
      !this.boss.active ||
      this.boss.hp <= 0 ||
      this.player.x < this.worldLength - 1200
    ) {
      return;
    }

    // Outer frame (dark border)
    this.bossHealthBarGraphics.fillStyle(0x000000, 0.6);
    this.bossHealthBarGraphics.fillRect(200, 40, 400, 18);

    // Inner health bar (red filling)
    this.bossHealthBarGraphics.fillStyle(0xdd2222, 1);
    const healthWidth = Math.max(0, (this.boss.hp / this.boss.maxHp) * 396);
    this.bossHealthBarGraphics.fillRect(202, 42, healthWidth, 14);

    // Gold borders
    this.bossHealthBarGraphics.lineStyle(2, 0xffd700, 1);
    this.bossHealthBarGraphics.strokeRect(200, 40, 400, 18);
  }

  private setupTouchControls(): void {
    const setupButton = (
      id: string,
      key: "left" | "right" | "jump" | "down",
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
    setupButton("btn-down", "down");

    const buildBtn = document.getElementById("btn-build");
    if (buildBtn) {
      const handleBuild = (e: Event) => {
        e.preventDefault();
        this.spawnPlayerBlock();
        buildBtn.classList.add("active");
        setTimeout(() => buildBtn.classList.remove("active"), 100);
      };
      buildBtn.addEventListener("touchstart", handleBuild, { passive: false });
      buildBtn.addEventListener("mousedown", handleBuild);
    }

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

    if (this.isMultiplayer) {
      networkManager.send({
        type: "fire_laser",
        x: laserX,
        y: laserY,
        facingLeft: facingLeft
      });
    }

    // Fade and destroy laser after 800ms if it doesn't hit anything
    this.time.delayedCall(800, () => {
      if (laser.active) laser.destroy();
    });
  }

  private spawnRemoteLaser(x: number, y: number, facingLeft: boolean): void {
    const laser = this.lasers.create(
      x,
      y,
      "laser",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    laser.body.allowGravity = false;
    const velocityX = facingLeft ? -500 : 500;
    laser.setVelocityX(velocityX);
    this.time.delayedCall(800, () => {
      if (laser.active) laser.destroy();
    });
  }

  private spawnPlayerBlock(): void {
    if (!this.player || this.isGameOver) return;

    // Center block underneath the player
    const spawnX = this.player.x;
    const spawnY = this.player.y + 40;

    const block = this.movingPlatforms.create(
      spawnX,
      spawnY,
      "playerPlatform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    block.body.allowGravity = false;
    block.setImmovable(true);
    block.body.setSize(30, 20);
    block.body.setOffset(0, 0);
    block.refreshBody();

    // Track the block in the active list
    this.activeBlocks.push(block);

    if (this.isMultiplayer) {
      networkManager.send({
        type: "spawn_block",
        x: spawnX,
        y: spawnY
      });
    }

    // 1-minute TTL: fade out and destroy
    this.time.delayedCall(60000, () => {
      if (block.active) {
        // Remove from tracking list if it's still in there
        const index = this.activeBlocks.indexOf(block);
        if (index > -1) {
          this.activeBlocks.splice(index, 1);
        }
        this.tweens.add({
          targets: block,
          alpha: 0,
          scale: 0,
          duration: 300,
          onComplete: () => {
            block.destroy();
          },
        });
      }
    });

    // Capacity constraint: at most 5 blocks. Oldest block fades out and gets destroyed immediately.
    if (this.activeBlocks.length > 5) {
      const oldest = this.activeBlocks.shift();
      if (oldest && oldest.active) {
        this.tweens.add({
          targets: oldest,
          alpha: 0,
          scale: 0,
          duration: 300,
          onComplete: () => {
            oldest.destroy();
          },
        });
      }
    }
  }

  private spawnRemoteBlock(x: number, y: number): void {
    const block = this.movingPlatforms.create(
      x,
      y,
      "playerPlatform",
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    block.body.allowGravity = false;
    block.setImmovable(true);
    block.body.setSize(30, 20);
    block.body.setOffset(0, 0);
    block.refreshBody();

    this.activeBlocks.push(block);

    this.time.delayedCall(60000, () => {
      if (block.active) {
        const index = this.activeBlocks.indexOf(block);
        if (index > -1) {
          this.activeBlocks.splice(index, 1);
        }
        this.tweens.add({
          targets: block,
          alpha: 0,
          scale: 0,
          duration: 300,
          onComplete: () => {
            block.destroy();
          },
        });
      }
    });

    if (this.activeBlocks.length > 5) {
      const oldest = this.activeBlocks.shift();
      if (oldest && oldest.active) {
        this.tweens.add({
          targets: oldest,
          alpha: 0,
          scale: 0,
          duration: 300,
          onComplete: () => {
            oldest.destroy();
          },
        });
      }
    }
  }

  override update(time: number, delta: number): void {
    if (!this.player) return;

    if (this.isMultiplayer) {
      const state: any = {
        type: "move",
        x: this.player.x,
        y: this.player.y,
        vx: this.player.body.velocity.x,
        vy: this.player.body.velocity.y,
        flipX: this.player.flipX,
        anim: this.player.anims.currentAnim ? this.player.anims.currentAnim.key : "idle",
        health: this.player.health,
        lives: this.player.lives,
        gems: this.player.gems,
        isInvincible: this.player.isInvincible,
      };
      if (this.isHostPlayer) {
        state.platX = this.platX ? { x: this.platX.x, y: this.platX.y, vx: this.platX.body.velocity.x, vy: this.platX.body.velocity.y } : null;
        state.platY = this.platY ? { x: this.platY.x, y: this.platY.y, vx: this.platY.body.velocity.x, vy: this.platY.body.velocity.y } : null;
        state.platDiag = this.platDiag ? { x: this.platDiag.x, y: this.platDiag.y, vx: this.platDiag.body.velocity.x, vy: this.platDiag.body.velocity.y } : null;
      }
      networkManager.send(state);
    }

    if (this.isAutoWalking) {
      this.player.setVelocityX(150);
      this.player.setFlipX(false);
      if (this.player.body.touching.down || this.player.activePlatform) {
        this.player.play("run", true);
      }
      // Reached the building door (entranceX + 35 is 4655)
      if (this.player.x >= this.worldLength - 145) {
        this.isAutoWalking = false;
        this.isGameOver = true;
        this.triggerVictory();
      }
      return;
    }

    if (this.isGameOver) {
      this.player.setVelocityX(0);
      return;
    }

    // 1. Player Movement Inputs
    let moveLeft = this.touchInputs.left;
    let moveRight = this.touchInputs.right;
    let jumpPressed = this.touchInputs.jump;
    let downPressed = this.touchInputs.down;
    let shootPressed = false;

    // Check keyboards inputs (only if enabled)
    if (this.input.keyboard && this.input.keyboard.enabled) {
      if (this.cursors) {
        if (this.cursors.left.isDown) moveLeft = true;
        if (this.cursors.right.isDown) moveRight = true;
        if (this.cursors.up.isDown) jumpPressed = true;
        if (this.cursors.down.isDown) downPressed = true;
      }
      if (this.spaceKey && this.spaceKey.isDown) {
        shootPressed = true;
      }
    }

    const touchingDown = this.player.body.touching.down;

    // Old platform check cleaned up in favor of active horizontal bounds checks

    // Platform riding updates (relative reference frame calculations)
    let platformVelocityX = 0;
    let platformVelocityY = 0;

    if (this.player.activePlatform && this.player.activePlatform.body) {
      // Lock relative vertical alignment
      this.player.y = this.player.activePlatform.y - 29.5;

      // Update relative X based on user input
      const speed = 200;
      const dt = delta / 1000;

      if (moveLeft) {
        this.player.relativeX -= speed * dt;
        this.player.setFlipX(true);
        this.player.play("run", true);
      } else if (moveRight) {
        this.player.relativeX += speed * dt;
        this.player.setFlipX(false);
        this.player.play("run", true);
      } else {
        this.player.play("idle", true);
      }

      // Check if player walked off the edge (platform width is 150, half-width is 75)
      if (this.player.relativeX < -75) {
        this.player.body.setAllowGravity(true);
        this.player.x = this.player.activePlatform.x - 75.1;
        this.player.setVelocityX(
          -200 + this.player.activePlatform.body.velocity.x,
        );
        this.player.activePlatform = null;
      } else if (this.player.relativeX > 75) {
        this.player.body.setAllowGravity(true);
        this.player.x = this.player.activePlatform.x + 75.1;
        this.player.setVelocityX(
          200 + this.player.activePlatform.body.velocity.x,
        );
        this.player.activePlatform = null;
      } else {
        // Snap player position relative to the platform center
        this.player.x = this.player.activePlatform.x + this.player.relativeX;
        platformVelocityX = this.player.activePlatform.body.velocity.x;
        platformVelocityY = this.player.activePlatform.body.velocity.y;
        this.player.setVelocityX(platformVelocityX);
        this.player.setVelocityY(platformVelocityY);
      }
    }

    // Normal player movement inputs (only if not on a platform)
    if (!this.player.activePlatform) {
      if (moveLeft) {
        this.player.setVelocityX(-200);
        this.player.setFlipX(true);
        if (touchingDown) {
          this.player.play("run", true);
        }
      } else if (moveRight) {
        this.player.setVelocityX(200);
        this.player.setFlipX(false);
        if (touchingDown) {
          this.player.play("run", true);
        }
      } else {
        if (touchingDown) {
          this.player.setVelocityX(0);
          this.player.play("idle", true);
        } else {
          // In the air: apply gentle horizontal deceleration/drag
          this.player.setVelocityX(this.player.body.velocity.x * 0.985);
        }
      }
    }

    // Jump logic
    if (jumpPressed && (touchingDown || this.player.activePlatform)) {
      // Restore gravity and clear platform state on jump
      this.player.body.setAllowGravity(true);
      const platformVelX =
        this.player.activePlatform && this.player.activePlatform.body
          ? this.player.activePlatform.body.velocity.x
          : 0;
      const platformVelY =
        this.player.activePlatform && this.player.activePlatform.body
          ? this.player.activePlatform.body.velocity.y
          : 0;

      // Base jump force of -380, plus vertical momentum if jumping off a platform moving upwards
      const jumpBoostY = -380 + (platformVelY < 0 ? platformVelY : 0);
      this.player.setVelocityY(jumpBoostY);

      // Add additional horizontal momentum from the platform to starting jump speed
      this.player.setVelocityX(this.player.body.velocity.x + platformVelX);
      this.player.play("jump", true);

      // Clear active platform since we are launching into the air
      this.player.activePlatform = null;
    }

    // Drop down logic
    if (downPressed && this.player.activePlatform) {
      // Restore gravity and clear platform state
      this.player.body.setAllowGravity(true);
      // Nudge player downward past the platform collision boundary
      this.player.y += 25;
      this.player.setVelocityY(200); // downward push
      this.player.activePlatform = null;
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

      const isMedium = slime.getData("isMedium") as boolean;
      let direction = slime.getData("direction") as number;

      // Check if currently playing the attack animation
      const isAttacking =
        slime.anims.currentAnim &&
        slime.anims.currentAnim.key === "slime-attack" &&
        slime.anims.isPlaying;

      if (isMedium) {
        const distToPlayerX = this.player.x - slime.x;
        const absDistX = Math.abs(distToPlayerX);
        const absDistY = Math.abs(this.player.y - slime.y);

        // If player is close horizontally (120px) and vertically (50px), attack!
        if (absDistX < 120 && absDistY < 50 && !isAttacking) {
          slime.setVelocityX(0); // Stop moving during attack
          slime.play("slime-attack");
          // Face the player
          direction = distToPlayerX < 0 ? -1 : 1;
          slime.setData("direction", direction);
          slime.setFlipX(direction < 0);
        } else if (!isAttacking) {
          // Smart AI tracking player if within 450px
          if (absDistX < 450) {
            direction = distToPlayerX < 0 ? -1 : 1;
            slime.setData("direction", direction);
          } else {
            // Patrol standard back & forth
            if (slime.body.blocked.left) {
              direction = 1;
              slime.setData("direction", direction);
            } else if (slime.body.blocked.right) {
              direction = -1;
              slime.setData("direction", direction);
            }
            if (Math.random() < 0.006) {
              direction *= -1;
              slime.setData("direction", direction);
            }
          }
          slime.setVelocityX(direction * 90);
          slime.setFlipX(direction > 0);
          slime.play("slime-move", true); // Loop walk
        } else {
          // If attacking, stay still
          slime.setVelocityX(0);
        }
      } else {
        // Standard normal slime logic
        if (slime.body.blocked.left) {
          direction = 1;
          slime.setData("direction", direction);
        } else if (slime.body.blocked.right) {
          direction = -1;
          slime.setData("direction", direction);
        }
        if (Math.random() < 0.006) {
          direction *= -1;
          slime.setData("direction", direction);
        }
        slime.setVelocityX(direction * 90);
        slime.setFlipX(direction > 0);
        slime.play("slime-move", true);
      }
    });

    // 3. Platform Movement Updates
    // Clients only update positions based on packets sent by host to prevent desync
    if (!this.isMultiplayer || this.isHostPlayer) {
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

      // Diagonal moving platform (moves between x=560, y=230 and x=740, y=410)
      if (this.platDiag && this.platDiag.body) {
        if (this.platDiag.x >= 740) {
          this.platDiag.setVelocityX(-80);
          this.platDiag.setVelocityY(-80);
        } else if (this.platDiag.x <= 560) {
          this.platDiag.setVelocityX(80);
          this.platDiag.setVelocityY(80);
        }
      }
    }

    // 4. Boss behavior (Walks back and forth in its arena: 2x faster than normal monsters at 180 speed, tracks player, and attacks)
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      if (this.player.x > this.worldLength - 1200) {
        this.bossLabelText.setVisible(true);
      }
      this.boss.updateBoss(this.player, this.worldLength);
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
