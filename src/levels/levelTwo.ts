import Phaser from "phaser";

// Import diamond item and tileset
import diamondImg from "../assets/Space Runner/Other sprites/Diamond.png";
import tileSetImg from "../assets/Space Runner/Tiles/RunnerTileSet.png";

import { Player } from "../player";
import { Rat } from "../enemies/rat";
import { RatBoss } from "../enemies/ratBoss";
import { StaticPlatform } from "./staticPlatform";
import { networkManager } from "../network";

export class LevelTwo extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private lasers!: Phaser.Physics.Arcade.Group;
  private bg!: Phaser.GameObjects.TileSprite;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private staticPlatforms!: Phaser.Physics.Arcade.StaticGroup;
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
  private boss!: RatBoss | null;
  private bossHealthBarGraphics!: Phaser.GameObjects.Graphics;
  private bossLabelText!: Phaser.GameObjects.Text;
  private isGameOver = false;
  private activeBlocks: Phaser.Physics.Arcade.Sprite[] = [];

  private isMultiplayer = false;
  private isHostPlayer = false;
  private remotePlayer: Player | null = null;
  private unsubscribeNetwork: (() => void) | null = null;
  private inheritedStats: { health?: number; lives?: number; gems?: number } = {};

  constructor() {
    super("LevelTwo");
  }

  init(data: { health?: number; lives?: number; gems?: number; multiplayer?: boolean; isHost?: boolean }): void {
    this.inheritedStats = data;
    this.isMultiplayer = !!data.multiplayer;
    this.isHostPlayer = !!data.isHost;
    this.remotePlayer = null;
  }

  preload(): void {
    // Preload Rat enemy spritesheets
    Rat.preload(this);

    // Load Diamond texture
    this.load.image("diamond", diamondImg);

    // Load Tileset spritesheet
    this.load.spritesheet("tiles", tileSetImg, {
      frameWidth: 16,
      frameHeight: 16,
    });
    Player.preload(this);
  }

  create(): void {
    // Reset/Initialize state variables
    Rat.createAnimations(this);
    Player.createAnimations(this);

    this.player = new Player(this, 200, 300);
    // Carry over stats from Level One if they exist
    if (this.inheritedStats.health !== undefined) this.player.health = this.inheritedStats.health;
    if (this.inheritedStats.lives !== undefined) this.player.lives = this.inheritedStats.lives;
    if (this.inheritedStats.gems !== undefined) this.player.gems = this.inheritedStats.gems;

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

    // Set world physics bounds
    this.physics.world.setBounds(0, 0, this.worldLength, 600);

    // Add Repeating Block Background from tileset (using frame 58 - industrial metal wall block)
    // Tinted dark deep blue-gray (0x25283d) for premium contrast
    this.bg = this.add.tileSprite(
      this.worldLength / 2,
      300,
      this.worldLength,
      600,
      "tiles",
      58
    );
    this.bg.setScrollFactor(0.15); // Parallax effect
    this.bg.setTileScale(3.5, 3.5); // Scaled for retro feel
    this.bg.setTint(0x282b3d); // Sleek dark space-base look

    // Create static ground group
    const groundGroup = this.physics.add.staticGroup();

    // Place the ground tiles (each 40px wide at 2.5x scale)
    const tileWidth = 40;
    const numTiles = Math.ceil(this.worldLength / tileWidth);
    for (let i = 0; i < numTiles; i++) {
      const x = i * tileWidth + tileWidth / 2;
      const y = 580; // Sit on the bottom of the screen (600 - 20)
      // Frame 55 is the industrial steel floor deck panel
      const tile = groundGroup.create(x, y, "tiles", 55) as Phaser.Physics.Arcade.Sprite;
      tile.setScale(2.5);
      tile.refreshBody();
    }

    // Generate platform texture (150 wide, 20 high) by tiling frame 8 (metal girder with holes/rivets)
    const canvasTexture = this.textures.createCanvas("platform2", 150, 20);
    if (canvasTexture) {
      const context = canvasTexture.context;
      const tilesTexture = this.textures.get("tiles");
      const frame = tilesTexture.get(8);
      const sourceImage = frame.source.image;
      if (sourceImage) {
        const sx = frame.cutX;
        const sy = frame.cutY;
        const sWidth = frame.cutWidth;
        const sHeight = frame.cutHeight;
        for (let i = 0; i < 8; i++) {
          context.drawImage(sourceImage, sx, sy, sWidth, sHeight, i * 20, 0, 20, 20);
        }
      }
      canvasTexture.refresh();
    }

    if (!this.textures.exists("playerPlatform")) {
      const canvasTexturePlayerMade = this.textures.createCanvas("playerPlatform", 30, 20);
      if (canvasTexturePlayerMade) {
        const context = canvasTexturePlayerMade.context;
        const tilesTexture = this.textures.get("tiles");
        const frame = tilesTexture.get(4); // Use frame 4 for the player blocks so they look identical in both levels
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
            20
          );
        }
        canvasTexturePlayerMade.refresh();
      }
    }

    // Create moving and rotating platforms physics group
    this.movingPlatforms = this.physics.add.group();
    this.staticPlatforms = this.physics.add.staticGroup();

    // Spawn platforms in Level Two layout (more verticality and platform challenges)
    this.platX = this.movingPlatforms.create(400, 400, "platform2") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.platDiag = this.movingPlatforms.create(750, 300, "platform2") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.platY = this.movingPlatforms.create(1100, 400, "platform2") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    
    // Spawn static platforms using StaticPlatform class
    this.staticPlatforms.add(new StaticPlatform(this, 1450, 280, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 1800, 400, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 2100, 200, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 2500, 420, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 2900, 300, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 3300, 420, "platform2"));

    // Boss arena platforms so the Rat Boss can jump between them
    this.staticPlatforms.add(new StaticPlatform(this, 3850, 380, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 4150, 240, "platform2"));
    this.staticPlatforms.add(new StaticPlatform(this, 4450, 380, "platform2"));

    // Configure physics properties for platforms
    this.movingPlatforms.getChildren().forEach((child) => {
      const plat = child as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      plat.body.allowGravity = false;
      plat.setImmovable(true);
    });

    // Platform speeds
    this.platX.setVelocityX(100);
    this.platY.setVelocityY(80);
    this.platDiag.setVelocity(80, 80);

    // Create textures (laser, spike, heart) if they don't exist in the cache
    if (!this.textures.exists("laser")) {
      const laserGraphics = this.add.graphics({ fillStyle: { color: 0xff3333 } });
      laserGraphics.fillRect(0, 0, 20, 4);
      laserGraphics.generateTexture("laser", 20, 4);
      laserGraphics.destroy();
    }

    if (!this.textures.exists("spike")) {
      const spikeGraphics = this.add.graphics();
      spikeGraphics.fillStyle(0x7f8c8d, 1);
      spikeGraphics.beginPath();
      spikeGraphics.moveTo(0, 24);
      spikeGraphics.lineTo(12, 0);
      spikeGraphics.lineTo(24, 24);
      spikeGraphics.closePath();
      spikeGraphics.fillPath();
      spikeGraphics.fillStyle(0xbdc3c7, 1);
      spikeGraphics.beginPath();
      spikeGraphics.moveTo(0, 24);
      spikeGraphics.lineTo(12, 0);
      spikeGraphics.lineTo(12, 24);
      spikeGraphics.closePath();
      spikeGraphics.fillPath();
      spikeGraphics.generateTexture("spike", 24, 24);
      spikeGraphics.destroy();
    }

    if (!this.textures.exists("heartPack")) {
      const heartGraphics = this.add.graphics();
      heartGraphics.fillStyle(0xff3366, 1);
      heartGraphics.fillCircle(6, 6, 6);
      heartGraphics.fillCircle(18, 6, 6);
      heartGraphics.beginPath();
      heartGraphics.moveTo(0, 8);
      heartGraphics.lineTo(12, 24);
      heartGraphics.lineTo(24, 8);
      heartGraphics.closePath();
      heartGraphics.fillPath();
      heartGraphics.fillStyle(0xffffff, 0.6);
      heartGraphics.fillCircle(4, 4, 2);
      heartGraphics.generateTexture("heartPack", 24, 24);
      heartGraphics.destroy();
    }

    // Create Enemies physics group
    this.enemies = this.physics.add.group();

    // Spawn 5 standard Rat enemies across the level
    this.spawnRat(900, 500);
    this.spawnRat(1600, 500);
    this.spawnRat(2300, 500);
    this.spawnRat(3000, 500);
    this.spawnRat(3600, 500);

    // Spawn Giant Rat Boss at the end of the map
    this.boss = new RatBoss(this, this.worldLength - 350, 450);

    // Create Lasers group
    this.lasers = this.physics.add.group();

    // Setup Camera
    this.cameras.main.setBounds(0, 0, this.worldLength, 600);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // Add Colliders
    this.physics.add.collider(this.player, groundGroup);
    this.physics.add.collider(this.player, this.movingPlatforms, this.handlePlayerPlatformCollision, undefined, this);
    this.physics.add.collider(this.player, this.staticPlatforms, this.handlePlayerPlatformCollision, undefined, this);
    this.physics.add.collider(this.enemies, groundGroup);
    this.physics.add.collider(this.enemies, this.movingPlatforms);
    this.physics.add.collider(this.enemies, this.staticPlatforms);
    this.physics.add.collider(this.boss, groundGroup);
    this.physics.add.collider(this.boss, this.movingPlatforms);
    this.physics.add.collider(this.boss, this.staticPlatforms);

    this.physics.add.collider(this.lasers, groundGroup, (laser) => laser.destroy());
    this.physics.add.collider(this.lasers, this.movingPlatforms, (laser) => laser.destroy());
    this.physics.add.collider(this.lasers, this.staticPlatforms, (laser) => laser.destroy());

    // Add Overlaps
    this.physics.add.overlap(this.player, this.enemies, this.handlePlayerEnemyCollision, undefined, this);
    this.physics.add.overlap(this.player, this.boss, this.handlePlayerBossCollision, undefined, this);
    this.physics.add.overlap(this.lasers, this.enemies, this.handleLaserEnemyCollision, undefined, this);
    this.physics.add.overlap(this.lasers, this.boss, this.handleLaserBossCollision, undefined, this);

    // Spawn Diamonds
    this.diamonds = this.physics.add.group();
    const spawnPoints = [
      { x: 400, y: 320 },
      { x: 600, y: 480 },
      { x: 750, y: 200 },
      { x: 1100, y: 320 },
      { x: 1300, y: 450 },
      { x: 1800, y: 320 },
      { x: 2100, y: 120 },
      { x: 2500, y: 340 },
      { x: 2900, y: 220 },
      { x: 3300, y: 340 },
    ];
    spawnPoints.forEach((point) => {
      const gem = this.diamonds.create(point.x, point.y, "diamond") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      gem.body.allowGravity = false;
      gem.setScale(2.0);
      gem.setData("startY", point.y);
    });

    this.physics.add.overlap(this.player, this.diamonds, this.handlePlayerDiamondOverlap, undefined, this);

    // Spawn Spikes
    this.spikes = this.physics.add.staticGroup();
    const spikeLocations = [1350, 2000, 2750, 3400];
    spikeLocations.forEach((centerX) => {
      for (let i = -1; i <= 1; i++) {
        const x = centerX + i * 24;
        const spike = this.spikes.create(x, 548, "spike") as Phaser.Physics.Arcade.Sprite;
        spike.setBodySize(18, 18);
        spike.setOffset(3, 6);
      }
    });

    this.physics.add.overlap(this.player, this.spikes, this.handlePlayerSpikeCollision, undefined, this);
    this.physics.add.collider(this.enemies, this.spikes);
    this.physics.add.collider(this.boss, this.spikes);

    // Spawn Health Pack
    this.healthPack = this.physics.add.sprite(2100, 160, "heartPack") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.healthPack.body.allowGravity = false;
    this.healthPack.setScale(2.0);

    this.physics.add.overlap(this.player, this.healthPack, this.handlePlayerHealthOverlap, undefined, this);

    // Keyboard inputs
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      const bKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
      bKey.on("down", () => {
        this.spawnPlayerBlock();
      });
    }

    // Initialize Boss HUD
    this.bossHealthBarGraphics = this.add.graphics();
    this.bossHealthBarGraphics.setScrollFactor(0);

    this.bossLabelText = this.add.text(400, 12, "MUTATED RAT KING", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#ff8800",
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

    // Add screen tap listener to fire laser (ignoring control buttons)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const target = pointer.event.target as HTMLElement;
      if (target && target.closest(".control-btn")) {
        return;
      }
      this.fireLaser(this.time.now);
    });

    // Setup touch controls
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

  private spawnRat(x: number, y: number): void {
    const rat = new Rat(this, x, y);
    this.enemies.add(rat);
  }

  private killRat(rat: Rat): void {
    rat.isDying = true;
    rat.setVelocity(0, 0);
    rat.body.enable = false;
    rat.play("rat-death");

    rat.on("animationcomplete", () => {
      rat.destroy();
      // Respawn replacement Rat after a delay
      this.time.delayedCall(1500, () => {
        const randomX = Phaser.Math.Between(150, this.worldLength - 1200);
        this.spawnRat(randomX, 500);
      });
    });
  }

  private updateHUD(): void {
    this.hudGraphics.clear();

    // Health bar outline
    this.hudGraphics.fillStyle(0x000000, 0.4);
    this.hudGraphics.fillRect(16, 36, 200, 16);

    const healthPercent = Math.max(0, this.player.health / this.player.maxHealth);
    let barColor = 0x00ffcc;
    if (healthPercent < 0.3) {
      barColor = 0xff3333;
    } else if (healthPercent < 0.6) {
      barColor = 0xffaa00;
    }

    this.hudGraphics.fillStyle(barColor, 1);
    this.hudGraphics.fillRect(18, 38, healthPercent * 196, 12);

    this.hudGraphics.lineStyle(1.5, 0xffffff, 0.8);
    this.hudGraphics.strokeRect(16, 36, 200, 16);

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
    gem.body.enable = false;

    this.player.gems += 1;
    this.updateHUD();

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

    this.cameras.main.flash(100, 255, 0, 0);
    const s = spike as Phaser.Physics.Arcade.Sprite;
    const knockbackDirection = this.player.x < s.x ? -220 : 220;
    this.damagePlayer(25, knockbackDirection, -200);
  }

  private handlePlayerHealthOverlap(_player: any, pack: any): void {
    if (this.player.health >= this.player.maxHealth || this.isGameOver) return;

    this.player.health = Math.min(this.player.maxHealth, this.player.health + 50);
    this.updateHUD();

    const healthPackSprite = pack as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    healthPackSprite.body.enable = false;

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

  private damagePlayer(amount: number, knockbackX: number, knockbackY: number): void {
    if (this.isGameOver || this.player.isInvincible) return;
    this.player.isInvincible = true;

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

    this.time.delayedCall(300, () => {
      this.player.clearTint();
      if (this.input.keyboard && !this.isGameOver) {
        this.input.keyboard.enabled = true;
      }
    });

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

    const restartText = this.add.text(400, 360, "Tap Screen or Press SPACE to restart", {
      fontFamily: "sans-serif",
      fontSize: "20px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
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

  private handlePlayerEnemyCollision(_player: any, enemy: any): void {
    const rat = enemy as Rat;
    if (rat.isDying) return;

    if (this.player.body.velocity.y > 0 && this.player.y < rat.y - 15) {
      this.player.setVelocityY(-300);
      this.killRat(rat);
    } else {
      const knockbackDirection = this.player.x < rat.x ? -220 : 220;
      this.damagePlayer(20, knockbackDirection, -150);
    }
  }

  private handleLaserEnemyCollision(laser: any, enemy: any): void {
    if (!laser || !laser.active) return;
    this.lasers.remove(laser, true, true);

    const rat = enemy as Rat;
    if (rat.isDying) return;

    rat.hp -= 1;
    if (rat.hp <= 0) {
      this.killRat(rat);
    } else {
      rat.setTint(0xffffff);
      this.time.delayedCall(150, () => {
        if (rat && rat.active && !rat.isDying) {
          rat.clearTint();
        }
      });
    }
  }

  private handlePlayerBossCollision(_player: any, _bossSprite: any): void {
    if (!this.boss || this.boss.hp <= 0 || this.isGameOver) return;

    if (this.player.body.velocity.y > 0 && this.player.y < this.boss.y - 30) {
      this.player.setVelocityY(-350);
    } else {
      const knockbackDirection = this.player.x < this.boss.x ? -250 : 250;
      this.damagePlayer(30, knockbackDirection, -180);
    }
  }

  private handleLaserBossCollision(laser: any, _bossSprite: any): void {
    if (!laser || !laser.active) return;
    this.lasers.remove(laser, true, true);

    if (!this.boss || this.boss.hp <= 0 || this.isGameOver) return;
    this.damageBoss(1);
  }

  private damageBoss(amount: number): void {
    if (!this.boss) return;
    this.boss.hp -= amount;

    this.boss.setTint(0xffffff);
    this.cameras.main.shake(150, 0.005);

    this.time.delayedCall(150, () => {
      if (this.boss && this.boss.hp > 0) {
        if (this.boss.active) {
          this.boss.setTint(0xffaa55);
        }
      } else {
        this.killBoss();
      }
    });
  }

  private spawnRemoteBlock(x: number, y: number): void {
    const block = new StaticPlatform(this, x, y, "playerPlatform");
    block.body.setSize(30, 20);
    block.body.setOffset(0, 0);
    block.refreshBody();

    this.activeBlocks.push(block);
    this.staticPlatforms.add(block);

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
          }
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
          }
        });
      }
    }
  }

  private killBoss(): void {
    if (!this.boss) return;
    this.isGameOver = true;
    this.bossLabelText.setVisible(false);
    this.bossHealthBarGraphics.clear();

    this.boss.setVelocity(0, 0);
    this.boss.body.enable = false;
    this.boss.play("rat-death");

    this.boss.on("animationcomplete", () => {
      if (this.boss) {
        this.boss.destroy();
        this.boss = null;
      }
      this.triggerVictory();
    });
  }

  private triggerVictory(): void {
    this.physics.pause();
    this.player.setVelocity(0, 0);
    this.player.play("idle");

    const victoryText = this.add.text(400, 250, "VICTORY!\nGame Complete", {
      fontFamily: "sans-serif",
      fontSize: "48px",
      color: "#ffd700",
      align: "center",
      stroke: "#000000",
      strokeThickness: 6,
    });
    victoryText.setOrigin(0.5);
    victoryText.setScrollFactor(0);

    const restartText = this.add.text(400, 360, "Tap Screen or Press SPACE to play again", {
      fontFamily: "sans-serif",
      fontSize: "20px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    restartText.setOrigin(0.5);
    restartText.setScrollFactor(0);

    const restartGame = () => {
      this.scene.start("MenuScene");
    };

    this.input.once("pointerdown", restartGame);
    if (this.spaceKey) {
      this.spaceKey.once("down", restartGame);
    }
  }

  private updateBossHealthBar(): void {
    this.bossHealthBarGraphics.clear();
    if (!this.boss || !this.boss.active || this.boss.hp <= 0 || this.player.x < this.worldLength - 1200) {
      return;
    }

    this.bossHealthBarGraphics.fillStyle(0x000000, 0.6);
    this.bossHealthBarGraphics.fillRect(200, 40, 400, 18);

    this.bossHealthBarGraphics.fillStyle(0xdd2222, 1);
    const healthWidth = Math.max(0, (this.boss.hp / this.boss.maxHp) * 396);
    this.bossHealthBarGraphics.fillRect(202, 42, healthWidth, 14);

    this.bossHealthBarGraphics.lineStyle(2, 0xff8800, 1);
    this.bossHealthBarGraphics.strokeRect(200, 40, 400, 18);
  }

  private setupTouchControls(): void {
    const setupButton = (id: string, key: "left" | "right" | "jump" | "down") => {
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

      element.addEventListener("touchstart", handleStart, { passive: false });
      element.addEventListener("touchend", handleEnd, { passive: false });
      element.addEventListener("touchcancel", handleEnd, { passive: false });
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
  }

  private fireLaser(time: number): void {
    if (time < this.lastFired + 250) return;
    this.lastFired = time;

    const facingLeft = this.player.flipX;
    const laserX = this.player.x + (facingLeft ? -25 : 25);
    const laserY = this.player.y + 2;

    const laser = this.lasers.create(laserX, laserY, "laser") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    laser.body.allowGravity = false;

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

    this.time.delayedCall(800, () => {
      if (laser.active) laser.destroy();
    });
  }

  private spawnRemoteLaser(x: number, y: number, facingLeft: boolean): void {
    const laser = this.lasers.create(x, y, "laser") as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
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

    const block = new StaticPlatform(this, spawnX, spawnY, "playerPlatform");
    block.body.setSize(30, 20);
    block.body.setOffset(0, 0);
    block.refreshBody();

    // Track the block in the active list
    this.activeBlocks.push(block);
    this.staticPlatforms.add(block);

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
          }
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
          }
        });
      }
    }
  }

  override update(time: number, _delta: number): void {
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

    if (this.isGameOver) {
      this.player.setVelocityX(0);
      return;
    }

    let moveLeft = this.touchInputs.left;
    let moveRight = this.touchInputs.right;
    let jumpPressed = this.touchInputs.jump;
    let downPressed = this.touchInputs.down;
    let shootPressed = false;

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

    // Platform riding updates (velocity-based momentum transfer)
    let platformVelocityX = 0;
    let platformVelocityY = 0;

    if (this.player.activePlatform && this.player.activePlatform.body) {
      platformVelocityX = this.player.activePlatform.body.velocity.x;
      platformVelocityY = this.player.activePlatform.body.velocity.y;

      // Check if player walked off the platform (half-width + tolerance)
      const platformHalfWidth = this.player.activePlatform.width / 2;
      const dist = Math.abs(this.player.x - this.player.activePlatform.x);
      if (dist > platformHalfWidth + 10) {
        this.player.body.setAllowGravity(true);
        this.player.activePlatform = null;
      }
    }

    // Normal player movement inputs (combining platform velocity if on one)
    if (moveLeft) {
      this.player.setVelocityX(-200 + platformVelocityX);
      this.player.setFlipX(true);
      if (touchingDown || this.player.activePlatform) {
        this.player.play("run", true);
      }
    } else if (moveRight) {
      this.player.setVelocityX(200 + platformVelocityX);
      this.player.setFlipX(false);
      if (touchingDown || this.player.activePlatform) {
        this.player.play("run", true);
      }
    } else {
      if (touchingDown || this.player.activePlatform) {
        this.player.setVelocityX(platformVelocityX);
        this.player.play("idle", true);
      } else {
        // In the air: apply gentle horizontal deceleration/drag
        this.player.setVelocityX(this.player.body.velocity.x * 0.985);
      }
    }

    if (this.player.activePlatform) {
      // Keep player vertical velocity matched to platform to prevent separation
      this.player.setVelocityY(platformVelocityY);
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

    // Update standard Rat enemies AI
    this.enemies.getChildren().forEach((child) => {
      const rat = child as Rat;
      rat.updateRat(this.player);
    });

    // Platform movements
    if (!this.isMultiplayer || this.isHostPlayer) {
      if (this.platX && this.platX.body) {
        if (this.platX.x >= 600) {
          this.platX.setVelocityX(-100);
        } else if (this.platX.x <= 300) {
          this.platX.setVelocityX(100);
        }
      }

      if (this.platY && this.platY.body) {
        if (this.platY.y >= 450) {
          this.platY.setVelocityY(-80);
        } else if (this.platY.y <= 200) {
          this.platY.setVelocityY(80);
        }
      }

      // Diagonal moving platform (moves between x=650, y=200 and x=850, y=400)
      if (this.platDiag && this.platDiag.body) {
        if (this.platDiag.x >= 850) {
          this.platDiag.setVelocityX(-80);
          this.platDiag.setVelocityY(-80);
        } else if (this.platDiag.x <= 650) {
          this.platDiag.setVelocityX(80);
          this.platDiag.setVelocityY(80);
        }
      }
    }

    // Update Rat Boss AI
    if (this.boss && this.boss.active && this.boss.hp > 0) {
      if (this.player.x > this.worldLength - 1200) {
        this.bossLabelText.setVisible(true);
      }
      this.boss.updateBoss(this.player, this.worldLength);
    }

    // Gem bobbing
    this.diamonds.getChildren().forEach((child) => {
      const gem = child as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      const startY = gem.getData("startY") as number;
      if (startY !== undefined) {
        gem.y = startY + Math.sin(time / 200) * 8;
      }
    });

    // Health pack bobbing
    if (this.healthPack && this.healthPack.active) {
      this.healthPack.y = 160 + Math.sin(time / 250) * 5;
    }

    this.updateBossHealthBar();
  }
}
