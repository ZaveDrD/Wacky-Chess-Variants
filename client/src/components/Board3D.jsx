import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COLORS, PIECE_ICONS } from "../game/config.js";

const ORBIT_TARGET = new THREE.Vector3(0, 2.4, 0);
const GIZMO_AXIS_LENGTH = 1.65;

export default function Board3D({ game, selectedPieceId, legalMoveKeys, onPieceClick, onCameraChange, devVisuals = {} }) {
  return (
    <div className="board-3d">
      <Canvas camera={{ position: [9, 10, 11], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[7, 10, 5]} intensity={1.1} />
        <GridCage legalMoveKeys={legalMoveKeys} devVisuals={devVisuals} />
        {game.pieces.map((piece) => (
          <Piece3D
            key={piece.id}
            piece={piece}
            selected={piece.id === selectedPieceId}
            onClick={() => onPieceClick(piece)}
          />
        ))}
        <CameraOrbitControls onCameraChange={onCameraChange} />
      </Canvas>
    </div>
  );
}

function CameraOrbitControls({ onCameraChange }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef(null);
  const lastSignatureRef = useRef("");
  const frameRef = useRef(0);

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(ORBIT_TARGET);
    controls.update();
    controlsRef.current = controls;

    return () => controls.dispose();
  }, [camera, gl]);

  useFrame(() => {
    controlsRef.current?.update();

    if (!onCameraChange) return;
    frameRef.current += 1;
    if (frameRef.current % 2 !== 0) return;

    const axes = projectAxesForGizmo(camera, controlsRef.current?.target || ORBIT_TARGET);
    const signature = `${axes.x.angle}:${axes.x.length}:${axes.y.angle}:${axes.y.length}:${axes.z.angle}:${axes.z.length}`;

    if (signature !== lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      onCameraChange(axes);
    }
  });

  return null;
}

function projectAxesForGizmo(camera, target) {
  const origin = target.clone();
  const projectedOrigin = origin.clone().project(camera);

  return {
    x: projectAxis(camera, origin, projectedOrigin, new THREE.Vector3(1, 0, 0)),
    y: projectAxis(camera, origin, projectedOrigin, new THREE.Vector3(0, 1, 0)),
    z: projectAxis(camera, origin, projectedOrigin, new THREE.Vector3(0, 0, 1))
  };
}

function projectAxis(camera, origin, projectedOrigin, axisVector) {
  const projectedEnd = origin.clone().addScaledVector(axisVector, GIZMO_AXIS_LENGTH).project(camera);
  const dx = projectedEnd.x - projectedOrigin.x;
  const dy = projectedEnd.y - projectedOrigin.y;
  const ndcLength = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(-dy, dx) * 180 / Math.PI;

  return {
    angle: Number(angle.toFixed(1)),
    length: Number(Math.min(54, Math.max(24, ndcLength * 128)).toFixed(1)),
    opacity: Number(Math.min(1, Math.max(0.42, 0.42 + ndcLength * 7)).toFixed(2))
  };
}

function GridCage({ legalMoveKeys, devVisuals = {} }) {
  const squares = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      for (let z = 0; z < 8; z += 1) {
        const isBaseLayer = y === 0;
        const legalMove = legalMoveKeys.get(`${x},${y},${z}`);
        const highlighted = (devVisuals.highlights || []).some((item) => item.x === x && item.y === y && item.z === z);
        const ghostFrom = devVisuals.ghostMove?.from && devVisuals.ghostMove.from.x === x && devVisuals.ghostMove.from.y === y && devVisuals.ghostMove.from.z === z;
        const ghostTo = devVisuals.ghostMove?.to && devVisuals.ghostMove.to.x === x && devVisuals.ghostMove.to.y === y && devVisuals.ghostMove.to.z === z;
        squares.push(
          <group key={`${x}-${y}-${z}`}>
            <mesh position={[x - 3.5, y * 0.8, z - 3.5]}>
              <boxGeometry args={[0.95, 0.035, 0.95]} />
              <meshStandardMaterial
                color={(x + z) % 2 === 0 ? COLORS.lightSquare : COLORS.darkSquare}
                transparent
                opacity={isBaseLayer ? 0.22 : 0.055}
              />
            </mesh>
            {legalMove && <LegalMoveMarker x={x} y={y} z={z} capture={Boolean(legalMove.capture)} />}
            {(highlighted || ghostFrom || ghostTo) && <DevMarker x={x} y={y} z={z} kind={ghostFrom ? "from" : ghostTo ? "to" : "highlight"} />}
          </group>
        );
      }
    }
  }

  return <>{squares}</>;
}

function DevMarker({ x, y, z, kind }) {
  const color = kind === "from" ? "#67e8f9" : kind === "to" ? "#fb7185" : "#facc15";
  return (
    <mesh position={[x - 3.5, y * 0.8 + 0.88, z - 3.5]}>
      <sphereGeometry args={[0.18, 18, 18]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.88} />
    </mesh>
  );
}

function LegalMoveMarker({ x, y, z, capture }) {
  return (
    <mesh position={[x - 3.5, y * 0.8 + 0.48, z - 3.5]}>
      <boxGeometry args={capture ? [0.5, 0.5, 0.5] : [0.38, 0.38, 0.38]} />
      <meshStandardMaterial
        color={capture ? COLORS.captureMove : COLORS.legalMove}
        emissive={capture ? COLORS.captureMove : COLORS.legalMove}
        emissiveIntensity={0.25}
        transparent
        opacity={0.82}
      />
    </mesh>
  );
}

function Piece3D({ piece, selected, onClick }) {
  const position = [piece.x - 3.5, piece.y * 0.8 + 0.35, piece.z - 3.5];
  const pieceColor = piece.color === "white" ? COLORS.whitePiece : COLORS.blackPiece;

  return (
    <group position={position} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <mesh>
        <cylinderGeometry args={[0.28, 0.36, 0.55, 24]} />
        <meshStandardMaterial color={pieceColor} emissive={selected ? COLORS.selected : "#000000"} emissiveIntensity={selected ? 0.45 : 0} />
      </mesh>
      <PieceLabel piece={piece} />
    </group>
  );
}

function PieceLabel({ piece }) {
  const texture = useMemo(() => new THREE.TextureLoader().load(PIECE_ICONS[piece.color][piece.type]), [piece.color, piece.type]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, 0.52, 0]} scale={[0.76, 0.76, 0.76]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}
