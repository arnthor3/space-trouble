import Phaser from "phaser";
import { networkManager } from "../network";

export class MenuScene extends Phaser.Scene {
  private spaceKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("MenuScene");
  }

  create(): void {
    // Generate starfield background dynamically
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(0x0a0a1a, 1);
    bgGraphics.fillRect(0, 0, 800, 600);
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * 800;
      const y = Math.random() * 600;
      const size = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.8 + 0.2;
      bgGraphics.fillStyle(0xffffff, alpha);
      bgGraphics.fillRect(x, y, size, size);
    }
    bgGraphics.destroy();

    // 1. Title Text
    const titleText = this.add.text(400, 220, "VANDRÆÐI Í GEIMNUM", {
      fontFamily: "sans-serif",
      fontSize: "56px",
      fontStyle: "bold",
      color: "#00ffcc",
      align: "center",
      stroke: "#000000",
      strokeThickness: 8,
    });
    titleText.setOrigin(0.5);

    // 2. Credits/Author Text
    const creditsText = this.add.text(
      400,
      300,
      "Eftir Óðinn Arnar Arnþórsson",
      {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#ffd700",
        stroke: "#000000",
        strokeThickness: 3,
      },
    );
    creditsText.setOrigin(0.5);

    // 3. Pulsing Action Prompt Text
    const promptText = this.add.text(
      400,
      370,
      "Ýttu á space eða ýttu á skjáinn fyrir sóló leik",
      {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      },
    );
    promptText.setOrigin(0.5);

    this.tweens.add({
      targets: promptText,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      loop: -1,
      ease: "Sine.easeInOut",
    });

    // Create Multiplayer DOM Container dynamically
    const mpContainer = document.createElement("div");
    mpContainer.id = "mp-menu";
    mpContainer.style.position = "absolute";
    mpContainer.style.top = "75%";
    mpContainer.style.left = "50%";
    mpContainer.style.transform = "translate(-50%, -50%)";
    mpContainer.style.display = "flex";
    mpContainer.style.flexDirection = "column";
    mpContainer.style.gap = "10px";
    mpContainer.style.alignItems = "center";
    mpContainer.style.background = "rgba(10, 10, 30, 0.9)";
    mpContainer.style.padding = "15px 25px";
    mpContainer.style.borderRadius = "12px";
    mpContainer.style.border = "2px solid #00ffcc";
    mpContainer.style.boxShadow = "0 0 20px rgba(0, 255, 204, 0.4)";
    mpContainer.style.fontFamily = "sans-serif";
    mpContainer.style.color = "white";
    mpContainer.style.zIndex = "100";

    mpContainer.innerHTML = `
      <div style="font-weight: bold; color: #ffd700; margin-bottom: 5px; font-size: 16px;">MÖRGUM SPILUN (MULTIPLAYER)</div>
      <div style="display: flex; gap: 10px;">
        <button id="btn-host" style="background: #00ffcc; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; color: black; font-size: 14px;">Stofna leik (Host)</button>
        <button id="btn-join" style="background: #ffd700; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; color: black; font-size: 14px;">Tengjast leik (Join)</button>
      </div>
      <div id="host-info" style="display: none; font-size: 14px; margin-top: 5px; text-align: center;">
        Kóðinn þinn: <span id="host-id" style="font-family: monospace; font-weight: bold; color: #00ffcc; background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 4px; user-select: all; cursor: pointer;">...</span>
        <br><span style="font-size: 11px; color: #aaa;">Bíður eftir leikmanni 2...</span>
      </div>
      <div id="join-info" style="display: none; flex-direction: column; gap: 5px; margin-top: 5px; width: 100%;">
        <input id="input-host-id" type="text" placeholder="Sláðu inn kóða hosts" style="background: rgba(255,255,255,0.1); border: 1px solid #ffd700; color: white; padding: 8px; border-radius: 6px; text-align: center; font-size: 14px; outline: none;">
        <button id="btn-connect" style="background: #ffd700; border: none; padding: 8px 10px; border-radius: 6px; font-weight: bold; cursor: pointer; color: black; font-size: 14px;">Tengjast</button>
      </div>
      <div id="mp-status" style="font-size: 12px; color: #aaa; margin-top: 5px; text-align: center;"></div>
    `;
    document.body.appendChild(mpContainer);

    // Stop keyboard input propagation inside input box so player doesn't trigger jump/keys in Phaser
    const inputField = mpContainer.querySelector("#input-host-id") as HTMLInputElement;
    if (inputField) {
      inputField.addEventListener("keydown", (e) => {
        e.stopPropagation();
      });
    }

    const hostBtn = mpContainer.querySelector("#btn-host") as HTMLButtonElement;
    const joinBtn = mpContainer.querySelector("#btn-join") as HTMLButtonElement;
    const connectBtn = mpContainer.querySelector("#btn-connect") as HTMLButtonElement;
    const hostInfo = mpContainer.querySelector("#host-info") as HTMLDivElement;
    const joinInfo = mpContainer.querySelector("#join-info") as HTMLDivElement;
    const hostIdSpan = mpContainer.querySelector("#host-id") as HTMLSpanElement;
    const statusDiv = mpContainer.querySelector("#mp-status") as HTMLDivElement;

    // Set up multiplayer connection handlers
    hostBtn.addEventListener("click", () => {
      statusDiv.innerText = "Stofnar tengingu...";
      hostBtn.disabled = true;
      joinBtn.disabled = true;
      networkManager.hostGame((id) => {
        statusDiv.innerText = "Tenging tilbúin.";
        hostInfo.style.display = "block";
        joinInfo.style.display = "none";
        hostIdSpan.innerText = id;
      });

      networkManager.onStatusChange((status) => {
        if (status === "connected") {
          statusDiv.innerText = "Leikmaður tengdur! Ræsir leik...";
          setTimeout(() => {
            cleanupAndStart(true);
          }, 1000);
        }
      });
    });

    joinBtn.addEventListener("click", () => {
      joinInfo.style.display = "flex";
      hostInfo.style.display = "none";
    });

    connectBtn.addEventListener("click", () => {
      const id = inputField.value.trim();
      if (!id) {
        statusDiv.innerText = "Vinsamlegast sláðu inn kóða.";
        return;
      }
      statusDiv.innerText = "Tengist host...";
      connectBtn.disabled = true;
      networkManager.joinGame(id, () => {
        statusDiv.innerText = "Tengdur host! Ræsir leik...";
        setTimeout(() => {
          cleanupAndStart(false);
        }, 1000);
      });
    });

    const cleanupAndStart = (isHost: boolean) => {
      if (document.getElementById("mp-menu")) {
        document.getElementById("mp-menu")?.remove();
      }
      this.scene.start("LevelOne", { multiplayer: true, isHost });
    };

    // Scene switching: Define the transition function to start the GameScene using the Phaser Scene Manager
    const startSoloGame = () => {
      if (document.getElementById("mp-menu")) {
        document.getElementById("mp-menu")?.remove();
      }
      // Disconnect if previously active
      networkManager.disconnect();
      this.scene.start("LevelOne", { multiplayer: false });
    };

    // Scene switching: Setup temporary event listeners for touch inputs / pointer clicks and the SPACE key
    this.input.once("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Ignore click if it was on the HTML multiplayer menu
      const target = pointer.event.target as HTMLElement;
      if (target && target.closest("#mp-menu")) {
        return;
      }
      startSoloGame();
    });

    if (this.input.keyboard) {
      this.spaceKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE,
      );
      this.spaceKey.once("down", () => {
        // Only trigger if focus is not in the text input
        if (document.activeElement !== inputField) {
          startSoloGame();
        }
      });
    }
  }
}
