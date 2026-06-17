import Phaser from "phaser";

// Import astronaut spritesheets
import idleImg from "./assets/Space Runner/Astronaut/Astronaut_Idle.png";
import runImg from "./assets/Space Runner/Astronaut/Astronaut_Run.png";
import jumpImg from "./assets/Space Runner/Astronaut/Astronaut_Jump.png";

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public health = 100;
  public maxHealth = 100;
  public lives = 5;
  public gems = 0;
  public isInvincible = false;
  public relativeX = 0;
  public activePlatform: Phaser.Physics.Arcade.Sprite | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "astronaut-idle");

    // Register with scene and physics
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);
    // Initial setup
    this.setScale(2.5);
    this.setBounce(0.15);
    this.setCollideWorldBounds(true);

    // Bounding box adjustment
    this.setBodySize(14, 16);
    this.setOffset(5, 0);

    // Start idle animation
    this.play("idle");
  }

  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet("astronaut-idle", idleImg, {
      frameWidth: 24,
      frameHeight: 24,
    });
    scene.load.spritesheet("astronaut-run", runImg, {
      frameWidth: 24,
      frameHeight: 24,
    });
    scene.load.spritesheet("astronaut-jump", jumpImg, {
      frameWidth: 24,
      frameHeight: 24,
    });
    scene.add.image(10, 10, idleImg);
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (!scene.anims.exists("idle")) {
      scene.anims.create({
        key: "idle",
        frames: scene.anims.generateFrameNumbers("astronaut-idle", {
          start: 0,
          end: 5,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("run")) {
      scene.anims.create({
        key: "run",
        frames: scene.anims.generateFrameNumbers("astronaut-run", {
          start: 0,
          end: 5,
        }),
        frameRate: 12,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("jump")) {
      scene.anims.create({
        key: "jump",
        frames: scene.anims.generateFrameNumbers("astronaut-jump", {
          start: 0,
          end: 4,
        }),
        frameRate: 10,
        repeat: 0,
      });
    }
  }

  // Reset stats on scene restarts
  public resetStats(): void {
    this.health = 100;
    this.lives = 5;
    this.gems = 0;
    this.isInvincible = false;
    this.relativeX = 0;
    this.activePlatform = null;
  }

  // Respawn logic
  public handleRespawn(): void {
    this.lives -= 1;
    if (this.lives > 0) {
      this.health = 100;
      this.setPosition(200, 300);
      this.body.setVelocity(0, 0);
      this.body.setAllowGravity(true);
      this.activePlatform = null;
      this.isInvincible = true;
      this.clearTint();

      // Flashing logic
      let isVisible = true;
      const flashTimer = this.scene.time.addEvent({
        delay: 100,
        callback: () => {
          isVisible = !isVisible;
          this.setVisible(isVisible);
        },
        repeat: 10,
      });

      this.scene.time.delayedCall(1100, () => {
        flashTimer.destroy();
        this.setVisible(true);
        this.isInvincible = false;
      });
    }
  }
}
