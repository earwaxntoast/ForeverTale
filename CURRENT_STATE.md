# ForeverTale - Current State

## Recent Work: Coherence Pass (Step 10)

Added a new story generation step that works backwards through generated content to enhance descriptions with subtle foreshadowing based on puzzles and secrets.

### Files Modified

- `server/src/services/ai/storyGeneration/types.ts`
  - Added `CoherencePassData`, `RoomUpdate`, `ObjectUpdate`, `CharacterUpdate` interfaces
  - Added `'coherencePass'` to `GenerationStepName` union
  - Updated `GENERATION_STEPS` array (now 11 steps)

- `server/src/services/ai/storyGeneration/steps.ts`
  - Added `collectImportantEntities()` - identifies story-critical entities
  - Added `enhanceEntityDescription()` - parallel Haiku calls for foreshadowing
  - Added `generateCoherencePass()` - main step function

- `server/src/services/ai/storyGeneration/orchestrator.ts`
  - Added `applyCoherenceUpdates()` - merges enhanced descriptions back into data
  - Added step function mapping and log messages
  - Added special handling to re-persist updated `connectingAreas` and `characters`

### New Step Order

1. identity
2. initialMap
3. connectingAreas
4. characters
5. backstory
6. storyBeats
7. puzzles
8. startingSkills
9. secretFacts
10. **coherencePass** (NEW)
11. opening

---

## Open Questions: Importance Criteria

The current `collectImportantEntities()` function flags entities based on:

### Currently Checked

| Entity Type | Criteria |
|-------------|----------|
| **Rooms** | Is `puzzle.roomName` for any puzzle |
| **Rooms** | WORLD secret's `topics` matches room name |
| **Objects** | Puzzle step with `nodeType === 'object'` and matching `targetName` |
| **Objects** | Listed in `puzzle.step.givesItem` |
| **Objects** | Listed in `puzzle.step.requiredItems` |
| **Characters** | Puzzle step with `nodeType === 'character'` and matching `targetName` |
| **Characters** | CHARACTER secret's `content` or `topics` mentions their name |

### Not Currently Checked (Potential Gaps)

1. **`isStoryCritical` flags** - Rooms and objects can be marked `isStoryCritical: true` in initialMap/connectingAreas, but we're not checking this

2. **Story beat locations** - `storyBeats` may reference specific rooms or characters in their descriptions/outcomes, but we're not scanning them

3. **Character's own secrets** - Characters have `personality.secrets` field from step 4, but we're only checking `secretFacts` from step 9

4. **Starting room** - Always narratively important but not explicitly flagged

5. **Vehicle rooms** - Rooms with `isVehicle: true` might need special consideration

6. **Hidden exits** - Rooms with `connectionDescriptions[].isHidden: true` could benefit from atmospheric hints

---

## Next Steps

### Immediate
- [ ] Decide which additional importance criteria to add
- [ ] Expand `collectImportantEntities()` with agreed-upon criteria
- [ ] Test coherence pass with actual story generation

### Future Considerations
- [ ] Consider batching Haiku calls if entity count gets too high (>50)
- [ ] Add coherence validation (check that enhanced descriptions still match tone)
- [ ] Consider enhancing connection descriptions (exit text) for hidden passages
- [ ] Potentially add atmosphere enhancement for mood consistency

---

## Technical Notes

- Coherence pass uses `claude-3-5-haiku-20241022` (FAST_MODEL) for all enhancement calls
- All enhancement calls run in parallel via `Promise.all`
- Estimated cost: ~$0.02 per story, ~1-2s latency
- Updates are applied in-memory to `context.stepData` before final persistence
- Updated `connectingAreas` and `characters` are re-persisted to `storySeed` for recovery

---

## How to Test

```bash
cd server
npm run build
# Then trigger story generation through the client or API
```

The coherence pass will log:
```
[Step 10] Starting coherence pass...
[Step 10] Found X entities to enhance
[Step 10] Coherence pass complete in Xs
[Step 10] Updated: X rooms, X objects, X characters
[Coherence] Applied updates: X rooms, X objects, X characters
```
