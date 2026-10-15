import './styles/style.css';
import { defaultConfig } from './config';
import { installGlobals, installRayBetween } from './globals';
import { GameEngine } from './engine/Engine';
import { Renderer } from './renderer/Renderer';
import { Leaderboard } from './renderer/Leaderboard';
import { UI } from './renderer/UI';
import { FileIQStorage } from './engine/IQSystem';

async function main() {
  // Install globals BEFORE importing brains
  installGlobals(defaultConfig, defaultConfig.arena);

  // Dynamic import so globals are available at parse time for bots that use ground
  const { allBrains } = await import('./brains/index');

  const arenaContainer = document.getElementById('arena-container')!;
  const sidebar = document.getElementById('sidebar')!;
  const serverLb = document.getElementById('server-leaderboard')!;
  const liveLb = document.getElementById('live-leaderboard')!;
  const controls = document.getElementById('controls')!;

  const watchAstra = new URLSearchParams(location.search).get('watch') === 'astra';
  // Personal spectator mode starts every bot at the same IQ on each new battle.
  const engine = new GameEngine(defaultConfig, allBrains,
    watchAstra ? { iqStorage: new FileIQStorage() } : undefined);
  if (watchAstra) document.body.classList.add('astra-watch');
  installRayBetween(engine.getMatterEngine());

  // Create renderer
  const renderer = new Renderer(arenaContainer, defaultConfig);

  // Create leaderboard
  const leaderboard = new Leaderboard(serverLb, liveLb);

  // Create UI
  const ui = new UI(engine, controls);
  let gameTicks = 0;
  let lastDeath = '';
  const watchPanel = document.createElement('section');
  if (watchAstra) {
    watchPanel.className = 'astra-panel';
    sidebar.prepend(watchPanel);
    watchPanel.after(controls);
    engine.onCreatureDeath = (c) => {
      if (c.brain.name === 'Astra') lastDeath = `Последняя гибель: ${Math.floor(gameTicks / 3600)}:${String(Math.floor(gameTicks / 60) % 60).padStart(2, '0')}`;
    };
  }
  function updateWatch() {
    if (!watchAstra) return;
    const brain = engine.getBrains().find((b) => b.name === 'Astra')!;
    const creature = engine.getCreatures().find((c) => c.brain === brain);
    const place = 1 + engine.getBrains().filter((b) => b.iq > brain.iq).length;
    const clock = `${Math.floor(gameTicks / 3600)}:${String(Math.floor(gameTicks / 60) % 60).padStart(2, '0')}`;
    const status = creature ? `На поле · уровень ${creature.level} · HP ${Math.ceil(creature.lives)}` : 'Ждёт своей очереди на выход';
    watchPanel.innerHTML = `<h2>Astra <small>(ChatGPT)</small></h2>
      <p class="astra-state">${ui.isPaused() ? 'Пауза' : status}</p>
      <div class="astra-stats"><strong>IQ ${brain.iq}</strong><span>Место ${place}/${allBrains.length}</span></div>
      <p>Убийства: ${brain.kills} · Смерти: ${brain.deaths}</p>
      <p>Время боя: <b>${clock}</b> · Скорость ${ui.getSpeedMultiplier()}×</p>
      <p class="astra-note">Все начинают с IQ 10. Результаты только этого боя.</p>
      ${lastDeath ? `<p class="astra-note">${lastDeath}</p>` : ''}`;
  }
  updateWatch();

  // Wire leaderboard updates
  let fullLeaderboard = false;
  let leaderboardCounter = 0;
  const fullLeaderboardInterval = 50;

  engine.onLeaderboardUpdate = () => {
    fullLeaderboard = true;
    leaderboardCounter = fullLeaderboardInterval;
    leaderboard.updateLive(engine.getBrains(), true);
  };

  // Initial leaderboard
  leaderboard.updateLive(engine.getBrains(), watchAstra);

  // Game loop
  let lastFrame = performance.now();
  let pendingTicks = 0;
  let lastStatusUpdate = 0;
  function gameLoop(now: number) {
    const elapsed = Math.min(250, now - lastFrame);
    lastFrame = now;
    if (!ui.isPaused()) {
      pendingTicks = Math.min(600, pendingTicks + elapsed * 0.06 * ui.getSpeedMultiplier());
      const budgetStart = performance.now();
      while (pendingTicks >= 1 && performance.now() - budgetStart < 12) {
        engine.tick();
        gameTicks++;
        pendingTicks--;

        // Leaderboard counter
        if (leaderboardCounter > 0 && --leaderboardCounter < 1) {
          leaderboardCounter = 0;
          fullLeaderboard = false;
          leaderboard.updateLive(engine.getBrains(), watchAstra);
        }
      }
    }

    if (ui.isPaused()) pendingTicks = 0;
    if (now - lastStatusUpdate > 200) { updateWatch(); lastStatusUpdate = now; }

    // Render (always render even when paused for smooth display)
    const snapshot = {
      creatures: engine.getCreatures(),
      bullets: engine.getSpawner().bullets,
      obstacles: engine.getSpawner().obstacles,
      brains: engine.getBrains(),
      arena: defaultConfig.arena,
    };
    renderer.render(snapshot);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

main().catch(console.error);
