"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { GraphEdge, GraphNode } from "@/lib/path";

// Locked = grey (not yet reachable), white = newly unlocked, red = in progress, blue = mastered.
export const STATE_COLOR: Record<GraphNode["state"], number> = {
  locked: 0x9aa3b2,
  learn: 0xf4f6fb,
  practice: 0xe0453a,
  mastered: 0x3d7bf0,
};

const EDGE_COLOR_LIT = 0x2e8b6f;
const EDGE_COLOR_DIM = 0x3a4150;

export const PLANET_COLOR_UNTOUCHED = 0x5b6478;
export const PLANET_COLOR_HIT = 0xe09a32;
export const PLANET_COLOR_CRITICAL = 0xff5a3c;

const ROGUE_PLANET_ID = "__rogue__";
const ROGUE_DIM_COLOR = 0x3a3550;
const ROGUE_BRIGHT_COLOR = 0xf3d98b;

const RETRIEVABILITY_EASE_PER_SEC = 2.2; // higher = faster fade/re-glow response

/** Stable pseudo-random in [0,1) from a string id, so layout jitter is deterministic across renders. */
function hash01(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 10000) / 10000;
}

/** Longest-path depth from any root (no-prerequisite) concept, used as radial distance along the spiral. */
function computeDepths(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const preds = new Map<string, string[]>();
  for (const n of nodes) preds.set(n.id, []);
  for (const e of edges) preds.get(e.target)?.push(e.source);

  const depth = new Map<string, number>();
  function dfs(id: string, visiting: Set<string>): number {
    if (depth.has(id)) return depth.get(id) as number;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const ps = preds.get(id) ?? [];
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map((p) => dfs(p, visiting)));
    depth.set(id, d);
    return d;
  }
  for (const n of nodes) dfs(n.id, new Set());
  return depth;
}

/** Position for each concept along a 2-armed logarithmic spiral, like a Milky Way viewed from above. */
function computeGalaxyPositions(nodes: GraphNode[], edges: GraphEdge[]): Map<string, THREE.Vector3> {
  const depth = computeDepths(nodes, edges);
  const maxDepth = Math.max(1, ...Array.from(depth.values()));
  const positions = new Map<string, THREE.Vector3>();

  for (const n of nodes) {
    const t = (depth.get(n.id) ?? 0) / maxDepth;
    const jitter = hash01(n.id);
    const arm = hash01(n.id + "arm") < 0.5 ? 0 : 1;
    const radius = 28 + t * 130 + jitter * 14;
    const angle = t * Math.PI * 2.4 + arm * Math.PI + jitter * 0.6;
    const y = (hash01(n.id + "y") - 0.5) * 10 * (1 - t * 0.4);
    positions.set(n.id, new THREE.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle)));
  }
  return positions;
}

export function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const fontSize = 40;
  ctx.font = `${fontSize}px sans-serif`;
  const width = Math.ceil(ctx.measureText(text).width) + 24;
  const height = fontSize + 20;
  canvas.width = width;
  canvas.height = height;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#EAF0FF";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  ctx.fillText(text, 12, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / 14, height / 14, 1);
  return sprite;
}

/** A soft round radial-gradient sprite, so background stars render as glowing points instead of hard squares. */
export function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function makeStarfield(
  count: number,
  radiusMin: number,
  radiusMax: number,
  size: number,
  color: number,
  glowTexture: THREE.Texture
): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.35;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    map: glowTexture,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

const GALAXY_PALETTE = [0xffffff, 0xcfe0ff, 0xf5dfab, 0xffe9c2];

/** Standard-normal sample (Box-Muller) — jitter drawn from this clusters near 0 with a soft tail,
 * instead of the hard-edged band a uniform random spread produces, so arms read as sharp ribbons. */
