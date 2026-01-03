/**
 * ASCII Map Renderer
 * Renders a grid-based map showing only visited rooms and discovered exits
 * Centers on the player's current position
 */

export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  isVisited: boolean;
  isCurrent: boolean;
  hasPortal?: boolean;
  isVehicle?: boolean;  // Vehicle rooms (boats, cars, etc.)
  exits: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
    up: boolean;
    down: boolean;
  };
}

export interface RenderOptions {
  width: number;  // Max width in characters
  height: number; // Max height in lines
  zoom: number;   // Zoom level (1 = normal, 2 = 2x, etc.)
  currentZ?: number; // Which z-level to show (default: current room's level)
}

// Base room cell dimensions (before zoom)
const BASE_ROOM_WIDTH = 5;  // Width of room box including borders
const BASE_ROOM_HEIGHT = 3; // Height of room box including borders
const BASE_H_GAP = 3;       // Horizontal gap for corridors
const BASE_V_GAP = 1;       // Vertical gap for corridors

/**
 * Render ASCII map of rooms - only shows visited rooms and discovered exits
 */
export function renderAsciiMap(rooms: MapRoom[], options: RenderOptions): string[] {
  if (rooms.length === 0) {
    return ['No map data'];
  }

  // Apply zoom (scale dimensions)
  const zoom = Math.max(0.5, Math.min(3, options.zoom || 1));
  const ROOM_WIDTH = Math.round(BASE_ROOM_WIDTH * zoom);
  const ROOM_HEIGHT = Math.max(3, Math.round(BASE_ROOM_HEIGHT * zoom));
  const H_GAP = Math.max(1, Math.round(BASE_H_GAP * zoom));
  const V_GAP = Math.max(1, Math.round(BASE_V_GAP * zoom));

  // Find current room to determine z-level
  const currentRoom = rooms.find(r => r.isCurrent);
  const targetZ = options.currentZ ?? currentRoom?.z ?? 0;

  // Filter to current z-level
  const mainRooms = rooms.filter(r => r.z === targetZ);
  const hasOtherLevels = rooms.some(r => r.z !== targetZ);

  if (mainRooms.length === 0) {
    return ['[Map unavailable]'];
  }

  // Find bounds of visited rooms
  const minX = Math.min(...mainRooms.map(r => r.x));
  const maxX = Math.max(...mainRooms.map(r => r.x));
  const minY = Math.min(...mainRooms.map(r => r.y));
  const maxY = Math.max(...mainRooms.map(r => r.y));

  // Calculate grid size
  const gridWidth = maxX - minX + 1;
  const gridHeight = maxY - minY + 1;

  // Character dimensions per cell
  const cellWidth = ROOM_WIDTH + H_GAP;
  const cellHeight = ROOM_HEIGHT + V_GAP;

  // Total canvas size (add padding)
  const canvasWidth = gridWidth * cellWidth + 2;
  const canvasHeight = gridHeight * cellHeight + 2;

  // Create canvas (2D array of characters)
  const canvas: string[][] = [];
  for (let y = 0; y < canvasHeight; y++) {
    canvas.push(new Array(canvasWidth).fill(' '));
  }

  // Build room lookup by coordinates
  const roomAt = new Map<string, MapRoom>();
  for (const room of mainRooms) {
    roomAt.set(`${room.x},${room.y}`, room);
  }

  // Draw each room (only visited rooms are in the list)
  for (const room of mainRooms) {
    const gridX = room.x - minX;
    const gridY = maxY - room.y; // Invert Y so north is up

    const startX = gridX * cellWidth + 1;
    const startY = gridY * cellHeight + 1;

    drawRoom(canvas, startX, startY, room, ROOM_WIDTH, ROOM_HEIGHT);

    // Draw connections only if the exit is visible (not hidden or discovered)
    if (room.exits.east) {
      const eastRoom = roomAt.get(`${room.x + 1},${room.y}`);
      // Only draw corridor if the east room exists in our visited rooms
      if (eastRoom) {
        drawHorizontalCorridor(canvas, startX + ROOM_WIDTH, startY + Math.floor(ROOM_HEIGHT / 2), H_GAP);
      }
    }
    if (room.exits.south) {
      const southRoom = roomAt.get(`${room.x},${room.y - 1}`);
      // Only draw corridor if the south room exists in our visited rooms
      if (southRoom) {
        drawVerticalCorridor(canvas, startX + Math.floor(ROOM_WIDTH / 2), startY + ROOM_HEIGHT, V_GAP);
      }
    }
  }

  // Convert canvas to strings
  let lines = canvas.map(row => row.join(''));

  // Trim empty lines from top and bottom
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Center on current room and fit to viewport
  const viewportWidth = options.width;
  const viewportHeight = hasOtherLevels ? options.height - 1 : options.height;

  if (currentRoom) {
    const currentGridX = currentRoom.x - minX;
    const currentGridY = maxY - currentRoom.y;
    const currentCanvasX = currentGridX * cellWidth + 1 + Math.floor(ROOM_WIDTH / 2);
    const currentCanvasY = currentGridY * cellHeight + 1 + Math.floor(ROOM_HEIGHT / 2);

    // Center viewport on player
    if (lines.length > viewportHeight) {
      const startLine = Math.max(0, Math.min(
        currentCanvasY - Math.floor(viewportHeight / 2),
        lines.length - viewportHeight
      ));
      lines = lines.slice(startLine, startLine + viewportHeight);
    }

    // Center horizontally
    const maxLineWidth = Math.max(...lines.map(l => l.length));
    if (maxLineWidth > viewportWidth) {
      const startChar = Math.max(0, Math.min(
        currentCanvasX - Math.floor(viewportWidth / 2),
        maxLineWidth - viewportWidth
      ));
      lines = lines.map(line => {
        const padded = line.padEnd(maxLineWidth);
        return padded.substring(startChar, startChar + viewportWidth);
      });
    }
  } else {
    // No current room, just trim to fit
    if (lines.length > viewportHeight) {
      lines = lines.slice(0, viewportHeight);
    }
    lines = lines.map(line => line.substring(0, viewportWidth));
  }

  // Add level indicator if there are other levels
  if (hasOtherLevels) {
    const hasUp = rooms.some(r => r.z > targetZ);
    const hasDown = rooms.some(r => r.z < targetZ);
    const levelIndicator = `[Z:${targetZ}${hasUp ? ' ^' : ''}${hasDown ? ' v' : ''}]`;
    lines.push(levelIndicator);
  }

  return lines;
}

