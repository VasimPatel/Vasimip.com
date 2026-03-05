"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

type Cell = "⚔️" | "🛡️" | null
type Board = Cell[]

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function checkWinner(board: Board): Cell {
  for (const [a, b, c] of WINNING_COMBOS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

function getAIMove(board: Board): number {
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i !== -1)
  if (empty.length === 0) return -1

  // Try to win
  for (const i of empty) {
    const test = [...board]
    test[i] = "🛡️"
    if (checkWinner(test) === "🛡️") return i
  }
  // Block player
  for (const i of empty) {
    const test = [...board]
    test[i] = "⚔️"
    if (checkWinner(test) === "⚔️") return i
  }
  if (board[4] === null) return 4
  return empty[Math.floor(Math.random() * empty.length)]
}

interface DungeonPuzzleProps {
  className?: string
  onWin?: () => void
}

export function DungeonPuzzle({ className, onWin }: DungeonPuzzleProps) {
  const [board, setBoard] = useState<Board>(Array(9).fill(null))
  const [gameOver, setGameOver] = useState(false)
  const [status, setStatus] = useState("")

  const reset = useCallback(() => {
    setBoard(Array(9).fill(null))
    setGameOver(false)
    setStatus("")
  }, [])

  const handleClick = useCallback(
    (index: number) => {
      if (board[index] || gameOver) return

      const newBoard = [...board]
      newBoard[index] = "⚔️"

      const winner = checkWinner(newBoard)
      if (winner) {
        setBoard(newBoard)
        setGameOver(true)
        setStatus("VICTORY!")
        onWin?.()
        return
      }

      if (newBoard.every((c) => c !== null)) {
        setBoard(newBoard)
        setGameOver(true)
        setStatus("Draw — try again!")
        return
      }

      const aiMove = getAIMove(newBoard)
      if (aiMove !== -1) {
        newBoard[aiMove] = "🛡️"
        const aiWinner = checkWinner(newBoard)
        if (aiWinner) {
          setBoard(newBoard)
          setGameOver(true)
          setStatus("Defeated! Try again.")
          return
        }
        if (newBoard.every((c) => c !== null)) {
          setBoard(newBoard)
          setGameOver(true)
          setStatus("Draw — try again!")
          return
        }
      }

      setBoard(newBoard)
    },
    [board, gameOver, onWin]
  )

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-60">
        YOU: ⚔️ &nbsp; GUARDIAN: 🛡️
      </div>

      <div
        className="grid grid-cols-3 gap-1 p-2 border-3 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]"
        style={{ boxShadow: "3px 3px 0 var(--comic-panel-shadow)" }}
        role="grid"
        aria-label="Dungeon puzzle game"
      >
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            className="w-14 h-14 border-2 border-[var(--comic-panel-border)] flex items-center justify-center text-2xl bg-[var(--comic-bg)] hover:bg-[var(--comic-halftone)] transition-colors"
            disabled={!!cell || gameOver}
            aria-label={`Cell ${i + 1}: ${cell || "empty"}`}
          >
            {cell && (
              <motion.span
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                {cell}
              </motion.span>
            )}
          </button>
        ))}
      </div>

      {status && (
        <div className={cn(
          "font-comic text-xl",
          status === "VICTORY!" ? "text-[var(--comic-green)]" : "text-[var(--comic-red)]"
        )}>
          {status}
        </div>
      )}

      {gameOver && (
        <button
          onClick={reset}
          className="font-pixel text-[9px] px-4 py-2 border-2 border-[var(--comic-panel-border)] text-[var(--comic-ink)] hover:bg-[var(--comic-yellow)] transition-colors"
        >
          REMATCH
        </button>
      )}
    </div>
  )
}
