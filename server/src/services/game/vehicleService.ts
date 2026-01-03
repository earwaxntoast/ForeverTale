/**
 * Vehicle Service
 * Handles vehicle mechanics: boarding, disembarking, and traveling
 *
 * Vehicles are rooms that can "dock" at other rooms and move between locations.
 * Players board vehicles to enter the vehicle room, then launch to travel.
 */

import { PrismaClient, Room } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../../utils/logger.js';

const prisma = new PrismaClient();
const anthropic = new Anthropic();
const FAST_MODEL = 'claude-3-5-haiku-20241022';

export interface VehicleInfo {
  id: string;
  name: string;
  vehicleType: string;
  dockedAtRoomId: string | null;
  dockedAtRoomName: string | null;
  knownDestinations: string[];  // Room IDs
  boardingKeywords: string[];
}

export interface BoardingResult {
  success: boolean;
  vehicleRoom: Room | null;
  narrative: string;
}

export interface LaunchResult {
  success: boolean;
  destinationRoom: Room | null;
  narrative: string;
  menuOptions?: Array<{ id: string; name: string }>;  // For multiple matches
}

/**
 * Find vehicles docked at the current room
 */
export async function getDockedVehicles(roomId: string): Promise<VehicleInfo[]> {
  const vehicles = await prisma.room.findMany({
    where: {
      isVehicle: true,
      dockedAtRoomId: roomId,
    },
    include: {
      dockedAt: {
        select: { name: true },
      },
    },
  });

  return vehicles.map(v => ({
    id: v.id,
    name: v.name,
    vehicleType: v.vehicleType || 'unknown',
    dockedAtRoomId: v.dockedAtRoomId,
    dockedAtRoomName: v.dockedAt?.name || null,
    knownDestinations: (v.knownDestinations as string[]) || [],
    boardingKeywords: (v.boardingKeywords as string[]) || [],
  }));
}

/**
 * Check if player is currently in a vehicle
 */
export async function isPlayerInVehicle(storyId: string): Promise<{
  inVehicle: boolean;
  vehicle: Room | null;
  dockedAt: Room | null;
}> {
  const playerState = await prisma.playerState.findUnique({
    where: { storyId },
    select: { currentRoomId: true },
  });

  if (!playerState) {
    return { inVehicle: false, vehicle: null, dockedAt: null };
  }

  const currentRoom = await prisma.room.findUnique({
    where: { id: playerState.currentRoomId },
    include: {
      dockedAt: true,
    },
  });

  if (!currentRoom?.isVehicle) {
    return { inVehicle: false, vehicle: null, dockedAt: null };
  }

  return {
    inVehicle: true,
    vehicle: currentRoom,
    dockedAt: currentRoom.dockedAt,
  };
}

/**
 * Board a vehicle - move player into the vehicle room
 */
export async function boardVehicle(
  storyId: string,
  currentRoomId: string,
  vehicleKeyword: string
): Promise<BoardingResult> {
  // Find vehicles docked at current room
  const vehicles = await getDockedVehicles(currentRoomId);

  if (vehicles.length === 0) {
    return {
      success: false,
      vehicleRoom: null,
      narrative: "There's no vehicle here to board.",
    };
  }

  // Match vehicle by keyword
  const keyword = vehicleKeyword.toLowerCase();
  const matchedVehicle = vehicles.find(v =>
    v.name.toLowerCase().includes(keyword) ||
    v.boardingKeywords.some(k => k.toLowerCase().includes(keyword)) ||
    keyword.includes(v.vehicleType.toLowerCase())
  );

  if (!matchedVehicle) {
    // If only one vehicle, board it regardless of keyword
    if (vehicles.length === 1) {
      const vehicle = vehicles[0];
      const vehicleRoom = await prisma.room.findUnique({
        where: { id: vehicle.id },
      });

      if (vehicleRoom) {
        await prisma.playerState.update({
          where: { storyId },
          data: {
            currentRoomId: vehicleRoom.id,
            turnCount: { increment: 1 },
          },
        });

        return {
          success: true,
          vehicleRoom,
          narrative: `You board the ${vehicleRoom.name}.`,
        };
      }
    }

    return {
      success: false,
      vehicleRoom: null,
      narrative: `You don't see a "${vehicleKeyword}" here. Available: ${vehicles.map(v => v.name).join(', ')}.`,
    };
  }

  // Board the matched vehicle
  const vehicleRoom = await prisma.room.findUnique({
    where: { id: matchedVehicle.id },
  });

  if (!vehicleRoom) {
    return {
      success: false,
      vehicleRoom: null,
      narrative: "The vehicle seems to have vanished.",
    };
  }

  // Update player location
  await prisma.playerState.update({
    where: { storyId },
    data: {
      currentRoomId: vehicleRoom.id,
      turnCount: { increment: 1 },
    },
  });

  // Mark vehicle as visited
  await prisma.room.update({
    where: { id: vehicleRoom.id },
    data: {
      firstVisitedAt: vehicleRoom.firstVisitedAt || new Date(),
      visitCount: { increment: 1 },
    },
  });

  return {
    success: true,
    vehicleRoom,
    narrative: `You climb aboard the ${vehicleRoom.name}.`,
  };
}

