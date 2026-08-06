import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "./supabase";
import {
  buildMaze,
  isWalkable,
  findTunnelRows,
  countDots,
  TILE_SIZE,
  COLS,
  ROWS,
  MAZES,
} from "./maze.js";
import { getTarget, chooseDirection } from "./ghostAI.js";
import { sfx } from "./audio.js";
import { PACMAN_SKINS, GHOST_SKINS } from "./skins.js";

const DIRS = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
  w: { row: -1, col: 0 },
  s: { row: 1, col: 0 },
  a: { row: 0, col: -1 },
  d: { row: 0, col: 1 },
};

const BASE_PLAYER_TICK = 150;
const BASE_GHOST_TICK = 170;
const MIN_PLAYER_TICK = 95;
const MIN_GHOST_TICK = 115;
const EXTRA_LIFE_SCORE = 10000;
const DEATH_ANIM_MS = 800;
const LIFE_LOST_PAUSE_MS = 900;

const DIFFICULTIES = {
  easy: { label: "Fácil", lives: 4, ghostTickMult: 1.22, frightMult: 1.35 },
  normal: { label: "Normal", lives: 3, ghostTickMult: 1, frightMult: 1 },
  hard: { label: "Difícil", lives: 2, ghostTickMult: 0.8, frightMult: 0.6 },
};

const PHASE_PATTERN = [
  { mode: "scatter", dur: 7000 },
  { mode: "chase", dur: 20000 },
  { mode: "scatter", dur: 7000 },
  { mode: "chase", dur: 20000 },
  { mode: "scatter", dur: 5000 },
  { mode: "chase", dur: 999999 },
];

function freshEntities(mazeIndex = 0) {
  const { grid, playerStart, ghostStarts } = buildMaze(mazeIndex);
  const tunnelRows = findTunnelRows(grid);
  const player = {
    row: playerStart.row,
    col: playerStart.col,
    prevRow: playerStart.row,
    prevCol: playerStart.col,
    dir: null,
    nextDir: null,
    lastTick: 0,
    mouthPhase: 0,
  };
  const ghosts = Object.entries(ghostStarts).map(([type, pos]) => ({
    type,
    row: pos.row,
    col: pos.col,
    prevRow: pos.row,
    prevCol: pos.col,
    homeCell: pos,
    dir: { row: 0, col: -1 },
    mode: "scatter",
    frightTimer: 0,
    lastTick: 0,
  }));
  return { grid, tunnelRows, player, ghosts, dotsLeft: countDots(grid) };
}

