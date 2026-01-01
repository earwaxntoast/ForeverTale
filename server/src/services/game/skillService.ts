import { PrismaClient, PlayerAbility } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Default verb-to-skill mappings
export const DEFAULT_SKILL_VERBS: Record<string, string[]> = {
  // Physical
  'Athletics': ['jump', 'climb', 'swim', 'run', 'lift', 'push', 'pull'],
  'Acrobatics': ['dodge', 'flip', 'tumble', 'balance', 'vault'],
  'Stealth': ['sneak', 'hide', 'creep', 'shadow', 'lurk'],
  'Combat': ['fight', 'attack', 'strike', 'punch', 'kick', 'defend', 'parry'],

  // Mental
  'Perception': ['notice', 'spot', 'listen', 'hear', 'sense', 'detect'],
  'Investigation': ['search', 'investigate', 'analyze', 'deduce', 'examine'],
  'Knowledge': ['recall', 'remember', 'identify', 'recognize'],

  // Social
  'Persuasion': ['persuade', 'convince', 'negotiate', 'charm', 'flatter'],
  'Deception': ['lie', 'bluff', 'deceive', 'trick', 'mislead', 'con'],
  'Intimidation': ['intimidate', 'threaten', 'menace', 'scare', 'bully'],
  'Performance': ['perform', 'sing', 'dance', 'act', 'entertain'],

  // Technical
  'Hacking': ['hack', 'breach', 'crack', 'bypass', 'decrypt', 'infiltrate'],
  'Mechanics': ['repair', 'fix', 'build', 'construct', 'tinker', 'rig'],
  'Medicine': ['heal', 'treat', 'diagnose', 'bandage', 'stabilize'],
  'Piloting': ['drive', 'pilot', 'steer', 'navigate', 'fly', 'sail'],

  // Thievery
  'Lockpicking': ['pick', 'unlock', 'lockpick'],
  'Pickpocket': ['pickpocket', 'steal', 'lift', 'swipe', 'filch'],
};

// Difficulty scale reference
export const DIFFICULTY_SCALE = {
  TRIVIAL: 5,      // Anyone can do this
  EASY: 10,        // Simple task
  MODERATE: 15,    // Requires some skill
  CHALLENGING: 20, // Trained individuals
  HARD: 25,        // Experts only
  VERY_HARD: 30,   // Masters struggle
  HEROIC: 35,      // Legendary difficulty
  IMPOSSIBLE: 40,  // Near-mythical feat
};

export interface SkillCheckResult {
  success: boolean;
  roll: number;
  total: number;
  abilityName: string;
  abilityLevel: number;
  difficulty: number;
  margin: number;
  isNat20: boolean;
  isNat1: boolean;
  skillGain: number;
  diceAscii: string;
  personalitySignal?: {
    dimension: string;
    delta: number;
    confidence: number;
    reasoning: string;
  };
}

/**
 * Render a d20 result (simplified for now - ASCII art on hold)
 */
export function renderD20(roll: number): string {
  let result = `[ d20: ${roll} ]`;

  if (roll === 20) {
    result += '  *** NATURAL 20! ***';
  } else if (roll === 1) {
    result += '  *** NATURAL 1! ***';
  }

  return result;
}

/**
 * Roll a d20
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Get or create a player ability
 */
export async function getOrCreateAbility(
  storyId: string,
  abilityName: string,
  origin: 'backstory' | 'attempted' | 'trained' | 'story_event' = 'attempted',
  startingLevel: number = 1
): Promise<PlayerAbility> {
  // Normalize ability name
  const normalizedName = abilityName.charAt(0).toUpperCase() + abilityName.slice(1).toLowerCase();

  // Check if ability exists
  let ability = await prisma.playerAbility.findUnique({
    where: {
      storyId_name: { storyId, name: normalizedName },
    },
  });

  if (!ability) {
    // Get default verbs for this skill
    const triggerVerbs = DEFAULT_SKILL_VERBS[normalizedName] || [];

    ability = await prisma.playerAbility.create({
      data: {
        storyId,
        name: normalizedName,
        level: startingLevel,
        origin,
        triggerVerbs,
      },
    });
  }

  return ability;
}

/**
 * Perform a skill check
 */
