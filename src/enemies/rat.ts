import Phaser from "phaser";

import ratIdleImg from "../assets/Monsters/Rat/idle.png";
import ratRunImg from "../assets/Monsters/Rat/run.png";
import ratDeathImg from "../assets/Monsters/Rat/rat-death.png";
import ratAttackImg from "../assets/Monsters/Rat/attack_bite.png";

export class Rat extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public hp = 2;
  public direction = -1;
  public isDying = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "rat-idle");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(1.5);
    this.setBounce(0.1);
    this.setCollideWorldBounds(true);

    // Adjust rat collision box to match where drawing feet are
    this.setBodySize(40, 15);
    this.setOffset(15, 25); // Lower the sprite relative to its body

    this.play("rat-run");
  }

  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet("rat-idle", ratIdleImg, {
      frameWidth: 70,
      frameHeight: 70,
    });
    scene.load.spritesheet("rat-run", ratRunImg, {
      frameWidth: 70,
      frameHeight: 70,
    });
    scene.load.spritesheet("rat-death", ratDeathImg, {
      frameWidth: 70,
      frameHeight: 70,
    });
    scene.load.spritesheet("rat-attack", ratAttackImg, {
      frameWidth: 70,
      frameHeight: 70,
    });
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (!scene.anims.exists("rat-idle")) {
      scene.anims.create({
        key: "rat-idle",
        frames: scene.anims.generateFrameNumbers("rat-idle", {
          start: 0,
          end: 9,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
    if (!scene.anims.exists("rat-run")) {
      scene.anims.create({
        key: "rat-run",
        frames: scene.anims.generateFrameNumbers("rat-run", {
          start: 0,
          end: 7,
        }),
        frameRate: 12,
        repeat: 0,
      });
    }
    if (!scene.anims.exists("rat-death")) {
      scene.anims.create({
        key: "rat-death",
        frames: scene.anims.generateFrameNumbers("rat-death", {
          start: 0,
          end: 5,
        }),
        frameRate: 10,
        repeat: 0,
      });
    }
    if (!scene.anims.exists("rat-attack")) {
      scene.anims.create({
        key: "rat-attack",
        frames: scene.anims.generateFrameNumbers("rat-attack", {
          start: 0,
          end: 11,
        }),
        frameRate: 14,
        repeat: 0,
      });
    }
  }

  public updateRat(player: Phaser.GameObjects.Sprite): void {
    if (this.isDying || !this.active) return;

    const isAttacking =
      this.anims.currentAnim &&
      this.anims.currentAnim.key === "rat-attack" &&
      this.anims.isPlaying;

    const distToPlayerX = player.x - this.x;
    const absDistX = Math.abs(distToPlayerX);
    const absDistY = Math.abs(player.y - this.y);

    if (absDistX < 60 && absDistY < 40 && !isAttacking) {
      this.setVelocityX(0);
      this.play("rat-attack");
      this.direction = distToPlayerX < 0 ? -1 : 1;
      this.setFlipX(this.direction < 0);
    } else if (!isAttacking) {
      if (absDistX < 400 && absDistY < 80) {
        // Fast chase
        this.direction = distToPlayerX < 0 ? -1 : 1;
        this.setVelocityX(this.direction * 140);
      } else {
        // Normal patrol
        if (this.body.blocked.left) {
          this.direction = 1;
        } else if (this.body.blocked.right) {
          this.direction = -1;
        }
        this.setVelocityX(this.direction * 80);
      }
      this.setFlipX(this.direction < 0);
      this.play("rat-run", true);
    }
  }
}
