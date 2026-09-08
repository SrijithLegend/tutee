"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import ExplainPanel from "@/components/ExplainPanel";
import DragSequence from "@/components/games/DragSequence";
import { STATE_COLOR, makeGlowTexture, makeLabelSprite } from "@/components/ConceptGraph";
import type { GraphEdge, GraphNode } from "@/lib/path";
import type { PublicQuestion } from "@/lib/diagnosis";

type QuestionView = PublicQuestion & { reason: string };

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface AnswerResponse {
  correct: boolean;
  misconceptionId: string | null;
  misconceptionName: string | null;
  microExplanation: string | null;
  strikeCount: number | null;
  injected: boolean;
  graph: Graph;
}

const CORRECT_COLOR = 0x2e8b6f;
const WRONG_COLOR = 0xff5a3c;
const LINE_IDLE_COLOR = 0x6b7690;

/** A focused solar-system scene: the concept star at the centre, one orbiting planet per answer
 * option. Answering is dragging a line from the star to a planet, not clicking a button. */
type ResolveFn = (optionId: string, correct: boolean) => void;

function ConstellationScene({
  question,
  onAnswer,
  resolveRef,
}: {
  question: QuestionView;
  onAnswer: (optionId: string) => void;
  resolveRef: MutableRefObject<ResolveFn | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || question.gameType !== "mcq") return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.01);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500);
    camera.position.set(0, 26, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x05060a, 1);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x1b2536, 0.5));
    const glowTexture = makeGlowTexture();

    const starColor = STATE_COLOR["practice"];
    const starMat = new THREE.MeshStandardMaterial({
      color: starColor,
      emissive: starColor,
      emissiveIntensity: 0.6,
    });
    const star = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 24), starMat);
    scene.add(star);
    const starLight = new THREE.PointLight(starColor, 1.2, 80, 2);
    scene.add(starLight);

    const options = question.options ?? [];
    const orbitRadius = 16;
    const planets = options.map((opt, i) => {
      const angle = (i / options.length) * Math.PI * 2;
      const pos = new THREE.Vector3(orbitRadius * Math.cos(angle), 0, orbitRadius * Math.sin(angle));
      const mat = new THREE.MeshStandardMaterial({ color: 0x5b6478, roughness: 0.8 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 16), mat);
      mesh.position.copy(pos);
      mesh.userData.optionId = opt.id;
      scene.add(mesh);

      const label = makeLabelSprite(opt.text);
      label.position.set(pos.x, pos.y + 3.2, pos.z);
      label.scale.multiplyScalar(0.6);
      scene.add(label);

      const orbitPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        orbitPts.push(new THREE.Vector3(orbitRadius * Math.cos(t), 0, orbitRadius * Math.sin(t)));
      }
      const orbitGeom = new THREE.BufferGeometry().setFromPoints(orbitPts);
      scene.add(new THREE.Line(orbitGeom, new THREE.LineBasicMaterial({ color: 0x33415c, transparent: true, opacity: 0.4 })));

      return { id: opt.id, mesh, material: mat, label, homePos: pos.clone() };
    });

    // Drag-a-line-from-the-star interaction.
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let dragging = false;
    let answered = false;

    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({ color: LINE_IDLE_COLOR, linewidth: 2 });
    const line = new THREE.Line(lineGeom, lineMat);
    line.visible = false;
    scene.add(line);

    function setNdc(ev: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function onPointerDown(ev: PointerEvent) {
      if (answered) return;
      setNdc(ev);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(star)[0];
      if (!hit) return;
      dragging = true;
      line.visible = true;
    }

    function onPointerMove(ev: PointerEvent) {
      if (!dragging) return;
      setNdc(ev);
      raycaster.setFromCamera(ndc, camera);
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, point)) {
        const positions = line.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, 0, 0, 0);
        positions.setXYZ(1, point.x, point.y, point.z);
        positions.needsUpdate = true;
      }
    }

    function onPointerUp(ev: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      setNdc(ev);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(planets.map((p) => p.mesh))[0];
      if (!hit) {
        line.visible = false;
        return;
      }
      const planet = planets.find((p) => p.mesh === hit.object);
      if (!planet) {
        line.visible = false;
        return;
      }
      answered = true;
      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(1, planet.mesh.position.x, planet.mesh.position.y, planet.mesh.position.z);
      positions.needsUpdate = true;
      onAnswerRef.current(planet.id);
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    // The parent calls this once grading returns, to animate the correct/wrong outcome in-scene.
    resolveRef.current = (optionId: string, correct: boolean) => {
      const planet = planets.find((p) => p.id === optionId);
      lineMat.color.setHex(correct ? CORRECT_COLOR : WRONG_COLOR);
      starMat.emissiveIntensity = correct ? 1.4 : 0.6;
      if (planet) {
        planet.material.color.setHex(correct ? CORRECT_COLOR : WRONG_COLOR);
        if (!correct) {
          const dir = planet.homePos.clone().normalize();
          planet.mesh.position.copy(dir.multiplyScalar(orbitRadius * 1.5));
          planet.material.roughness = 1;
        } else {
          planet.mesh.scale.setScalar(1.3);
        }
      }
    };

    let raf = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      if (!answered) {
        for (const p of planets) {
          p.mesh.rotation.y += 0.01;
        }
        star.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      glowTexture.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      resolveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

interface ConstellationDrawProps {
  conceptId: string;
  onComplete: (graph: Graph) => void;
}

export default function ConstellationDraw({ conceptId, onComplete }: ConstellationDrawProps) {
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [questionStart, setQuestionStart] = useState(0);
  const [result, setResult] = useState<AnswerResponse | null>(null);
  const resolveRef = useRef<ResolveFn | null>(null);

  useEffect(() => {
    fetch(`/api/answer?conceptId=${encodeURIComponent(conceptId)}`)
      .then((r) => r.json())
      .then((q: QuestionView) => {
        setQuestion(q);
        setQuestionStart(Date.now());
        setResult(null);
      });
  }, [conceptId]);

  function selectOption(optionId: string) {
    if (!question) return;
    const responseMs = Date.now() - questionStart;
    fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, optionId, responseMs }),
    })
      .then((r) => r.json())
      .then((res: AnswerResponse) => {
        setResult(res);
        resolveRef.current?.(optionId, res.correct);
      });
  }

  function close() {
    if (result) onComplete(result.graph);
  }

  if (!question) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
        <p className="text-muted">Loading question…</p>
      </div>
    );
  }

  if (question.gameType === "sequence") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-lg rounded-sm border border-hairline bg-card p-8 shadow-xl">
          <DragSequence question={question} onComplete={onComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-black/20">
      <div className="mx-auto mt-6 w-full max-w-lg rounded-sm border border-hairline bg-card/95 p-4 shadow-xl">
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted">Constellation Draw</p>
        <h2 className="mb-2 font-serif text-xl italic">{question.prompt}</h2>
        <ExplainPanel reason={question.reason} />
        {!result && <p className="mt-2 text-xs text-muted">Drag a line from the star to the orbiting answer.</p>}
      </div>
      <div className="relative flex-1">
        <ConstellationScene question={question} onAnswer={selectOption} resolveRef={resolveRef} />
      </div>
      {result && (
        <div className="mx-auto mb-6 w-full max-w-lg rounded-sm border border-hairline bg-card/95 p-4 shadow-xl">
          <p className={`mb-2 text-lg font-medium ${result.correct ? "text-[#2E8B6F]" : "text-[#b8791f]"}`}>
            {result.correct ? "Correct!" : "Not quite."}
          </p>
          {!result.correct && result.misconceptionName && (
            <div className="mb-4 rounded-sm border border-[#E09A32]/40 bg-[#E09A32]/10 p-3">
              <p className="text-sm font-medium text-[#b8791f]">{result.misconceptionName}</p>
              {result.microExplanation && (
                <p className="mt-1 text-sm text-foreground/70">{result.microExplanation}</p>
              )}
              {result.strikeCount != null && (
                <p className="mt-2 text-xs text-muted">Strike {result.strikeCount} of 3</p>
              )}
            </div>
          )}
          {result.injected && (
            <p className="mb-4 text-sm text-[#2E8B6F]">
              A remedial node has been added to your graph to patch this gap.
            </p>
          )}
          <button
            onClick={close}
            className="w-full rounded-sm border border-hairline px-4 py-2 text-center text-sm uppercase tracking-wide transition-colors hover:border-foreground/40 hover:bg-black/5"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
