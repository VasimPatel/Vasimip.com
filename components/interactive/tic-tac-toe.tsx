"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

type Cell = "X" | "O" | null
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
    test[i] = "O"
    if (checkWinner(test) === "O") return i
  }
  // Block player
  for (const i of empty) {
    const test = [...board]
    test[i] = "X"
    if (checkWinner(test) === "X") return i
  }
  // Take center or random
  if (board[4] === null) return 4
  return empty[Math.floor(Math.random() * empty.length)]
}

interface TicTacToeProps {
  className?: string
  onWin?: () => void
}

export function TicTacToe({ className, onWin }: TicTacToeProps) {
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
      newBoard[index] = "X"

      const winner = checkWinner(newBoard)
      if (winner) {
        setBoard(newBoard)
        setGameOver(true)
        setStatus("You win! 🎉")
        onWin?.()
        return
      }

      if (newBoard.every((c) => c !== null)) {
        setBoard(newBoard)
        setGameOver(true)
        setStatus("Draw!")
        return
      }

      // AI move
      const aiMove = getAIMove(newBoard)
      if (aiMove !== -1) {
        newBoard[aiMove] = "O"
        const aiWinner = checkWinner(newBoard)
        if (aiWinner) {
          setBoard(newBoard)
          setGameOver(true)
          setStatus("AI wins!")
          return
        }
        if (newBoard.every((c) => c !== null)) {
          setBoard(newBoard)
          setGameOver(true)
          setStatus("Draw!")
          return
        }
      }

      setBoard(newBoard)
    },
    [board, gameOver, onWin]
  )

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className="grid grid-cols-3 gap-[2px]"
        style={{ filter: "url(#hand-drawn)" }}
        role="grid"
        aria-label="Tic-tac-toe game"
      >
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            className="w-8 h-8 border border-[var(--notebook-ink)] flex items-center justify-center text-sm font-bold text-[var(--notebook-ink)] hover:bg-[var(--notebook-ink)]/5 transition-colors"
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
        <div className="text-[10px] font-[var(--font-caveat)] text-[var(--notebook-ink)]">
          {status}
        </div>
      )}
      {gameOver && (
        <button
          onClick={reset}
          className="text-[9px] underline text-[var(--notebook-ink)] opacity-60 hover:opacity-100"
        >
          play again
        </button>
      )}
    </div>
  )
}