function gaussianJitter(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Thousands of small glowing points laid along logarithmic spiral arms — the dense Milky-Way
 * "dust" backdrop the concept stars sit inside, rather than a flat starfield behind them. */
function makeGalaxySpiralArms(
  count: number,
  armCount: number,
  radiusMax: number,
  size: number,
  opacity: number,
  glowTexture: THREE.Texture
): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = GALAXY_PALETTE.map((c) => new THREE.Color(c));

  for (let i = 0; i < count; i++) {
    const arm = Math.floor(Math.random() * armCount);
    const t = Math.random();
    const radius = 12 + t * radiusMax;
    const angle = t * Math.PI * 5.2 + (arm * Math.PI * 2) / armCount; // tighter winding, more coiled
    const tangent = angle + Math.PI / 2;
    // Jitter mostly across the arm's width (perpendicular to its direction of travel), with a
    // touch of along-arm spread — narrow near the core, only loosening a little toward the rim.
    const across = gaussianJitter() * (1.1 + t * 3.5);
    const along = gaussianJitter() * (0.6 + t * 1.5);
    const rx = radius * Math.cos(angle) + Math.cos(tangent) * across + Math.cos(angle) * along;
    const rz = radius * Math.sin(angle) + Math.sin(tangent) * across + Math.sin(angle) * along;
    const ry = gaussianJitter() * (1.4 + t * 1.2);
    positions[i * 3] = rx;
    positions[i * 3 + 1] = ry;
    positions[i * 3 + 2] = rz;

    const base = palette[Math.floor(Math.random() * palette.length)];
    const brightness = (1 - t * 0.5) * (0.6 + Math.random() * 0.4); // denser/brighter near the core
    colors[i * 3] = base.r * brightness;
    colors[i * 3 + 1] = base.g * brightness;
    colors[i * 3 + 2] = base.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: glowTexture,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

/** The bright glowing galactic core at the centre of the spiral. */
function makeGalaxyCore(glowTexture: THREE.Texture): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xfff2d9,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(48, 48, 1);
  return sprite;
}

interface StarEntry {
  conceptId: string;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  displayR: number; // eased retrievability, drives glow
  prevState: GraphNode["state"];
  unlockFlashT: number; // counts down 1 -> 0 after a locked->unlocked transition; drives the flourish
  planetGroup: THREE.Group;
  planets: {
    id: string;
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    radius: number;
    speed: number;
    angle: number;
  }[];
}

export function planetColorFor(hits: number): number {
  return hits >= 3 ? PLANET_COLOR_CRITICAL : hits >= 1 ? PLANET_COLOR_HIT : PLANET_COLOR_UNTOUCHED;
}

export interface PulseEdge {
  source: string;
  target: string;
  nonce: number;
}

interface ConceptGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  /** Decay Storm: while set, the camera flies to and holds on this concept's star and the rest
   * of the galaxy visibly cools (dimmer bloom, desaturated stars). Null/undefined = normal. */
  stormConceptId?: string | null;
  /** Decay Storm: bump the nonce to fire a travelling light pulse along one prerequisite edge. */
  pulseEdge?: PulseEdge | null;
  /** Teach-Back: while set, this concept's star grows an extra dim "rogue planet" (the protégé)
   * that brightens as rogueBrightness rises from 0 (just arrived, barely lit) to 1 (it gets it). */
  rogueConceptId?: string | null;
  rogueBrightness?: number;
}

