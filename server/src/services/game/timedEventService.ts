import { PrismaClient, TimedEvent } from '@prisma/client';

const prisma = new PrismaClient();

export interface ProgressNarrative {
  atTurns: number;
  narrative: string;
}

export interface EventConsequence {
  type: 'game_over' | 'damage' | 'room_change' | 'item_lost' | 'character_action' | 'story_branch' | 'custom';
  data?: Record<string, unknown>;
}

export interface CreateTimedEventInput {
  storyId: string;
  roomId?: string;
  name: string;
  description: string;
  totalTurns: number;
  progressNarratives: ProgressNarrative[];
  triggerNarrative: string;
  consequence: EventConsequence;
  canBePrevented?: boolean;
  preventionHint?: string;
}

export interface TickResult {
  event: TimedEvent;
  narrative: string | null;
  triggered: boolean;
  consequence: EventConsequence | null;
}

/**
 * Create a new timed event
 */
export async function createTimedEvent(input: CreateTimedEventInput): Promise<TimedEvent> {
  return prisma.timedEvent.create({
    data: {
      storyId: input.storyId,
      roomId: input.roomId,
      name: input.name,
      description: input.description,
      turnsRemaining: input.totalTurns,
      totalTurns: input.totalTurns,
      progressNarratives: input.progressNarratives as unknown as object,
      triggerNarrative: input.triggerNarrative,
      consequence: input.consequence as unknown as object,
      canBePrevented: input.canBePrevented ?? true,
      preventionHint: input.preventionHint,
    },
  });
}

/**
 * Get all active timed events for a story
 */
export async function getActiveEvents(storyId: string, roomId?: string): Promise<TimedEvent[]> {
  const where: Record<string, unknown> = {
    storyId,
    isActive: true,
    isTriggered: false,
  };

  // Get both story-wide events (roomId = null) and room-specific events
  if (roomId) {
    where.OR = [
      { roomId: null },
      { roomId },
    ];
  } else {
    where.roomId = null;
  }

  return prisma.timedEvent.findMany({
    where,
    orderBy: { turnsRemaining: 'asc' },
  });
}

/**
 * Tick all active events and return narratives/triggers
 */
export async function tickEvents(storyId: string, roomId?: string): Promise<TickResult[]> {
  const events = await getActiveEvents(storyId, roomId);
  const results: TickResult[] = [];

  for (const event of events) {
    const newTurnsRemaining = event.turnsRemaining - 1;
    const progressNarratives = event.progressNarratives as unknown as ProgressNarrative[];

    // Check if event triggers
    if (newTurnsRemaining <= 0) {
      // Event triggers!
      await prisma.timedEvent.update({
        where: { id: event.id },
        data: {
          turnsRemaining: 0,
          isTriggered: true,
          isActive: false,
          triggeredAt: new Date(),
        },
      });

      results.push({
        event,
        narrative: event.triggerNarrative,
        triggered: true,
        consequence: event.consequence as unknown as EventConsequence,
      });
    } else {
      // Update countdown
      await prisma.timedEvent.update({
        where: { id: event.id },
        data: { turnsRemaining: newTurnsRemaining },
      });

      // Find matching progress narrative
      const matchingNarrative = progressNarratives.find(
        pn => pn.atTurns === newTurnsRemaining
      );

      // If no exact match, generate a generic urgency narrative for low turns
      let narrative: string | null = matchingNarrative?.narrative || null;

      if (!narrative && newTurnsRemaining <= 2) {
        // Generate urgency for final turns
        narrative = `[${event.name}: ${newTurnsRemaining} turn${newTurnsRemaining !== 1 ? 's' : ''} remaining!]`;
      }

      results.push({
        event,
        narrative,
        triggered: false,
        consequence: null,
      });
    }
  }

  return results;
}

/**
 * Cancel/prevent a timed event
 */
export async function cancelEvent(eventId: string): Promise<TimedEvent> {
  return prisma.timedEvent.update({
    where: { id: eventId },
    data: {
      isActive: false,
    },
  });
}

/**
 * Cancel an event by name
 */
export async function cancelEventByName(storyId: string, name: string): Promise<TimedEvent | null> {
  const event = await prisma.timedEvent.findFirst({
    where: {
      storyId,
      name,
      isActive: true,
    },
  });

  if (!event) return null;

  return cancelEvent(event.id);
}

/**
 * Extend an event's countdown
 */
export async function extendEvent(eventId: string, additionalTurns: number): Promise<TimedEvent> {
  const event = await prisma.timedEvent.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new Error(`Event ${eventId} not found`);
  }

  return prisma.timedEvent.update({
    where: { id: eventId },
    data: {
      turnsRemaining: event.turnsRemaining + additionalTurns,
      totalTurns: event.totalTurns + additionalTurns,
    },
  });
}

/**
 * Format tick results into narrative text
 */
export function formatTickResults(results: TickResult[]): string {
  const narratives: string[] = [];

  for (const result of results) {
    if (result.narrative) {
      narratives.push(result.narrative);
    }
  }

  return narratives.join('\n\n');
}

/**
 * Check if any triggered events cause game over
 */
export function checkForGameOver(results: TickResult[]): { isGameOver: boolean; narrative: string | null } {
  for (const result of results) {
    if (result.triggered && result.consequence?.type === 'game_over') {
      return {
        isGameOver: true,
        narrative: result.narrative,
      };
    }
  }

  return { isGameOver: false, narrative: null };
}