/**
 * Disembark from a vehicle - move player to the docked location
 */
export async function disembarkVehicle(storyId: string): Promise<{
  success: boolean;
  destinationRoom: Room | null;
  narrative: string;
}> {
  const { inVehicle, vehicle, dockedAt } = await isPlayerInVehicle(storyId);

  if (!inVehicle || !vehicle) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "You're not in a vehicle.",
    };
  }

  if (!dockedAt) {
    return {
      success: false,
      destinationRoom: null,
      narrative: `The ${vehicle.name} isn't docked anywhere. You'll need to travel somewhere first.`,
    };
  }

  // Move player to the docked location
  await prisma.playerState.update({
    where: { storyId },
    data: {
      currentRoomId: dockedAt.id,
      turnCount: { increment: 1 },
    },
  });

  return {
    success: true,
    destinationRoom: dockedAt,
    narrative: `You disembark from the ${vehicle.name}.`,
  };
}

/**
 * Launch/travel to a destination
 * Supports:
 * - Single match: go directly
 * - Multiple matches: return menu
 * - No match: generate new destination dynamically
 */
export async function launchVehicle(
  storyId: string,
  destinationQuery: string
): Promise<LaunchResult> {
  const { inVehicle, vehicle } = await isPlayerInVehicle(storyId);

  if (!inVehicle || !vehicle) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "You need to be in a vehicle to travel.",
    };
  }

  const knownDestinations = (vehicle.knownDestinations as string[]) || [];

  // If no destination specified, show available destinations
  if (!destinationQuery || destinationQuery.trim() === '') {
    if (knownDestinations.length === 0) {
      return {
        success: false,
        destinationRoom: null,
        narrative: "You don't know of any destinations yet. Try exploring or looking at maps.",
      };
    }

    const destinations = await prisma.room.findMany({
      where: { id: { in: knownDestinations } },
      select: { id: true, name: true },
    });

    return {
      success: false,
      destinationRoom: null,
      narrative: "Where would you like to go?",
      menuOptions: destinations,
    };
  }

  // Search for matching destinations
  const matches = await findDestinationMatches(
    storyId,
    knownDestinations,
    destinationQuery
  );

  if (matches.length === 1) {
    // Single match - travel there
    return await travelToDestination(storyId, vehicle, matches[0]);
  }

  if (matches.length > 1) {
    // Multiple matches - return menu
    return {
      success: false,
      destinationRoom: null,
      narrative: `Multiple destinations match "${destinationQuery}". Which one?`,
      menuOptions: matches.map(m => ({ id: m.id, name: m.name })),
    };
  }

  // No match - try to generate a new destination
  return await generateAndTravelToDestination(storyId, vehicle, destinationQuery);
}

/**
 * Travel to a specific destination by ID
 */
export async function travelToDestinationById(
  storyId: string,
  destinationId: string
): Promise<LaunchResult> {
  const { inVehicle, vehicle } = await isPlayerInVehicle(storyId);

  if (!inVehicle || !vehicle) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "You need to be in a vehicle to travel.",
    };
  }

  const destination = await prisma.room.findUnique({
    where: { id: destinationId },
  });

  if (!destination) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "That destination doesn't exist.",
    };
  }

  return await travelToDestination(storyId, vehicle, destination);
}

/**
 * Internal: Perform the actual travel
 */
async function travelToDestination(
  storyId: string,
  vehicle: Room,
  destination: Room
): Promise<LaunchResult> {
  // Update vehicle docking
  await prisma.room.update({
    where: { id: vehicle.id },
    data: {
      previousDockedAtId: vehicle.dockedAtRoomId,
      dockedAtRoomId: destination.id,
    },
  });

  // Increment player turn count
  await prisma.playerState.update({
    where: { storyId },
    data: {
      turnCount: { increment: 1 },
    },
  });

  // Add destination to known destinations if not already there
  const knownDestinations = (vehicle.knownDestinations as string[]) || [];
  if (!knownDestinations.includes(destination.id)) {
    await prisma.room.update({
      where: { id: vehicle.id },
      data: {
        knownDestinations: [...knownDestinations, destination.id],
      },
    });
  }

  return {
    success: true,
    destinationRoom: destination,
    narrative: `The ${vehicle.name} travels to ${destination.name}.`,
  };
}

/**
 * Internal: Find destinations matching a query
 */
