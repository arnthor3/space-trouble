import Phaser from "phaser";

export class StaticPlatform extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.StaticBody;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);

    // Add to scene and enable physics as a static body
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // true creates a static physics body

    this.setImmovable(true);
  }
}