export async function performSkillCheck(
  storyId: string,
  abilityName: string,
  difficulty: number,
  context: string
): Promise<SkillCheckResult> {
  // Get or create the ability
  const ability = await getOrCreateAbility(storyId, abilityName);
  const abilityLevel = Number(ability.level);

  // Roll the dice
  const roll = rollD20();
  const total = roll + abilityLevel;
  const success = total >= difficulty;
  const margin = total - difficulty;

  const isNat20 = roll === 20;
  const isNat1 = roll === 1;

  // Calculate skill gain on success
  // Formula: skillGain = max(0, margin) / 20
  let skillGain = 0;
  if (success && margin > 0) {
    skillGain = margin / 20;
  }

  // Update ability
  await prisma.playerAbility.update({
    where: { id: ability.id },
    data: {
      level: { increment: skillGain },
      timesUsed: { increment: 1 },
      timesSucceeded: success ? { increment: 1 } : undefined,
      lastUsedAt: new Date(),
    },
  });

  // Record the skill check
  await prisma.skillCheck.create({
    data: {
      storyId,
      abilityName: ability.name,
      abilityLevel,
      difficulty,
      roll,
      total,
      success: isNat20 ? true : isNat1 ? false : success, // Nat 20 always succeeds, Nat 1 always fails
      isNat20,
      isNat1,
      skillGain,
      context,
    },
  });

  // Generate personality signal based on risk-taking
  let personalitySignal: SkillCheckResult['personalitySignal'];

  // High difficulty attempt = bold/adventurous
  if (difficulty >= DIFFICULTY_SCALE.HARD) {
    personalitySignal = {
      dimension: 'O', // Openness - willingness to take risks
      delta: 3,
      confidence: 5,
      reasoning: `Attempted a difficult ${ability.name} check (difficulty ${difficulty})`,
    };
  }

  // Nat 20 on hard check = extra confidence signal
  if (isNat20 && difficulty >= DIFFICULTY_SCALE.CHALLENGING) {
    personalitySignal = {
      dimension: 'E', // Extraversion - confidence under pressure
      delta: 4,
      confidence: 6,
      reasoning: `Critical success on challenging ${ability.name} check!`,
    };
  }

  return {
    success: isNat20 ? true : isNat1 ? false : success,
    roll,
    total,
    abilityName: ability.name,
    abilityLevel,
    difficulty,
    margin,
    isNat20,
    isNat1,
    skillGain,
    diceAscii: renderD20(roll),
    personalitySignal,
  };
}

/**
 * Find which skill a verb triggers - checks player's abilities first, then defaults
 */
export async function findSkillForVerb(verb: string, storyId?: string): Promise<string | null> {
  const normalizedVerb = verb.toLowerCase();

  // If we have a storyId, check player's actual abilities first
  if (storyId) {
    const playerAbilities = await prisma.playerAbility.findMany({
      where: { storyId },
    });

    for (const ability of playerAbilities) {
      const triggerVerbs = ability.triggerVerbs as string[] || [];

      // Check if any trigger verb matches (case-insensitive, partial match)
      for (const triggerVerb of triggerVerbs) {
        const normalizedTrigger = triggerVerb.toLowerCase();
        // Match if verb equals trigger OR verb contains trigger OR trigger contains verb
        if (normalizedVerb === normalizedTrigger ||
            normalizedVerb.includes(normalizedTrigger) ||
            normalizedTrigger.includes(normalizedVerb)) {
          return ability.name;
        }
      }

      // Also check if the verb matches part of the skill name itself
      // e.g., "maintain" should match "Lighthouse Maintenance"
      const skillNameLower = ability.name.toLowerCase();
      const skillWords = skillNameLower.split(/\s+/);
      for (const word of skillWords) {
        if (word.startsWith(normalizedVerb) || normalizedVerb.startsWith(word)) {
          return ability.name;
        }
      }
    }
  }

  // Fall back to default skill verbs
  for (const [skill, verbs] of Object.entries(DEFAULT_SKILL_VERBS)) {
    if (verbs.includes(normalizedVerb)) {
      return skill;
    }
  }

  return null;
}

/**
 * Get all abilities for a story
 */
export async function getAbilities(storyId: string): Promise<PlayerAbility[]> {
  return prisma.playerAbility.findMany({
    where: { storyId },
    orderBy: { level: 'desc' },
  });
}

/**
 * Get ability by name
 */
export async function getAbility(storyId: string, name: string): Promise<PlayerAbility | null> {
  const normalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return prisma.playerAbility.findUnique({
    where: {
      storyId_name: { storyId, name: normalizedName },
    },
  });
}

/**
 * Create starting abilities from character backstory
 */
export async function createStartingAbilities(
  storyId: string,
  abilities: Array<{ name: string; level: number; verbs?: string[] }>
): Promise<PlayerAbility[]> {
  const created: PlayerAbility[] = [];

  for (const ability of abilities) {
    const normalizedName = ability.name.charAt(0).toUpperCase() + ability.name.slice(1).toLowerCase();
    const triggerVerbs = ability.verbs || DEFAULT_SKILL_VERBS[normalizedName] || [];

    const created_ability = await prisma.playerAbility.create({
      data: {
        storyId,
        name: normalizedName,
        level: ability.level,
        origin: 'backstory',
        triggerVerbs,
      },
    });

    created.push(created_ability);
  }

  return created;
}

/**
 * Format skill check result for display
 */
export function formatSkillCheckResult(result: SkillCheckResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`--- SKILL CHECK: ${result.abilityName.toUpperCase()} ---`);
  lines.push(result.diceAscii);
  lines.push('');
  lines.push(`Roll: ${result.roll} + ${result.abilityLevel.toFixed(1)} skill = ${result.total.toFixed(1)}`);
  lines.push(`Difficulty: ${result.difficulty}`);
  lines.push('');

  if (result.isNat20) {
    lines.push('*** SPECTACULAR SUCCESS! ***');
  } else if (result.isNat1) {
    lines.push('*** SPECTACULAR FAILURE! ***');
  } else if (result.success) {
    lines.push(`SUCCESS! (margin: +${result.margin.toFixed(1)})`);
  } else {
    lines.push(`FAILED (margin: ${result.margin.toFixed(1)})`);
  }

  if (result.skillGain > 0) {
    lines.push(`Skill improved by +${result.skillGain.toFixed(2)}`);
  }

  lines.push('-----------------------------------');

  return lines.join('\n');
}