async function findDestinationMatches(
  storyId: string,
  knownDestinationIds: string[],
  query: string
): Promise<Room[]> {
  if (knownDestinationIds.length === 0) {
    return [];
  }

  const destinations = await prisma.room.findMany({
    where: { id: { in: knownDestinationIds } },
  });

  const queryLower = query.toLowerCase();

  // Exact name match
  const exactMatch = destinations.filter(d =>
    d.name.toLowerCase() === queryLower
  );
  if (exactMatch.length > 0) return exactMatch;

  // Partial name match
  const partialMatch = destinations.filter(d =>
    d.name.toLowerCase().includes(queryLower)
  );
  if (partialMatch.length > 0) return partialMatch;

  // Word match
  const words = queryLower.split(/\s+/);
  const wordMatch = destinations.filter(d => {
    const nameLower = d.name.toLowerCase();
    return words.some(word => nameLower.includes(word));
  });

  return wordMatch;
}

/**
 * Internal: Generate a new destination dynamically
 * Used when player requests a destination that doesn't exist yet
 */
async function generateAndTravelToDestination(
  storyId: string,
  vehicle: Room,
  destinationQuery: string
): Promise<LaunchResult> {
  // Get story context
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storyFacts: { where: { importance: { gte: 7 } }, take: 5 },
    },
  });

  if (!story) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "Cannot generate destination - story not found.",
    };
  }

  const vehicleType = vehicle.vehicleType || 'generic';

  // Ask AI if this destination makes sense
  const prompt = `You are helping generate a new destination in a text adventure.

STORY: ${story.title}
GENRE: ${(story.genreTags as string[]).join(', ')}
VEHICLE TYPE: ${vehicleType}

The player is in "${vehicle.name}" (a ${vehicleType} vehicle) and wants to go to: "${destinationQuery}"

Should this destination be reachable by this vehicle type?
- Water vehicles can reach: ports, docks, islands, coastal areas, rivers
- Land vehicles can reach: towns, cities, roads, paths
- Air vehicles can reach: mountains, distant locations, anywhere open
- Magical vehicles: anywhere thematically appropriate

If YES, generate a suitable destination. If NO, explain why.

Respond in JSON:
{
  "reachable": true/false,
  "reason": "Why or why not",
  "destination": {
    "name": "Full location name",
    "briefDescription": "One sentence",
    "fullDescription": "2-3 paragraphs describing the location"
  } // or null if not reachable
}`;

  try {
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const jsonMatch = textContent?.text?.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        success: false,
        destinationRoom: null,
        narrative: `You're not sure how to get to "${destinationQuery}" from here.`,
      };
    }

    const result = JSON.parse(jsonMatch[0]) as {
      reachable: boolean;
      reason: string;
      destination: {
        name: string;
        briefDescription: string;
        fullDescription: string;
      } | null;
    };

    if (!result.reachable || !result.destination) {
      return {
        success: false,
        destinationRoom: null,
        narrative: result.reason || `You can't reach "${destinationQuery}" with this vehicle.`,
      };
    }

    // Find a suitable z=0 coordinate for the new location
    // Get the max coordinates to place it nearby
    const existingRooms = await prisma.room.findMany({
      where: { storyId, z: 0 },
      select: { x: true, y: true },
    });

    const maxX = Math.max(0, ...existingRooms.map(r => r.x)) + 5;
    const maxY = Math.max(0, ...existingRooms.map(r => r.y)) + 5;

    // Create the new destination room
    const newRoom = await prisma.room.create({
      data: {
        storyId,
        name: result.destination.name,
        description: result.destination.fullDescription,
        shortDescription: result.destination.briefDescription,
        x: maxX,
        y: maxY,
        z: 0,
        isGenerated: true,
        hiddenExits: [],
        discoveredExits: [],
      },
    });

    // Travel to the new destination
    return await travelToDestination(storyId, vehicle, newRoom);

  } catch (error) {
    logger.error('VEHICLE_SERVICE', `Failed to generate destination: ${error}`);
    return {
      success: false,
      destinationRoom: null,
      narrative: `You're not sure how to reach "${destinationQuery}".`,
    };
  }
}

/**
 * "Go back" - return to previous docked location
 */
export async function goBack(storyId: string): Promise<LaunchResult> {
  const { inVehicle, vehicle } = await isPlayerInVehicle(storyId);

  if (!inVehicle || !vehicle) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "You need to be in a vehicle to go back.",
    };
  }

  if (!vehicle.previousDockedAtId) {
    return {
      success: false,
      destinationRoom: null,
      narrative: `The ${vehicle.name} hasn't been anywhere else yet.`,
    };
  }

  const previousLocation = await prisma.room.findUnique({
    where: { id: vehicle.previousDockedAtId },
  });

  if (!previousLocation) {
    return {
      success: false,
      destinationRoom: null,
      narrative: "The previous location no longer exists.",
    };
  }

  return await travelToDestination(storyId, vehicle, previousLocation);
}
