# TUI Chat-Style Redesign Plan

## Goal

Transform the Magic Shell TUI from a single-command interface into a chat-like conversation interface with visible history, similar to the website mockup.

## Current Architecture

The TUI uses `@opentui/core` with these main components:
- `BoxRenderable` - Layout containers
- `TextRenderable` - Text display
- `InputRenderable` - User input field
- `SelectRenderable` - Dropdown/selection menus

Current layout:
```
┌─────────────────────────────────────────┐
│ magic-shell - natural language...        │
├─────────────────────────────────────────┤
│ cwd: /path/to/dir        [zen] Model    │
├─────────────────────────────────────────┤
│ > [input field]                         │
├─────────────────────────────────────────┤
│ Command: <last command>                 │
│ [Safety warning if applicable]          │
├─────────────────────────────────────────┤
│ ┌─ Output ─────────────────────────────┐│
│ │                                      ││
│ │ [Single output area]                 ││
│ │                                      ││
│ └──────────────────────────────────────┘│
├─────────────────────────────────────────┤
│ Ctrl+X P palette | Ctrl+X M model | ... │
└─────────────────────────────────────────┘
```

## Proposed Layout (Chat-Style)

```
┌─────────────────────────────────────────────────────┐
│ magic-shell                       [Big Pickle]    │
├─────────────────────────────────────────────────────┤
│ Provider: opencode-zen  Model: Big Pickle  ● Safe   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ Chat History (scrollable) ─────────────────────┐ │
│ │                                                 │ │
│ │ > find all large files                          │ │
│ │ ┌───────────────────────────────────────────┐   │ │
│ │ │ Command: find . -type f -size +100M       │   │ │
│ │ │ ● Low risk                                │   │ │
│ │ │ [Enter] Run  [c] Copy  [e] Edit           │   │ │
│ │ └───────────────────────────────────────────┘   │ │
│ │                                                 │ │
│ │ > kill process on port 8080                     │ │
│ │ ┌───────────────────────────────────────────┐   │ │
│ │ │ Command: kill $(lsof -t -i:8080)          │   │ │
│ │ │ ● Medium risk - kills processes           │   │ │
│ │ │ [Enter] Run  [c] Copy  [e] Edit           │   │ │
│ │ └───────────────────────────────────────────┘   │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ~> [input field with cursor]                        │
├─────────────────────────────────────────────────────┤
│ Ctrl+X M Model  Ctrl+X T Theme  Ctrl+X D Dry-run    │
└─────────────────────────────────────────────────────┘
```

## Key Changes

### 1. Chat History Container
- Scrollable area showing conversation history
- Each exchange = user query + AI response
- Response cards with:
  - Translated command
  - Safety badge with severity color
  - Action buttons (Run/Copy/Edit)
- Auto-scroll to bottom on new messages

### 2. Message Types

```typescript
interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'system' | 'result'
  content: string
  timestamp: number
  // For assistant messages:
  command?: string
  safety?: SafetyAnalysis
  executed?: boolean
  output?: string
}
```

### 3. Visual Components

**User Message:**
```
> [user's natural language query]
```

**Assistant Response Card:**
```
┌──────────────────────────────────────┐
│ Command: [translated command]        │
│ ● [severity] risk - [reason]         │
│ [Enter] Run  [c] Copy  [e] Edit      │
└──────────────────────────────────────┘
```

**Execution Result:**
```
┌──────────────────────────────────────┐
│ ✓ Executed successfully              │
│ [output if any]                      │
└──────────────────────────────────────┘
```

### 4. Status Bar (Top)
- Provider name
- Model name (clickable/shortcut)
- Safe Mode indicator (green dot)
- Dry-run indicator when active

### 5. Input Area (Bottom)
- Prompt: `~>` or custom
- Full-width input
- Cursor visible

### 6. Help Bar (Bottom)
- Key shortcuts
- Contextual based on state

## Implementation Steps

### Phase 1: Data Model
1. Create `ChatMessage` interface
2. Create `ChatHistory` manager class
3. Migrate from single `outputText` to message array

### Phase 2: Layout Refactor
1. Create new layout structure in `createMainUI()`
2. Create `ChatHistoryRenderable` component (scrollable box with messages)
3. Create `MessageCard` helper for rendering response cards
4. Update header/status bar layout

### Phase 3: Scrolling & Navigation
1. Implement scroll in chat history
2. Add keyboard navigation (up/down to select messages)
3. Add action shortcuts on selected message

### Phase 4: Visual Polish
1. Match website design (colors, spacing)
2. Add message animations (fade in)
3. Improve safety badge styling

### Phase 5: New Features
1. Re-run previous commands from history
2. Edit and re-submit queries
3. Copy command to clipboard
4. Clear history option

## Files to Modify

| File | Changes |
|------|---------|
| `src/cli.ts` | Major refactor - new layout, chat history |
| `src/lib/types.ts` | Add `ChatMessage` interface |
| `src/lib/config.ts` | Update history format if needed |

## Estimated Complexity

**Medium-High**

The main challenges:
1. Scrolling in `@opentui/core` - need to verify scrollable container support
2. Dynamic message list rendering
3. Keyboard navigation between messages
4. Maintaining backwards compatibility with existing features

## Open Questions

1. Should we persist chat history across sessions?
2. Max messages to display before auto-cleanup?
3. Should executed commands show their output inline?
4. Mobile/small terminal handling?

## Acceptance Criteria

- [ ] Chat history visible with multiple exchanges
- [ ] Each response in a styled card
- [ ] Safety badges with correct colors
- [ ] Scrollable history area
- [ ] Input at bottom with visible cursor
- [ ] All existing shortcuts still work
- [ ] Keyboard navigation between messages
- [ ] Run/Copy/Edit actions on messages
