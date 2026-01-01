/**
 * ASCII Map Renderer
 * Renders a grid-based map of rooms with connections
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
  exits: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
    up: boolean;
    down: boolean;
  };
}

interface RenderOptions {
  width: number;  // Max width in characters
  height: number; // Max height in lines
  currentZ?: number; // Which z-level to show (default: current room's level)
}

// Room cell dimensions
const ROOM_WIDTH = 5;  // Width of room box including borders
const ROOM_HEIGHT = 3; // Height of room box including borders
const H_GAP = 3;       // Horizontal gap for corridors
const V_GAP = 1;       // Vertical gap for corridors

/**
 * Render ASCII map of rooms
 */
export function renderAsciiMap(rooms: MapRoom[], options: RenderOptions): string[] {
  if (rooms.length === 0) {
    return ['No map data'];
  }

  // Find current room to determine z-level
  const currentRoom = rooms.find(r => r.isCurrent);
  const targetZ = options.currentZ ?? currentRoom?.z ?? 0;

  // Filter to current z-level (main map) and separate portal destinations
  const mainRooms = rooms.filter(r => r.z === targetZ);
  const hasOtherLevels = rooms.some(r => r.z !== targetZ);

  if (mainRooms.length === 0) {
    return ['[Map unavailable]'];
  }

  // Find bounds
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

  // Total canvas size
  const canvasWidth = gridWidth * cellWidth + 1;
  const canvasHeight = gridHeight * cellHeight + 1;

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

  // Draw each room
  for (const room of mainRooms) {
    const gridX = room.x - minX;
    const gridY = maxY - room.y; // Invert Y so north is up

    const startX = gridX * cellWidth;
    const startY = gridY * cellHeight;

    drawRoom(canvas, startX, startY, room);

    // Draw connections
    if (room.exits.east) {
      drawHorizontalCorridor(canvas, startX + ROOM_WIDTH, startY + 1);
    }
    if (room.exits.south) {
      drawVerticalCorridor(canvas, startX + 2, startY + ROOM_HEIGHT);
    }
  }

  // Convert canvas to strings and trim to fit
  let lines = canvas.map(row => row.join(''));

  // Trim empty lines from top and bottom
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Trim to max dimensions
  if (lines.length > options.height) {
    // Center on current room if possible
    const currentGridY = currentRoom ? maxY - currentRoom.y : 0;
    const currentCanvasY = currentGridY * cellHeight + 1;
    const startLine = Math.max(0, currentCanvasY - Math.floor(options.height / 2));
    lines = lines.slice(startLine, startLine + options.height);
  }

  // Trim width
  lines = lines.map(line => {
    if (line.length > options.width) {
      // Center on current room if possible
      const currentGridX = currentRoom ? currentRoom.x - minX : 0;
      const currentCanvasX = currentGridX * cellWidth + 2;
      const startChar = Math.max(0, currentCanvasX - Math.floor(options.width / 2));
      return line.substring(startChar, startChar + options.width);
    }
    return line;
  });

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
function drawRoom(canvas: string[][], x: number, y: number, room: MapRoom): void {
  // Room appearance based on state
  const isCurrentRoom = room.isCurrent;
  const isVisited = room.isVisited;
  const hasPortal = room.hasPortal;

  // Top border
  setChar(canvas, x, y, isCurrentRoom ? '+' : '+');
  setChar(canvas, x + 1, y, '-');
  setChar(canvas, x + 2, y, '-');
  setChar(canvas, x + 3, y, '-');
  setChar(canvas, x + 4, y, isCurrentRoom ? '+' : '+');

  // Middle row (with room indicator)
  setChar(canvas, x, y + 1, '|');
  if (isCurrentRoom) {
    setChar(canvas, x + 1, y + 1, '@');
    setChar(canvas, x + 2, y + 1, ' ');
    setChar(canvas, x + 3, y + 1, ' ');
  } else if (hasPortal) {
    setChar(canvas, x + 1, y + 1, ' ');
    setChar(canvas, x + 2, y + 1, '*');
    setChar(canvas, x + 3, y + 1, ' ');
  } else if (isVisited) {
    setChar(canvas, x + 1, y + 1, ' ');
    setChar(canvas, x + 2, y + 1, '.');
    setChar(canvas, x + 3, y + 1, ' ');
  } else {
    setChar(canvas, x + 1, y + 1, ' ');
    setChar(canvas, x + 2, y + 1, '?');
    setChar(canvas, x + 3, y + 1, ' ');
  }
  setChar(canvas, x + 4, y + 1, '|');

  // Up/Down indicators in corners if exits exist
  if (room.exits.up) {
    setChar(canvas, x + 3, y + 1, '^');
  }
  if (room.exits.down) {
    setChar(canvas, x + 1, y + 1, room.isCurrent ? '@' : 'v');
  }

  // Bottom border
  setChar(canvas, x, y + 2, '+');
  setChar(canvas, x + 1, y + 2, '-');
  setChar(canvas, x + 2, y + 2, '-');
  setChar(canvas, x + 3, y + 2, '-');
  setChar(canvas, x + 4, y + 2, '+');
}

/**
 * Draw horizontal corridor (east-west connection)
 */
function drawHorizontalCorridor(canvas: string[][], x: number, y: number): void {
  for (let i = 0; i < H_GAP; i++) {
    setChar(canvas, x + i, y, '-');
  }
}

/**
 * Draw vertical corridor (north-south connection)
 */
function drawVerticalCorridor(canvas: string[][], x: number, y: number): void {
  for (let i = 0; i < V_GAP; i++) {
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
    '@ = You',
    '. = Visited',
    '? = Unknown',
    '* = Portal',
  ];
}
