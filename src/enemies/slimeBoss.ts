import Phaser from "phaser";

export class SlimeBoss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public hp = 10;
  public maxHp = 10;
  public direction = -1;
  public isInvincible = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "slime-walk");

    // Register with scene and physics
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Initial setup
    this.setScale(2.5); // Giant sized end boss!
    this.setBounce(0.1);
    this.setCollideWorldBounds(true);
    this.setTint(0xcc33ff); // Cosmic purple alien boss color

    // Set collision boundary matching its giant size (grounded properly)
    this.setBodySize(80, 30);
    this.setOffset(38, 50);

    // Play default walk animation
    this.play("slime-move");
  }

  // Reset state on restart
  public resetStats(): void {
    this.hp = 10;
    this.isInvincible = false;
    this.direction = -1;
  }

  // Boss behavior update
  public updateBoss(player: Phaser.GameObjects.Sprite, worldLength: number): void {
    if (!this.active || this.hp <= 0) return;

    const isBossAttacking =
      this.anims.currentAnim &&
      this.anims.currentAnim.key === "slime-attack" &&
      this.anims.isPlaying;
    const distToPlayerX = player.x - this.x;
    const absDistX = Math.abs(distToPlayerX);
    const absDistY = Math.abs(player.y - this.y);

    // Trigger boss attack if close (200px horizontally, 100px vertically)
    if (absDistX < 200 && absDistY < 100 && !isBossAttacking) {
      this.setVelocityX(0); // Stop during attack
      this.play("slime-attack");
      this.direction = distToPlayerX < 0 ? -1 : 1;
      this.setFlipX(this.direction < 0); // Corrected attack direction flip
    } else if (!isBossAttacking) {
      // Track player if player has entered the boss arena
      if (player.x > worldLength - 1200) {
        this.direction = distToPlayerX < 0 ? -1 : 1;
      } else {
        // Patrol standard back & forth
        const minX = worldLength - 1000;
        const maxX = worldLength - 50;
        if (this.x >= maxX || this.body.blocked.right) {
          this.direction = -1;
        } else if (this.x <= minX || this.body.blocked.left) {
          this.direction = 1;
        }
      }
      this.setVelocityX(this.direction * 180); // 180 speed (2x of slimes)
      this.setFlipX(this.direction > 0);
      this.play("slime-move", true);
    } else {
      // Stay still during attack animation
      this.setVelocityX(0);
    }

    // Slime boss leaps into the air occasionally (1.5% chance per frame when touching ground)
    if (this.body.touching.down && Math.random() < 0.015) {
      this.setVelocityY(-400); // Massive leap!
    }
  }
}
