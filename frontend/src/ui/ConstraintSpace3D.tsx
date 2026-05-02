import { useRef, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { Mesh } from "three";

export type ConstraintSpacePoint = {
  requirementId: string;
  x: number;
  y: number;
  z: number;
  requirementType?: string;
  subsystem?: string;
};

const TYPE_COLORS: Record<string, string> = {
  functional: "#3b82f6",
  performance: "#22c55e",
  interface: "#a855f7",
  constraint: "#f59e0b",
  safety: "#ef4444",
  derived: "#06b6d4",
  cybersecurity: "#ec4899",
  verification: "#8b5cf6",
  environmental: "#14b8a6",
  regulatory: "#64748b",
};

function Point({
  point,
  scale,
  onHover,
}: {
  point: ConstraintSpacePoint;
  scale: number;
  onHover: (id: string | null) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const color = point.requirementType && TYPE_COLORS[point.requirementType]
    ? TYPE_COLORS[point.requirementType]
    : "#94a3b8";
  const dist = Math.sqrt(
    (1 - point.x) ** 2 + (1 - point.y) ** 2 + (1 - point.z) ** 2
  );
  const size = 0.04 + (1 - Math.min(dist, 1)) * 0.03;

  return (
    <mesh
      ref={meshRef}
      position={[point.x * scale, point.y * scale, point.z * scale]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(point.requirementId);
      }}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[size, 12, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
    </mesh>
  );
}

function PerfectCorner({ scale }: { scale: number }) {
  return (
    <group position={[scale, scale, scale]}>
      <mesh>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial color="#22c55e" wireframe />
      </mesh>
      <Text position={[0.55, 0, 0]} fontSize={0.12} color="#86efac">
        (1,1,1)
      </Text>
    </group>
  );
}

function AxisLines({ scale }: { scale: number }) {
  return (
    <>
      <Line points={[[0, 0, 0], [scale, 0, 0]]} color="#ef4444" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, scale, 0]]} color="#22c55e" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, 0, scale]]} color="#3b82f6" lineWidth={2} />
    </>
  );
}

function Scene({
  points,
  scale,
  onHover,
}: {
  points: ConstraintSpacePoint[];
  scale: number;
  onHover: (id: string | null) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[scale, scale, scale * 1.5]} intensity={1} />
      <AxisLines scale={scale} />
      <PerfectCorner scale={scale} />
      {points.map((p) => (
        <Point key={p.requirementId} point={p} scale={scale} onHover={onHover} />
      ))}
      <OrbitControls enableDamping dampingFactor={0.05} />
    </>
  );
}

export function ConstraintSpace3D({ points }: { points: ConstraintSpacePoint[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterByType, setFilterByType] = useState<string>("");
  const [filterBySubsystem, setFilterBySubsystem] = useState<string>("");
  const scale = 1.2;

  const filtered = useMemo(() => {
    let list = points;
    if (filterByType) list = list.filter((p) => p.requirementType === filterByType);
    if (filterBySubsystem) list = list.filter((p) => p.subsystem === filterBySubsystem);
    return list;
  }, [points, filterByType, filterBySubsystem]);

  const types = useMemo(() => {
    const set = new Set<string>();
    points.forEach((p) => p.requirementType && set.add(p.requirementType));
    return Array.from(set).sort();
  }, [points]);

  const subsystems = useMemo(() => {
    const set = new Set<string>();
    points.forEach((p) => p.subsystem && set.add(p.subsystem));
    return Array.from(set).sort();
  }, [points]);

  return (
    <div className="constraint-space-3d">
      <div className="constraint-space-filters">
        <label>
          Filter by requirement type
          <select value={filterByType} onChange={(e) => setFilterByType(e.target.value)}>
            <option value="">All</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Filter by subsystem
          <select value={filterBySubsystem} onChange={(e) => setFilterBySubsystem(e.target.value)}>
            <option value="">All</option>
            {subsystems.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="constraint-space-canvas-wrap">
        <Canvas
          camera={{ position: [2.5, 2.5, 2.5], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
        >
          <Scene points={filtered} scale={scale} onHover={setHoveredId} />
        </Canvas>
      </div>
      <p className="constraint-space-axes">
        X = Functional completeness · Y = Performance completeness · Z = Condition completeness. Perfect requirements cluster near (1,1,1).
      </p>
      {hoveredId && <p className="constraint-space-hover">Requirement: {hoveredId}</p>}
    </div>
  );
}