export default function Game({ session }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(freshEntities());
  const phaseRef = useRef({ index: 0, elapsed: 0 });
  const eatStreakRef = useRef(0);
  const accRef = useRef({ player: 0, ghost: 0 });
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);
  const extraLifeGivenRef = useRef(false);
  const statusRef = useRef("menu");
  const deathAnimRef = useRef(null);
  const difficultyRef = useRef("normal");

  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(1000000); // Força 1 milhão direto no estado
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(DIFFICULTIES.normal.lives);
  const livesRef = useRef(DIFFICULTIES.normal.lives);
  const [level, setLevel] = useState(1);
  const [difficulty, setDifficulty] = useState("normal");
  const [status, setStatus] = useState("menu");
  const [language, setLanguage] = useState("pt");
  const [shopTab, setShopTab] = useState("pacman");
  const [, forceRender] = useState(0);

  const [selectedSkin, setSelectedSkin] = useState(() => {
    try {
      return localStorage.getItem("pacman-react-skin") || "classic";
    } catch {
      return "classic";
    }
  });

  const [unlockedSkins, setUnlockedSkins] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("pacman-react-unlocked-skins")) || [
          "classic",
        ]
      );
    } catch {
      return ["classic"];
    }
  });

  const [selectedGhostSkin, setSelectedGhostSkin] = useState(() => {
    try {
      return localStorage.getItem("pacman-react-ghost-skin") || "classic";
    } catch {
      return "classic";
    }
  });

  const [unlockedGhostSkins, setUnlockedGhostSkins] = useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("pacman-react-unlocked-ghost-skins"),
        ) || ["classic"]
      );
    } catch {
      return ["classic"];
    }
  });

  // Força o salvamento de 1 milhão no Supabase e no localStorage logo ao carregar
  useEffect(() => {
    try {
      localStorage.setItem("pacman-react-coins", "1000000");
    } catch {}

    if (!session?.user) return;

    async function forceOneMillion() {
      setCoins(1000000);

      const { data } = await supabase
        .from("profiles")
        .select("highscore, unlocked_skins, unlocked_ghost_skins")
        .eq("id", session.user.id)
        .maybeSingle();

      if (data) {
        if (data.highscore !== null && data.highscore !== undefined) {
          setHighScore(data.highscore);
        }
        if (
          Array.isArray(data.unlocked_skins) &&
          data.unlocked_skins.length > 0
        ) {
          setUnlockedSkins(data.unlocked_skins);
          localStorage.setItem(
            "pacman-react-unlocked-skins",
            JSON.stringify(data.unlocked_skins),
          );
        }
        if (
          Array.isArray(data.unlocked_ghost_skins) &&
          data.unlocked_ghost_skins.length > 0
        ) {
          setUnlockedGhostSkins(data.unlocked_ghost_skins);
          localStorage.setItem(
            "pacman-react-unlocked-ghost-skins",
            JSON.stringify(data.unlocked_ghost_skins),
          );
        }
      }

      // Atualiza o banco forçando 1M de moedas
      await supabase.from("profiles").upsert({
        id: session.user.id,
        coins: 1000000,
        highscore: highScore,
        unlocked_skins: unlockedSkins,
        unlocked_ghost_skins: unlockedGhostSkins,
        updated_at: new Date(),
      });
    }

    forceOneMillion();
  }, [session]);

  const saveProfileData = async (updatedData) => {
    if (updatedData.coins !== undefined) setCoins(updatedData.coins);
    if (updatedData.highscore !== undefined)
      setHighScore(updatedData.highscore);
    if (updatedData.unlocked_skins !== undefined)
      setUnlockedSkins(updatedData.unlocked_skins);
    if (updatedData.unlocked_ghost_skins !== undefined)
      setUnlockedGhostSkins(updatedData.unlocked_ghost_skins);

    try {
      if (updatedData.coins !== undefined)
        localStorage.setItem("pacman-react-coins", updatedData.coins);
      if (updatedData.unlocked_skins !== undefined)
        localStorage.setItem(
          "pacman-react-unlocked-skins",
          JSON.stringify(updatedData.unlocked_skins),
        );
      if (updatedData.unlocked_ghost_skins !== undefined)
        localStorage.setItem(
          "pacman-react-unlocked-ghost-skins",
          JSON.stringify(updatedData.unlocked_ghost_skins),
        );
    } catch {}

    if (session?.user) {
      await supabase.from("profiles").upsert({
        id: session.user.id,
        coins: updatedData.coins !== undefined ? updatedData.coins : coins,
        highscore:
          updatedData.highscore !== undefined
            ? updatedData.highscore
            : highScore,
        unlocked_skins:
          updatedData.unlocked_skins !== undefined
            ? updatedData.unlocked_skins
            : unlockedSkins,
        unlocked_ghost_skins:
          updatedData.unlocked_ghost_skins !== undefined
            ? updatedData.unlocked_ghost_skins
            : unlockedGhostSkins,
        updated_at: new Date(),
      });
    }
  };

  const buyOrSelectSkin = async (skin) => {
    if (unlockedSkins.includes(skin.id)) {
      setSelectedSkin(skin.id);
      try {
        localStorage.setItem("pacman-react-skin", skin.id);
      } catch {}
    } else if (coins >= skin.price) {
      const newCoins = coins - skin.price;
      const updated = [...unlockedSkins, skin.id];

      setSelectedSkin(skin.id);
      await saveProfileData({ coins: newCoins, unlocked_skins: updated });

      try {
        localStorage.setItem("pacman-react-skin", skin.id);
      } catch {}

      sfx.extraLife();
    }
  };

  const buyOrSelectGhostSkin = async (skin) => {
    if (unlockedGhostSkins.includes(skin.id)) {
      setSelectedGhostSkin(skin.id);
      try {
        localStorage.setItem("pacman-react-ghost-skin", skin.id);
      } catch {}
    } else if (coins >= skin.price) {
      const newCoins = coins - skin.price;
      const updated = [...unlockedGhostSkins, skin.id];

      setSelectedGhostSkin(skin.id);
      await saveProfileData({ coins: newCoins, unlocked_ghost_skins: updated });

      try {
        localStorage.setItem("pacman-react-ghost-skin", skin.id);
      } catch {}

      sfx.extraLife();
    }
  };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const getMazeIndex = (lv) => (lv - 1) % MAZES.length;

  const diffCfg = DIFFICULTIES[difficulty];
  const playerTickMs = Math.max(
    MIN_PLAYER_TICK,
    BASE_PLAYER_TICK - (level - 1) * 6,
  );
  const ghostTickMs = Math.max(
    MIN_GHOST_TICK,
    (BASE_GHOST_TICK - (level - 1) * 6) * diffCfg.ghostTickMult,
  );
  const frightDurationMs = Math.max(
    1500,
    (8000 - (level - 1) * 600) * diffCfg.frightMult,
  );

  const isCellWalkable = useCallback((row, col) => {
    const { grid, tunnelRows } = stateRef.current;
    let c = col;
    if (tunnelRows.includes(row)) {
      if (c < 0) c = COLS - 1;
      if (c >= COLS) c = 0;
    }
    return isWalkable(grid, row, c);
  }, []);

  const wrapCol = (row, col) => {
    const { tunnelRows } = stateRef.current;
    if (tunnelRows.includes(row)) {
      if (col < 0) return COLS - 1;
      if (col >= COLS) return 0;
    }
    return col;
  };

  const resetPositions = (keepDots, mazeIndex) => {
    const s = stateRef.current;
    const fresh = freshEntities(mazeIndex);
    if (keepDots) {
      fresh.grid = s.grid;
      fresh.dotsLeft = s.dotsLeft;
    }
    stateRef.current = fresh;
    phaseRef.current = { index: 0, elapsed: 0 };
    eatStreakRef.current = 0;
    accRef.current = { player: 0, ghost: 0 };
    deathAnimRef.current = null;
  };

  const startNewGame = (diff = "normal") => {
    const cfg = DIFFICULTIES[diff];
    difficultyRef.current = diff;
    stateRef.current = freshEntities(0);
    phaseRef.current = { index: 0, elapsed: 0 };
    eatStreakRef.current = 0;
    accRef.current = { player: 0, ghost: 0 };
    deathAnimRef.current = null;
    extraLifeGivenRef.current = false;
    livesRef.current = cfg.lives;
    setDifficulty(diff);
    setScore(0);
    setLives(cfg.lives);
    setLevel(1);
    setStatus("playing");
    sfx.start();
  };

  const replayLevel = () => {
    resetPositions(false, getMazeIndex(level));
    setStatus("playing");
  };

  const goToNextLevel = () => {
    const nextLevel = level + 1;
    setLevel(nextLevel);
    resetPositions(false, getMazeIndex(nextLevel));
    setStatus("playing");
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const dir = DIRS[e.key];
      if (dir && statusRef.current === "playing") {
        e.preventDefault();
        stateRef.current.player.nextDir = dir;
      }
      if (
        e.key === " " ||
        e.key === "p" ||
        e.key === "P" ||
        e.key === "Escape"
      ) {
        if (statusRef.current === "playing") {
          e.preventDefault();
          setStatus("paused");
        } else if (statusRef.current === "paused") {
          e.preventDefault();
          setStatus("playing");
        }
      }
      if (statusRef.current === "diff-select") {
        if (e.key === "1") startNewGame("easy");
        else if (e.key === "2" || e.key === "Enter") startNewGame("normal");
        else if (e.key === "3") startNewGame("hard");
      }
      if (
        statusRef.current === "gameover" &&
        (e.key === " " || e.key === "Enter")
      ) {
        startNewGame(difficultyRef.current);
      }
      if (statusRef.current === "level-clear") {
        if (e.key === "Enter" || e.key === " ") goToNextLevel();
        else if (e.key === "r" || e.key === "R") replayLevel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [level]);

  const triggerLifeLost = () => {
    sfx.death();
    setStatus("dying");
    deathAnimRef.current = { startedAt: performance.now() };
    setTimeout(() => {
      livesRef.current -= 1;
      setLives(livesRef.current);
      setStatus("life-lost");
      setTimeout(() => {
        if (livesRef.current <= 0) {
          setStatus("gameover");
        } else {
          resetPositions(true, getMazeIndex(level));
          setStatus("playing");
        }
      }, LIFE_LOST_PAUSE_MS);
    }, DEATH_ANIM_MS);
  };

  const addScore = (points) => {
    setScore((prev) => {
      const next = prev + points;
      const newCoinsTotal = coins + Math.floor(points / 10);

      setHighScore((hs) => {
        const newHs = next > hs ? next : hs;
        saveProfileData({
          coins: newCoinsTotal,
          highscore: newHs,
        });
        return newHs;
      });

      if (!extraLifeGivenRef.current && next >= EXTRA_LIFE_SCORE) {
        extraLifeGivenRef.current = true;
        livesRef.current += 1;
        setLives(livesRef.current);
        sfx.extraLife();
      }
      return next;
    });
  };

  const tickPlayer = () => {
    const s = stateRef.current;
    const { grid, player } = s;

    if (player.nextDir) {
      const nr = player.row + player.nextDir.row;
      const nc = wrapCol(player.row, player.col + player.nextDir.col);
      if (isCellWalkable(nr, nc)) player.dir = player.nextDir;
    }

    if (player.dir) {
      const nr = player.row + player.dir.row;
      const nc = wrapCol(player.row, player.col + player.dir.col);
      if (isCellWalkable(nr, nc)) {
        player.prevRow = player.row;
        player.prevCol = player.col;
        player.row = nr;
        player.col = nc;
        player.lastTick = performance.now();
      } else {
        player.prevRow = player.row;
        player.prevCol = player.col;
      }
    }

    const cell = grid[player.row][player.col];
    if (cell === 1) {
      grid[player.row][player.col] = 2;
      s.dotsLeft -= 1;
      addScore(10);
      sfx.chomp();
    } else if (cell === 3) {
      grid[player.row][player.col] = 2;
      s.dotsLeft -= 1;
      addScore(50);
      sfx.pellet();
      eatStreakRef.current = 0;
      for (const g of s.ghosts) {
        if (g.mode !== "eaten") {
          g.mode = "frightened";
          g.frightTimer = frightDurationMs;
          g.dir = { row: -g.dir.row, col: -g.dir.col };
        }
      }
    }

    if (s.dotsLeft <= 0) {
      setStatus("level-clear");
      sfx.levelUp();
      return;
    }

    checkCollisions();
  };

  const moveGhostOnce = (g) => {
    const s = stateRef.current;
    const blinky = s.ghosts.find((x) => x.type === "blinky");
    const target = getTarget(g, s.player, blinky);
    const flee = g.mode === "frightened";
    const dir = chooseDirection(
      g,
      target,
      (r, c) => isCellWalkable(r, c),
      flee,
    );
    if (dir) {
      g.dir = dir;
      g.prevRow = g.row;
      g.prevCol = g.col;
      g.row += dir.row;
      g.col = wrapCol(g.row, g.col + dir.col);
      g.lastTick = performance.now();
    }

    if (g.mode === "eaten") {
      if (g.row === g.homeCell.row && g.col === g.homeCell.col) {
        g.mode = PHASE_PATTERN[phaseRef.current.index].mode;
      }
    }
  };

  const tickGhosts = () => {
    const s = stateRef.current;
    for (const g of s.ghosts) {
      if (g.mode === "frightened") {
        g.frightTimer -= ghostTickMs;
        if (g.frightTimer <= 0) {
          g.mode = PHASE_PATTERN[phaseRef.current.index].mode;
        }
      } else if (g.mode !== "eaten") {
        g.mode = PHASE_PATTERN[phaseRef.current.index].mode;
      }

      moveGhostOnce(g);
      if (g.mode === "eaten") moveGhostOnce(g);
    }
    checkCollisions();
  };

  const checkCollisions = () => {
    const s = stateRef.current;
    const { player } = s;
    for (const g of s.ghosts) {
      if (g.row === player.row && g.col === player.col) {
        if (g.mode === "frightened") {
          g.mode = "eaten";
          eatStreakRef.current += 1;
          const bonus =
            200 * Math.pow(2, Math.min(eatStreakRef.current - 1, 3));
          addScore(bonus);
          sfx.eatGhost();
        } else if (g.mode !== "eaten") {
          triggerLifeLost();
          return;
        }
      }
    }
  };

  useEffect(() => {
    const loop = (now) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;

      if (statusRef.current === "playing") {
        phaseRef.current.elapsed += dt;
        const phase = PHASE_PATTERN[phaseRef.current.index];
        if (
          phaseRef.current.elapsed >= phase.dur &&
          phaseRef.current.index < PHASE_PATTERN.length - 1
        ) {
          phaseRef.current.index += 1;
          phaseRef.current.elapsed = 0;
        }

        accRef.current.player += dt;
        while (accRef.current.player >= playerTickMs) {
          tickPlayer();
          accRef.current.player -= playerTickMs;
        }
        accRef.current.ghost += dt;
        while (accRef.current.ghost >= ghostTickMs) {
          tickGhosts();
          accRef.current.ghost -= ghostTickMs;
        }
      }

      draw(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playerTickMs, ghostTickMs, frightDurationMs]);

  const draw = (now) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { grid, player, ghosts } = stateRef.current;

    canvas.width = COLS * TILE_SIZE;
    canvas.height = ROWS * TILE_SIZE;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pulse = (Math.sin(now / 200) + 1) / 2;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        if (cell === 0) {
          ctx.fillStyle = "#1e3a8a";
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else if (cell === 1) {
          ctx.fillStyle = "#facc15";
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 3) {
          ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + pulse * 0.5})`;
          ctx.beginPath();
          ctx.arc(
            x + TILE_SIZE / 2,
            y + TILE_SIZE / 2,
            5 + pulse * 1.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }

    const pt = Math.min(1, (now - player.lastTick) / playerTickMs);
    const px =
      (player.prevCol + (player.col - player.prevCol) * pt) * TILE_SIZE +
      TILE_SIZE / 2;
    const py =
      (player.prevRow + (player.row - player.prevRow) * pt) * TILE_SIZE +
      TILE_SIZE / 2;

    const activeSkinObj =
      PACMAN_SKINS.find((s) => s.id === selectedSkin) || PACMAN_SKINS[0];
    const activeSkinColor = activeSkinObj.color;

    if (statusRef.current === "dying" && deathAnimRef.current) {
      const dt = Math.min(
        1,
        (now - deathAnimRef.current.startedAt) / DEATH_ANIM_MS,
      );
      const radius = Math.max(0, (TILE_SIZE / 2 - 2) * (1 - dt));
      const spin = dt * Math.PI * 5;
      const openAngle = 0.12 + dt * 0.85;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(spin);
      ctx.fillStyle = activeSkinColor;
      ctx.beginPath();
      ctx.arc(0, 0, radius, openAngle * Math.PI, (2 - openAngle) * Math.PI);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.restore();
    } else if (
      statusRef.current !== "life-lost" &&
      statusRef.current !== "gameover" &&
      statusRef.current !== "menu"
    ) {
      const mouthT = (Math.sin(now / 60) + 1) / 2;
      const mouthAngle = 0.12 + mouthT * 0.28;
      let rot = 0;
      if (player.dir) {
        if (player.dir.row === -1) rot = -Math.PI / 2;
        else if (player.dir.row === 1) rot = Math.PI / 2;
        else if (player.dir.col === -1) rot = Math.PI;
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.fillStyle = activeSkinColor;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        TILE_SIZE / 2 - 2,
        mouthAngle * Math.PI,
        (2 - mouthAngle) * Math.PI,
      );
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.restore();
    }

    if (
      statusRef.current !== "dying" &&
      statusRef.current !== "life-lost" &&
      statusRef.current !== "menu"
    ) {
      for (const g of ghosts) {
        const gt = Math.min(1, (now - g.lastTick) / ghostTickMs);
        const gx =
          (g.prevCol + (g.col - g.prevCol) * gt) * TILE_SIZE + TILE_SIZE / 2;
        const gy =
          (g.prevRow + (g.row - g.prevRow) * gt) * TILE_SIZE + TILE_SIZE / 2;
        drawGhost(ctx, gx, gy, g, now);
      }
    }
  };

  const drawGhost = (ctx, x, y, g, now) => {
    const r = TILE_SIZE / 2 - 2;
    const activeGhostSkin =
      GHOST_SKINS.find((s) => s.id === selectedGhostSkin) || GHOST_SKINS[0];
    let bodyColor = activeGhostSkin.colors[g.type];
    let showBody = true;

    if (g.mode === "frightened") {
      const flashing = g.frightTimer < 1500 && Math.floor(now / 150) % 2 === 0;
      bodyColor = flashing ? "#fff" : "#2b3ff0";
    } else if (g.mode === "eaten") {
      showBody = false;
    }

    if (showBody) {
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(x, y - 1, r, Math.PI, 0);
      ctx.lineTo(x + r, y + r);
      for (let i = 0; i < 3; i++) {
        const bx = x + r - (i * (2 * r)) / 3 - r / 3;
        ctx.quadraticCurveTo(bx, y + r - 6, bx - r / 3, y + r);
      }
      ctx.lineTo(x - r, y - 1);
      ctx.fill();
    }

    const eyeDx = g.dir ? g.dir.col * 2.5 : 0;
    const eyeDy = g.dir ? g.dir.row * 2.5 : 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 5, y - 3, 3.2, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 3, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.mode === "frightened" ? "#2b3ff0" : "#1e3a8a";
    ctx.beginPath();
    ctx.arc(x - 5 + eyeDx, y - 3 + eyeDy, 1.6, 0, Math.PI * 2);
    ctx.arc(x + 5 + eyeDx, y - 3 + eyeDy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  };

  useEffect(() => {
    forceRender((n) => n + 1);
  }, [status]);

  const t = {
    pt: {
      play: "JOGAR",
      shop: "LOJA",
      language: "IDIOMA: PORTUGUÊS",
      back: "Voltar",
      shopTitle: "Loja de Customização",
      diffTitle: "Escolha a Dificuldade",
      easy: "Fácil",
      normal: "Normal",
      hard: "Difícil",
      score: "Pontos",
      coins: "Moedas",
      highscore: "Recorde",
      level: "Nível",
      diff: "Dificuldade",
      paused: "Pausado",
      resumeText: "Pressione Espaço/P ou clique pra continuar",
      gameOver: "Fim de Jogo",
      finalScore: "Pontuação final:",
      playAgain: "Jogar de novo",
      lifeLostTitle: "Perdeu uma vida",
      lifeLostSub:
        lives > 0 ? "Preparando pra continuar…" : "Acabaram as vidas…",
      levelClear: "completo! 🎉",
      nextMaze: "Próximo mapa",
      nextLvlBtn: "Ir pro próximo nível",
      replayLvlBtn: "Jogar de novo",
      hint: "Coma as pílulas de poder para assustar os fantasmas!",
      tabPacman: "Skins Pac-Man",
      tabGhosts: "Skins Fantasmas",
      buy: "Comprar",
      select: "Selecionar",
      selected: "Ativo ✓",
    },
    en: {
      play: "PLAY",
      shop: "SHOP",
      language: "LANGUAGE: ENGLISH",
      back: "Back",
      shopTitle: "Customization Shop",
      diffTitle: "Select Difficulty",
      easy: "Easy",
      normal: "Normal",
      hard: "Hard",
      score: "Score",
      coins: "Coins",
      highscore: "Highscore",
      level: "Level",
      diff: "Difficulty",
      paused: "Paused",
      resumeText: "Press Space/P or click to resume",
      gameOver: "Game Over",
      finalScore: "Final score:",
      playAgain: "Play Again",
      lifeLostTitle: "Life lost",
      lifeLostSub: lives > 0 ? "Preparing to continue…" : "Out of lives…",
      levelClear: "Cleared! 🎉",
      nextMaze: "Next maze",
      nextLvlBtn: "Go to next level",
      replayLvlBtn: "Replay level",
      hint: "Eat the power pellets to frighten the ghosts!",
      tabPacman: "Pac-Man Skins",
      tabGhosts: "Ghost Skins",
      buy: "Buy",
      select: "Select",
      selected: "Active ✓",
    },
  }[language];

  return (
    <div className="game-wrapper">
      <div className="hud">
        <span>
          {t.score}: {score}
        </span>
        <span>
          🪙 {t.coins}: {coins}
        </span>
        <span>
          {t.highscore}: {highScore}
        </span>
        <span>
          {t.level}: {level}
        </span>
        <span>
          {t.diff}: {DIFFICULTIES[difficulty].label}
        </span>
        <span className="lives">
          {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
            <span key={i} className="life-icon" />
          ))}
        </span>
      </div>

      <div className="canvas-shell">
        <canvas ref={canvasRef} className="game-canvas" />

        {status === "menu" && (
          <div className="overlay">
            <h1
              style={{
                color: "#facc15",
                fontSize: "2rem",
                margin: "0 0 10px 0",
              }}
            >
              Pac-Man React
            </h1>
            <div
              className="btn-row"
              style={{ flexDirection: "column", width: "200px" }}
            >
              <button onClick={() => setStatus("diff-select")}>{t.play}</button>
              <button onClick={() => setStatus("shop")}>{t.shop}</button>
              <button
                onClick={() => setLanguage((l) => (l === "pt" ? "en" : "pt"))}
              >
                {t.language}
              </button>
            </div>
          </div>
        )}

        {status === "shop" && (
          <div
            className="overlay"
            style={{
              width: "90%",
              maxWidth: "500px",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <h2>{t.shopTitle}</h2>
            <div className="btn-row" style={{ marginBottom: "15px" }}>
              <button
                onClick={() => setShopTab("pacman")}
                style={{
                  background: shopTab === "pacman" ? "#22c55e" : "#3f3f46",
                  color: "#fff",
                }}
              >
                {t.tabPacman}
              </button>
              <button
                onClick={() => setShopTab("ghosts")}
                style={{
                  background: shopTab === "ghosts" ? "#22c55e" : "#3f3f46",
                  color: "#fff",
                }}
              >
                {t.tabGhosts}
              </button>
            </div>

            {shopTab === "pacman" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  width: "100%",
                }}
              >
                {PACMAN_SKINS.map((skin) => {
                  const isUnlocked = unlockedSkins.includes(skin.id);
                  const isSelected = selectedSkin === skin.id;
                  return (
                    <div
                      key={skin.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#18181b",
                        padding: "8px 12px",
                        borderRadius: "6px",
                      }}
                    >
                      <span style={{ color: skin.color, fontWeight: "bold" }}>
                        {skin.name[language]}
                      </span>
                      <button
                        onClick={() => buyOrSelectSkin(skin)}
                        style={{
                          background: isSelected
                            ? "#22c55e"
                            : isUnlocked
                              ? "#facc15"
                              : "#eab308",
                          color: "#000",
                          padding: "6px 12px",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {isSelected
                          ? t.selected
                          : isUnlocked
                            ? t.select
                            : `${t.buy} (${skin.price}🪙)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  width: "100%",
                }}
              >
                {GHOST_SKINS.map((skin) => {
                  const isUnlocked = unlockedGhostSkins.includes(skin.id);
                  const isSelected = selectedGhostSkin === skin.id;
                  return (
                    <div
                      key={skin.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#18181b",
                        padding: "8px 12px",
                        borderRadius: "6px",
                      }}
                    >
                      <span
                        style={{
                          color: skin.colors.blinky,
                          fontWeight: "bold",
                        }}
                      >
                        {skin.name[language]}
                      </span>
                      <button
                        onClick={() => buyOrSelectGhostSkin(skin)}
                        style={{
                          background: isSelected
                            ? "#22c55e"
                            : isUnlocked
                              ? "#facc15"
                              : "#eab308",
                          color: "#000",
                          padding: "6px 12px",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {isSelected
                          ? t.selected
                          : isUnlocked
                            ? t.select
                            : `${t.buy} (${skin.price}🪙)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              style={{
                marginTop: "15px",
                background: "#3f3f46",
                color: "#fff",
              }}
              onClick={() => setStatus("menu")}
            >
              {t.back}
            </button>
          </div>
        )}

        {status === "diff-select" && (
          <div className="overlay">
            <h2>{t.diffTitle}</h2>
            <div className="btn-row">
              <button onClick={() => startNewGame("easy")}>{t.easy}</button>
              <button onClick={() => startNewGame("normal")}>{t.normal}</button>
              <button onClick={() => startNewGame("hard")}>{t.hard}</button>
            </div>
            <button
              style={{ background: "#3f3f46", color: "#fff" }}
              onClick={() => setStatus("menu")}
            >
              {t.back}
            </button>
          </div>
        )}

        {status === "paused" && (
          <div
            className="overlay"
            onClick={() => setStatus("playing")}
            role="button"
            tabIndex={0}
          >
            <h2>{t.paused}</h2>
            <p>{t.resumeText}</p>
          </div>
        )}
        {status === "dying" && (
          <div className="overlay overlay--transparent">
            <h2>Ihh! 👻</h2>
          </div>
        )}
        {status === "life-lost" && (
          <div className="overlay">
            <h2>{t.lifeLostTitle}</h2>
            <p>{t.lifeLostSub}</p>
          </div>
        )}
        {status === "level-clear" && (
          <div className="overlay">
            <h2>
              {t.level} {level} {t.levelClear}
            </h2>
            <p>
              {t.nextMaze}: {getMazeIndex(level + 1) + 1} de {MAZES.length}
            </p>
            <div className="btn-row">
              <button onClick={goToNextLevel}>{t.nextLvlBtn}</button>
              <button onClick={replayLevel}>{t.replayLvlBtn}</button>
            </div>
          </div>
        )}
        {status === "gameover" && (
          <div className="overlay">
            <h2>{t.gameOver}</h2>
            <p>
              {t.finalScore} {score}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                startNewGame(difficulty);
              }}
            >
              {t.playAgain}
            </button>
            <button
              style={{ background: "#3f3f46", color: "#fff" }}
              onClick={() => setStatus("menu")}
            >
              {t.back}
            </button>
          </div>
        )}
      </div>

      <p className="hint">{t.hint}</p>
    </div>
  );
}
