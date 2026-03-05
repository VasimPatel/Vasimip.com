"use client"

import { useState, useCallback } from "react"
import { DIALOGUE_SCRIPTS, type DialogueNode } from "@/lib/data/dialogue-scripts"
import { useGameStore } from "@/lib/stores/game-store"

export function useDialogue(scriptId: string) {
  const script = DIALOGUE_SCRIPTS[scriptId]
  const { setDialogueChoice, dialogueChoices } = useGameStore()

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(
    script ? script.startNodeId : null
  )
  const [lineIndex, setLineIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const currentNode: DialogueNode | null =
    script && currentNodeId ? script.nodes[currentNodeId] || null : null

  const currentLine = currentNode?.lines[lineIndex] || null
  const isLastLine = currentNode ? lineIndex >= currentNode.lines.length - 1 : true
  const hasChoices = isLastLine && !!currentNode?.choices && currentNode.choices.length > 0

  const advance = useCallback(() => {
    if (!currentNode) return

    if (!isLastLine) {
      setLineIndex((prev) => prev + 1)
      return
    }

    // At last line — check for auto-advance
    if (currentNode.nextNodeId) {
      setCurrentNodeId(currentNode.nextNodeId)
      setLineIndex(0)
      return
    }

    // No next node and no choices — dialogue is complete
    if (!currentNode.choices) {
      setIsComplete(true)
    }
  }, [currentNode, isLastLine])

  const makeChoice = useCallback(
    (choiceId: string, nextNodeId: string) => {
      setDialogueChoice(`${scriptId}:${currentNodeId}`, choiceId)
      setCurrentNodeId(nextNodeId)
      setLineIndex(0)
    },
    [scriptId, currentNodeId, setDialogueChoice]
  )

  const restart = useCallback(() => {
    if (!script) return
    setCurrentNodeId(script.startNodeId)
    setLineIndex(0)
    setIsComplete(false)
  }, [script])

  return {
    currentLine,
    currentNode,
    hasChoices,
    isComplete,
    isLastLine,
    advance,
    makeChoice,
    restart,
    previousChoice: currentNodeId ? dialogueChoices[`${scriptId}:${currentNodeId}`] : undefined,
  }
}
