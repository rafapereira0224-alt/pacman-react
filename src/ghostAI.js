import { CORNERS } from './maze.js'

const DIR_VECTORS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
]

function dist2(a, b) {
  const dr = a.row - b.row
  const dc = a.col - b.col
  return dr * dr + dc * dc
}

// Calcula a célula-alvo de um fantasma de acordo com sua personalidade e modo atual
export function getTarget(ghost, player, blinky) {
  if (ghost.mode === 'frightened') {
    // alvo fictício distante do player: qualquer direção que aumente distância serve,
    // a escolha de direção trata frightened separadamente (foge, não persegue)
    return null
  }
  if (ghost.mode === 'eaten') {
    return ghost.homeCell
  }
  if (ghost.mode === 'scatter') {
    return CORNERS[ghost.type]
  }

  // modo chase: cada personalidade mira diferente
  switch (ghost.type) {
    case 'blinky':
      return { row: player.row, col: player.col }
    case 'pinky': {
      const dir = player.dir || { row: 0, col: 0 }
      return { row: player.row + dir.row * 4, col: player.col + dir.col * 4 }
    }
    case 'inky': {
      const dir = player.dir || { row: 0, col: 0 }
      const pivot = { row: player.row + dir.row * 2, col: player.col + dir.col * 2 }
      const bref = blinky || pivot
      return { row: pivot.row + (pivot.row - bref.row), col: pivot.col + (pivot.col - bref.col) }
    }
    case 'clyde': {
      const d = dist2(ghost, player)
      if (d > 64) return { row: player.row, col: player.col }
      return CORNERS.clyde
    }
    default:
      return { row: player.row, col: player.col }
  }
}

// Escolhe a melhor direção válida pra um fantasma ir em direção (ou fuga) de um alvo
export function chooseDirection(ghost, target, isWalkableFn, flee = false) {
  const reverse = ghost.dir ? { row: -ghost.dir.row, col: -ghost.dir.col } : null
  const options = DIR_VECTORS.filter((d) => {
    if (reverse && d.row === reverse.row && d.col === reverse.col) return false
    return isWalkableFn(ghost.row + d.row, ghost.col + d.col)
  })

  let candidates = options
  if (candidates.length === 0) {
    // beco sem saída: permite voltar
    candidates = DIR_VECTORS.filter((d) => isWalkableFn(ghost.row + d.row, ghost.col + d.col))
  }
  if (candidates.length === 0) return ghost.dir

  if (!target) {
    // sem alvo (frightened sem fuga direcionada): escolhe aleatório
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  candidates.sort((a, b) => {
    const da = dist2({ row: ghost.row + a.row, col: ghost.col + a.col }, target)
    const db = dist2({ row: ghost.row + b.row, col: ghost.col + b.col }, target)
    return flee ? db - da : da - db
  })
  return candidates[0]
}
