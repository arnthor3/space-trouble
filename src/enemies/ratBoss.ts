import Phaser from "phaser";

export class RatBoss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public hp = 15;
  public maxHp = 15;
  public direction = -1;
  public isInvincible = false;
  public isDying = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "rat-idle");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(3.0);
    this.setBounce(0.1);
    this.setCollideWorldBounds(true);
    this.setTint(0xffaa55); // Orange/Golden Boss glow

    // Adjust rat boss collision box matching its scale (prevent floating)
    this.setBodySize(40, 15);
    this.setOffset(15, 35); // Align feet to ground

    this.play("rat-run");
  }

  public resetStats(): void {
    this.hp = 15;
    this.isInvincible = false;
    this.isDying = false;
    this.direction = -1;
  }

  public updateBoss(player: Phaser.GameObjects.Sprite, worldLength: number): void {
    if (this.isDying || !this.active || this.hp <= 0) return;

    const isAttacking =
      this.anims.currentAnim &&
      this.anims.currentAnim.key === "rat-attack" &&
      this.anims.isPlaying;

    const distToPlayerX = player.x - this.x;
    const absDistX = Math.abs(distToPlayerX);
    const absDistY = Math.abs(player.y - this.y);

    // Attack range
    if (absDistX < 120 && absDistY < 80 && !isAttacking) {
      this.setVelocityX(0);
      this.play("rat-attack");
      this.direction = distToPlayerX < 0 ? -1 : 1;
      this.setFlipX(this.direction < 0);
    } else if (!isAttacking) {
      // Track player if player enters boss arena
      if (player.x > worldLength - 1200) {
        this.direction = distToPlayerX < 0 ? -1 : 1;
        this.setVelocityX(this.direction * 180); // Fast boss chase
      } else {
        // Patrol standard back & forth in arena bounds
        const minX = worldLength - 1000;
        const maxX = worldLength - 50;
        if (this.x >= maxX || this.body.blocked.right) {
          this.direction = -1;
        } else if (this.x <= minX || this.body.blocked.left) {
          this.direction = 1;
        }
        this.setVelocityX(this.direction * 100);
      }
      this.setFlipX(this.direction < 0);
      this.play("rat-run", true);
    }

    // Leaps between platforms / into air occasionally when touching ground or platform
    if (this.body.blocked.down || this.body.touching.down) {
      if (Math.random() < 0.015) {
        this.setVelocityY(-480); // High leap
        // Propel towards player direction
        this.setVelocityX(this.direction * 220);
      }
    }
  }
}
