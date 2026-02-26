import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Lightbulb, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface BrainstormNewFormProps {
  onSubmit: (message: string) => Promise<void>
  isSubmitting: boolean
}

export function BrainstormNewForm({ onSubmit, isSubmitting }: BrainstormNewFormProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting) return
    await onSubmit(input.trim())
    // Don't clear input here — on success the component unmounts (parent transitions to chat),
    // on failure we preserve the user's input so they can retry
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="h-8 w-8 text-accent-yellow" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Start a Brainstorm
          </h2>
          <p className="text-text-muted">
            Describe what you'd like to brainstorm with Claude
          </p>
        </div>

        <div className="space-y-4">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to brainstorm?"
            className="min-h-[120px] resize-none text-base"
            disabled={isSubmitting}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-text-muted">
              Press Enter to send, Shift+Enter for new line
            </p>
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Start
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
