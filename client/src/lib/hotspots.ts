export interface Hotspot {
  id: string;
  position: { x: number; y: number; z: number };
  radius: number;
  label: string;
  contentKey: string;
  color: string;
}

export interface CollisionBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: "experience",
    position: { x: 0, y: 1.0, z: -10 },
    radius: 3.0,
    label: "EXPERIENCE",
    contentKey: "experience",
    color: "#FF2A6D",
  },
  {
    id: "skills",
    position: { x: -7, y: 1.0, z: -4 },
    radius: 3.0,
    label: "SKILLS",
    contentKey: "skills",
    color: "#05D9E8",
  },
  {
    id: "projects",
    position: { x: -5, y: 1.0, z: 8 },
    radius: 3.0,
    label: "PROJECTS",
    contentKey: "projects",
    color: "#FFB86C",
  },
  {
    id: "education",
    position: { x: 7, y: 1.0, z: 4 },
    radius: 3.0,
    label: "EDUCATION",
    contentKey: "education",
    color: "#7B2FBE",
  },
  {
    id: "about",
    position: { x: 3, y: 1.0, z: -6 },
    radius: 3.0,
    label: "ABOUT",
    contentKey: "about",
    color: "#D1F7FF",
  },
];

export const COLLISION_BOXES: CollisionBox[] = [
  {
    min: { x: -10, y: 0, z: -12 },
    max: { x: 10, y: 4, z: -11.7 },
  },
  {
    min: { x: 9.7, y: 0, z: -12 },
    max: { x: 10, y: 4, z: 12 },
  },
  {
    min: { x: -10, y: 0, z: -12 },
    max: { x: -9.7, y: 4, z: 12 },
  },
  {
    min: { x: -10, y: 0, z: 11.7 },
    max: { x: -5, y: 4, z: 12 },
  },
  {
    min: { x: 5, y: 0, z: 11.7 },
    max: { x: 10, y: 4, z: 12 },
  },
  {
    min: { x: 5.4, y: 0, z: -10.7 },
    max: { x: 8.6, y: 1, z: -9.3 },
  },
  {
    min: { x: -7.3, y: 0, z: 2.1 },
    max: { x: -2.7, y: 1.2, z: 3.85 },
  },
  {
    min: { x: -6.1, y: 0, z: 4.9 },
    max: { x: -3.9, y: 0.5, z: 6.1 },
  },
  {
    min: { x: 6.4, y: 0, z: -0.35 },
    max: { x: 9.6, y: 3.2, z: 0.35 },
  },
  {
    min: { x: -8.3, y: 0, z: -10.1 },
    max: { x: -5.7, y: 0.6, z: -7.9 },
  },
  {
    min: { x: 8.5, y: 0, z: -5.3 },
    max: { x: 9.5, y: 2.3, z: -4.7 },
  },
  {
    min: { x: 6.4, y: 0, z: 7.6 },
    max: { x: 9.6, y: 1.0, z: 8.4 },
  },
  {
    min: { x: -1.8, y: 0, z: -11.9 },
    max: { x: 1.8, y: 3.6, z: -11.7 },
  },
  {
    min: { x: 9.2, y: 0, z: -2.5 },
    max: { x: 9.8, y: 2.5, z: -1.5 },
  },
];

export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.7;