export default function ConceptGraph({
  nodes,
  edges,
  onNodeClick,
  stormConceptId = null,
  pulseEdge = null,
  rogueConceptId = null,
  rogueBrightness = 0,
}: ConceptGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const stormConceptIdRef = useRef(stormConceptId);
  stormConceptIdRef.current = stormConceptId;
  const pulseEdgeRef = useRef(pulseEdge);
  pulseEdgeRef.current = pulseEdge;
  const rogueConceptIdRef = useRef(rogueConceptId);
  rogueConceptIdRef.current = rogueConceptId;
  const rogueBrightnessRef = useRef(rogueBrightness);
  rogueBrightnessRef.current = rogueBrightness;

  // One-time scene setup; node/edge *data* changes are read live from the refs in the animation loop.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.0016);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 4000);
    camera.position.set(0, 140, 260);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x05060a, 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 40;
    controls.maxDistance = 900;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x1b2536, 0.35));

    const glowTexture = makeGlowTexture();
    const farStars = makeStarfield(5000, 800, 2600, 3.2, 0xffffff, glowTexture);
    const nearStars = makeStarfield(1200, 300, 900, 2.2, 0xbfd3ff, glowTexture);
    scene.add(farStars, nearStars);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Higher threshold so dim (decayed/locked) stars keep their true state color instead of
    // blowing out to white — only genuinely bright, well-retained stars actually bloom.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.9,
      0.6,
      0.32
    );
    composer.addPass(bloom);

    const galaxyGroup = new THREE.Group();
    scene.add(galaxyGroup);

    // The dense Milky-Way spiral itself — fine dust plus a sparser layer of bigger bright
    // clumps, and a glowing core — all riding inside galaxyGroup so they rotate with the stars.
    const galaxyDust = makeGalaxySpiralArms(9000, 3, 230, 2.6, 0.85, glowTexture);
    const galaxyClumps = makeGalaxySpiralArms(500, 3, 210, 7, 0.9, glowTexture);
    const galaxyCore = makeGalaxyCore(glowTexture);
    galaxyGroup.add(galaxyDust, galaxyClumps, galaxyCore);

    const edgeLines: { line: THREE.Line; edge: GraphEdge }[] = [];
    const stars = new Map<string, StarEntry>();
    let builtSignature = "";

    // Shared unit geometry, scaled per-instance — sizes (mastery/hits) are updated live in the
    // animation loop via mesh.scale, so this never needs to be recreated on rebuild.
    const unitStarGeometry = new THREE.SphereGeometry(1, 24, 24);
    const unitPlanetGeometry = new THREE.SphereGeometry(1, 12, 12);
    const unitPulseGeometry = new THREE.SphereGeometry(1, 10, 10);

    // Decay Storm: travelling light pulses fired along an edge; each owns its own fading material.
    const PULSE_SECONDS = 0.8;
    const pulses: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
    let lastPulseNonce = -1;
    let stormDim = 0; // 0 = normal galaxy, 1 = fully cooled/dimmed by an active storm
    const STORM_COLD = new THREE.Color(0x232a3a);

    function disposeStars() {
      for (const s of stars.values()) {
        galaxyGroup.remove(s.mesh, s.light, s.planetGroup);
        s.material.dispose();
        for (const p of s.planets) {
          p.material.dispose();
        }
      }
      stars.clear();
      for (const { line } of edgeLines) {
        galaxyGroup.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      edgeLines.length = 0;
    }

    function build(currentNodes: GraphNode[], currentEdges: GraphEdge[]) {
      disposeStars();
      const positions = computeGalaxyPositions(currentNodes, currentEdges);

      for (const n of currentNodes) {
        const pos = positions.get(n.id) ?? new THREE.Vector3();
        const color = STATE_COLOR[n.state];
        const starRadius = 3 + n.mastery * 3.2;

        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.08,
          roughness: 0.4,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(unitStarGeometry, material);
        mesh.scale.setScalar(starRadius);
        mesh.position.copy(pos);
        mesh.userData.conceptId = n.id;
        galaxyGroup.add(mesh);

        const light = new THREE.PointLight(color, 0.6, 90, 2);
        light.position.copy(pos);
        galaxyGroup.add(light);

        const label = makeLabelSprite(n.name);
        label.position.set(pos.x, pos.y + starRadius + 5, pos.z);
        galaxyGroup.add(label);

        const planetGroup = new THREE.Group();
        planetGroup.position.copy(pos);
        galaxyGroup.add(planetGroup);

        const planets = n.planets.map((planet, i) => {
          const orbitRadius = starRadius + 6 + i * 4.5;
          const planetColor = planetColorFor(planet.hits);
          // A little emissive self-light so planets read as colored bodies rather than unlit black
          // spheres — the scene's ambient/point lighting alone is too dim at this orbital distance.
          const pMat = new THREE.MeshStandardMaterial({
            color: planetColor,
            emissive: planetColor,
            emissiveIntensity: 0.35,
            roughness: 0.7,
            metalness: 0.05,
          });
          const pMesh = new THREE.Mesh(unitPlanetGeometry, pMat);
          pMesh.scale.setScalar(0.9 + Math.min(planet.hits, 3) * 0.25);
          planetGroup.add(pMesh);

          if (planet.hits >= 3) {
            const ringGeom = new THREE.RingGeometry(1.6, 2.0, 24);
            const ringMat = new THREE.MeshBasicMaterial({
              color: PLANET_COLOR_CRITICAL,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.5,
            });
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.rotation.x = Math.PI / 2.4;
            pMesh.add(ring);
          }

          // Faint orbit path for legibility.
          const orbitPoints: THREE.Vector3[] = [];
          for (let a = 0; a <= 64; a++) {
            const t = (a / 64) * Math.PI * 2;
            orbitPoints.push(new THREE.Vector3(orbitRadius * Math.cos(t), 0, orbitRadius * Math.sin(t)));
          }
          const orbitGeom = new THREE.BufferGeometry().setFromPoints(orbitPoints);
          const orbitMat = new THREE.LineBasicMaterial({ color: 0x33415c, transparent: true, opacity: 0.35 });
          planetGroup.add(new THREE.Line(orbitGeom, orbitMat));

          return {
            id: planet.id,
            mesh: pMesh,
            material: pMat,
            radius: orbitRadius,
            speed: 0.25 + hash01(planet.id) * 0.5,
            angle: hash01(planet.id + "a") * Math.PI * 2,
          };
        });

        // Teach-Back: the protégé rides in as one extra planet, distinct from the misconception
        // ones, that starts dim and brightens live as rogueBrightnessRef climbs (see tick()).
        if (rogueConceptIdRef.current === n.id) {
          const rogueRadius = starRadius + 6 + planets.length * 4.5;
          const rogueMat = new THREE.MeshStandardMaterial({
            color: ROGUE_DIM_COLOR,
            emissive: ROGUE_DIM_COLOR,
            emissiveIntensity: 0.3,
            roughness: 0.6,
          });
          const rogueMesh = new THREE.Mesh(unitPlanetGeometry, rogueMat);
          rogueMesh.scale.setScalar(1.1);
          planetGroup.add(rogueMesh);
          planets.push({
            id: ROGUE_PLANET_ID,
            mesh: rogueMesh,
            material: rogueMat,
            radius: rogueRadius,
            speed: 0.35,
            angle: hash01(n.id + "rogue") * Math.PI * 2,
          });
        }

        stars.set(n.id, {
          conceptId: n.id,
          mesh,
          material,
          light,
          displayR: n.retrievability,
          prevState: n.state,
          unlockFlashT: 0,
          planetGroup,
          planets,
        });
      }

      for (const e of currentEdges) {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) continue;
        const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
        const material = new THREE.LineBasicMaterial({
          color: e.unlocked ? EDGE_COLOR_LIT : EDGE_COLOR_DIM,
          transparent: true,
          opacity: e.unlocked ? 0.8 : 0.35,
        });
        const line = new THREE.Line(geometry, material);
        galaxyGroup.add(line);
        edgeLines.push({ line, edge: e });
      }

      builtSignature = signatureOf(currentNodes, currentEdges);
    }

    function signatureOf(list: GraphNode[], edgeList: GraphEdge[]): string {
      return (
        list
          .map((n) => n.id)
          .sort()
          .join(",") +
        "|" +
        edgeList.map((e) => `${e.source}>${e.target}:${e.unlocked}`).join(",") +
        "|rogue:" +
        (rogueConceptIdRef.current ?? "")
      );
    }

    build(nodesRef.current, edgesRef.current);

    // ---- click vs. drag detection for star selection ----
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;

    function onPointerDown(ev: PointerEvent) {
      downPos = { x: ev.clientX, y: ev.clientY };
    }
    function onPointerUp(ev: PointerEvent) {
      if (!downPos) return;
      const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return; // treat as a drag/orbit, not a click

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const meshes = Array.from(stars.values()).map((s) => s.mesh);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit) return;
      const conceptId = hit.object.userData.conceptId as string;
      const node = nodesRef.current.find((n) => n.id === conceptId);
      if (node) onNodeClickRef.current?.(node);
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    // ---- resize ----
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // ---- animation loop ----
    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Sync star/planet objects if the node/edge set structurally changed (e.g. remedial injection).
      const sig = signatureOf(nodesRef.current, edgesRef.current);
      if (sig !== builtSignature) build(nodesRef.current, edgesRef.current);

      const stormId = stormConceptIdRef.current;
      stormDim += ((stormId ? 1 : 0) - stormDim) * Math.min(1, 2.5 * dt);
      bloom.strength = 0.9 * (1 - 0.65 * stormDim);

      const latest = new Map(nodesRef.current.map((n) => [n.id, n]));
      for (const s of stars.values()) {
        const n = latest.get(s.conceptId);
        if (!n) continue;
        const target = n.retrievability;
        s.displayR += (target - s.displayR) * Math.min(1, RETRIEVABILITY_EASE_PER_SEC * dt);

        // A newly-unlocked solar system gets a brief bright flash + scale bounce so it visibly
        // "switches on" instead of silently changing color on the next graph refetch.
        if (s.prevState === "locked" && n.state !== "locked") s.unlockFlashT = 1;
        s.prevState = n.state;
        if (s.unlockFlashT > 0) s.unlockFlashT = Math.max(0, s.unlockFlashT - dt / 1.4);
        const unlockFlash = Math.sin(s.unlockFlashT * Math.PI); // 0 -> 1 -> 0 over the flash window

        // State/mastery can change (lesson learned, question answered) without the node SET
        // changing, so color and size are refreshed live here rather than only at build time.
        const stateColor = STATE_COLOR[n.state];
        const isStormTarget = stormId === n.id;
        const dimAmount = stormId && !isStormTarget ? stormDim : 0;
        const displayColor = dimAmount > 0 ? new THREE.Color(stateColor).lerp(STORM_COLD, dimAmount * 0.7) : null;
        s.material.color.setHex(stateColor);
        s.material.emissive.setHex(stateColor);
        s.light.color.setHex(stateColor);
        if (displayColor) {
          s.material.color.copy(displayColor);
          s.material.emissive.copy(displayColor);
          s.light.color.copy(displayColor);
        }
        s.material.emissiveIntensity =
          (0.08 + 0.95 * s.displayR) * (isStormTarget ? 1 + 0.6 * stormDim : 1 - 0.5 * dimAmount) + 1.6 * unlockFlash;
        s.light.intensity =
          (0.12 + 1.3 * s.displayR) * (isStormTarget ? 1 + 0.6 * stormDim : 1 - 0.5 * dimAmount) + 2.5 * unlockFlash;
        s.mesh.scale.setScalar((3 + n.mastery * 3.2) * (1 + 0.6 * unlockFlash));

        const planetById = new Map(n.planets.map((p) => [p.id, p]));
        for (const p of s.planets) {
          p.angle += p.speed * dt;
          p.mesh.position.set(p.radius * Math.cos(p.angle), 0, p.radius * Math.sin(p.angle));

          if (p.id === ROGUE_PLANET_ID) {
            const brightness = Math.max(0, Math.min(1, rogueBrightnessRef.current));
            const rogueColor = new THREE.Color(ROGUE_DIM_COLOR).lerp(new THREE.Color(ROGUE_BRIGHT_COLOR), brightness);
            p.material.color.copy(rogueColor);
            p.material.emissive.copy(rogueColor);
            p.material.emissiveIntensity = 0.3 + 0.8 * brightness;
            p.mesh.scale.setScalar(1.1 + 0.4 * brightness);
            continue;
          }

          const latestPlanet = planetById.get(p.id);
          if (latestPlanet) {
            const planetColor = planetColorFor(latestPlanet.hits);
            p.material.color.setHex(planetColor);
            p.material.emissive.setHex(planetColor);
            p.mesh.scale.setScalar(0.9 + Math.min(latestPlanet.hits, 3) * 0.25);
          }
        }
      }

      // Decay Storm: fly the camera to and hold on the concept currently in play.
      controls.enabled = !stormId;
      if (stormId) {
        const focusStar = stars.get(stormId);
        if (focusStar) {
          const focusPos = focusStar.mesh.position;
          const desiredCamPos = new THREE.Vector3(focusPos.x + 18, focusPos.y + 14, focusPos.z + 18);
          camera.position.lerp(desiredCamPos, Math.min(1, 1.5 * dt));
          controls.target.lerp(focusPos, Math.min(1, 1.5 * dt));
        }
      }

      // Decay Storm: spawn a travelling pulse when a new edge is signalled.
      const pe = pulseEdgeRef.current;
      if (pe && pe.nonce !== lastPulseNonce) {
        lastPulseNonce = pe.nonce;
        const from = stars.get(pe.source)?.mesh.position;
        const to = stars.get(pe.target)?.mesh.position;
        if (from && to) {
          const material = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 1 });
          const mesh = new THREE.Mesh(unitPulseGeometry, material);
          mesh.scale.setScalar(1.6);
          mesh.position.copy(from);
          galaxyGroup.add(mesh);
          pulses.push({ mesh, material, from: from.clone(), to: to.clone(), t: 0 });
        }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt / PULSE_SECONDS;
        if (p.t >= 1) {
          galaxyGroup.remove(p.mesh);
          p.material.dispose();
          pulses.splice(i, 1);
          continue;
        }
        p.mesh.position.lerpVectors(p.from, p.to, p.t);
        p.material.opacity = 1 - p.t;
      }

      galaxyGroup.rotation.y += dt * 0.01 * (1 - stormDim);
      controls.update();
      composer.render();
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      disposeStars();
      for (const p of pulses) {
        galaxyGroup.remove(p.mesh);
        p.material.dispose();
      }
      pulses.length = 0;
      unitStarGeometry.dispose();
      unitPlanetGeometry.dispose();
      unitPulseGeometry.dispose();
      glowTexture.dispose();
      farStars.geometry.dispose();
      (farStars.material as THREE.Material).dispose();
      nearStars.geometry.dispose();
      (nearStars.material as THREE.Material).dispose();
      galaxyDust.geometry.dispose();
      (galaxyDust.material as THREE.Material).dispose();
      galaxyClumps.geometry.dispose();
      (galaxyClumps.material as THREE.Material).dispose();
      (galaxyCore.material as THREE.Material).dispose();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
