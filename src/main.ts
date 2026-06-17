import Phaser from "phaser";
import "./style.css";
import { MenuScene } from "./levels/menuScene";
import { LevelOne } from "./levels/levelOne";
import { LevelTwo } from "./levels/levelTwo";

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
  // Scene switching: Register the list of game scenes. Phaser launches the first element (MenuScene) by default.
  scene: [MenuScene, LevelTwo, LevelOne],
};

// Initialize the game instance
new Phaser.Game(config);

// Register service worker for PWA offline support (except on localhost)
if ("serviceWorker" in navigator && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("Service Worker registered successfully:", reg.scope);
        // Force check for updates on load to always grab the latest version
        reg.update();

        // Listen for new service worker installation and auto-reload when it activates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "activated") {
                window.location.reload();
              }
            });
          }
        });
      })
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
}