/**
 * Draw a room box at the given position
 */
function drawRoom(
  canvas: string[][],
  x: number,
  y: number,
  room: MapRoom,
  width: number,
  height: number
): void {
  const isCurrentRoom = room.isCurrent;
  const hasPortal = room.hasPortal;
  const isVehicle = room.isVehicle;

  // Draw border
  // Top border
  setChar(canvas, x, y, '+');
  for (let i = 1; i < width - 1; i++) {
    setChar(canvas, x + i, y, '-');
  }
  setChar(canvas, x + width - 1, y, '+');

  // Middle rows
  for (let row = 1; row < height - 1; row++) {
    setChar(canvas, x, y + row, '|');
    for (let col = 1; col < width - 1; col++) {
      setChar(canvas, x + col, y + row, ' ');
    }
    setChar(canvas, x + width - 1, y + row, '|');
  }

  // Bottom border
  setChar(canvas, x, y + height - 1, '+');
  for (let i = 1; i < width - 1; i++) {
    setChar(canvas, x + i, y + height - 1, '-');
  }
  setChar(canvas, x + width - 1, y + height - 1, '+');

  // Room indicator in center
  const centerX = x + Math.floor(width / 2);
  const centerY = y + Math.floor(height / 2);

  if (isCurrentRoom) {
    // @ for current room (even if it's a vehicle)
    setChar(canvas, centerX, centerY, '@');
  } else if (isVehicle) {
    // ~ for vehicles (boats, cars, etc.)
    setChar(canvas, centerX, centerY, '~');
  } else if (hasPortal) {
    setChar(canvas, centerX, centerY, '*');
  } else {
    setChar(canvas, centerX, centerY, '.');
  }

  // Up/Down indicators
  if (room.exits.up) {
    setChar(canvas, centerX + 1, centerY, '^');
  }
  if (room.exits.down) {
    if (!isCurrentRoom) {
      setChar(canvas, centerX - 1, centerY, 'v');
    }
  }
}

/**
 * Draw horizontal corridor (east-west connection)
 */
function drawHorizontalCorridor(canvas: string[][], x: number, y: number, length: number): void {
  for (let i = 0; i < length; i++) {
    setChar(canvas, x + i, y, '-');
  }
}

/**
 * Draw vertical corridor (north-south connection)
 */
function drawVerticalCorridor(canvas: string[][], x: number, y: number, length: number): void {
  for (let i = 0; i < length; i++) {
    setChar(canvas, x, y + i, '|');
  }
}

/**
 * Safely set a character on the canvas
 */
function setChar(canvas: string[][], x: number, y: number, char: string): void {
  if (y >= 0 && y < canvas.length && x >= 0 && x < canvas[y].length) {
    canvas[y][x] = char;
  }
}

/**
 * Get a legend for map symbols
 */
export function getMapLegend(): string[] {
  return [
    '@ You',
    '. Visited',
    '* Portal',
    '~ Vehicle',
  ];
}
