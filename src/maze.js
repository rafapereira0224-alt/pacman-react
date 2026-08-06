// Legenda:
// '#' parede
// '.' pontinho (comível, 10 pts)
// '*' power pellet (deixa os fantasmas assustados, 50 pts)
// ' ' caminho vazio (sem pontinho)
// 'P' posição inicial do Pac-Man
// 'G' Blinky (vermelho)  'K' Pinky (rosa)  'I' Inky (ciano)  'C' Clyde (laranja)

const mazeA = [
  "###################",
  "#*.......#.......*#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.### # ###.####",
  "####.#       #.####",
  "####.# ##K## #.####",
  "  I     #G#     C  ",
  "####.# ##### #.####",
  "####.#       #.####",
  "####.#.#####.#.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#..#.......P......#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#*...............*#",
  "###################",
]

const mazeB = [
  "###################",
  "#*...............*#",
  "#.###.#######.###.#",
  "#.................#",
  "#.#.#.#.###.#.#.#.#",
  "#.#.............#.#",
  "#.#.#####.#####.#.#",
  "#.................#",
  "###.## ##K## ##.###",
  "  I .   #G#   . C  ",
  "###.## ##### ##.###",
  "#.................#",
  "#.#.#####.#####.#.#",
  "#.#.............#.#",
  "#.#.#.#.###.#.#.#.#",
  "#.................#",
  "#.###.#.###.#.###.#",
  "#........P........#",
  "##.###.#####.###.##",
  "#*...............*#",
  "###################",
]

const mazeC = [
  "###################",
  "#........#........#",
  "#.###.##.#.##.###.#",
  "#*...............*#",
  "#.###.#.....#.###.#",
  "#.....#.###.#.....#",
  "##.##.#.....#.##.##",
  "#........#........#",
  "#.##.###.#.###.##.#",
  " I.....G...K..... C",
  "#.##.###.#.###.##.#",
  "#........#........#",
  "##.##.#.....#.##.##",
  "#.....#.###.#.....#",
  "#.###.#..P..#.###.#",
  "#*...............*#",
  "#.###.##.#.##.###.#",
  "#........#........#",
  "#.###.#######.###.#",
  "#..................#".slice(0, 19),
  "###################",
]

export const MAZES = [mazeA, mazeB, mazeC]

export const TILE_SIZE = 24
export const COLS = mazeA[0].length
export const ROWS = mazeA.length

const GHOST_MARKERS = {
  G: 'blinky',
  K: 'pinky',
  I: 'inky',
  C: 'clyde',
}

// Cantos usados no modo "scatter" (cada fantasma foge pro seu canto)
export const CORNERS = {
  blinky: { row: 1, col: COLS - 2 },
  pinky: { row: 1, col: 1 },
  inky: { row: ROWS - 2, col: COLS - 1 },
  clyde: { row: ROWS - 2, col: 0 },
}

// mazeIndex escolhe qual dos layouts usar (ciclo por nível, por ex. (level-1) % MAZES.length)
export function buildMaze(mazeIndex = 0) {
  const rawMaze = MAZES[mazeIndex % MAZES.length]
  const grid = []
  let playerStart = { row: 1, col: 1 }
  const ghostStarts = {}

  for (let r = 0; r < rawMaze.length; r++) {
    const row = []
    const line = rawMaze[r]
    for (let c = 0; c < COLS; c++) {
      const ch = line[c] ?? '#'
      if (ch === '#') {
        row.push(0)
      } else if (ch === 'P') {
        row.push(2)
        playerStart = { row: r, col: c }
      } else if (GHOST_MARKERS[ch]) {
        row.push(2)
        ghostStarts[GHOST_MARKERS[ch]] = { row: r, col: c }
      } else if (ch === '.') {
        row.push(1)
      } else if (ch === '*') {
        row.push(3)
      } else {
        row.push(2)
      }
    }
    grid.push(row)
  }

  return { grid, playerStart, ghostStarts }
}

export function isWalkable(grid, row, col) {
  if (row < 0 || row >= grid.length) return false
  // colunas fora do range só são válidas em linhas-túnel (tratado à parte)
  if (col < 0 || col >= grid[0].length) return false
  return grid[row][col] !== 0
}

// Linhas onde as duas bordas (col 0 e col COLS-1) são caminho: viram túnel (wrap-around)
export function findTunnelRows(grid) {
  const rows = []
  for (let r = 0; r < grid.length; r++) {
    if (grid[r][0] !== 0 && grid[r][grid[0].length - 1] !== 0) {
      rows.push(r)
    }
  }
  return rows
}

export function countDots(grid) {
  let total = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 1 || cell === 3) total++
    }
  }
  return total
}
