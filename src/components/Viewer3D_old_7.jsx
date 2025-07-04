import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// Generate 500 Halton-like points inside bounding cube [-5,5]^3
const dataPoints = Array.from({ length: 500 }, () => {
  const x = (Math.random() - 0.5) * 10;
  const y = (Math.random() - 0.5) * 10;
  const z = (Math.random() - 0.5) * 10;
  return [x, y, z];
});

// Simulate scalar field
const propertyValues = dataPoints.map(([x, y, z]) => {
  return -Math.exp(-(x ** 2 + y ** 2 + z ** 2) / 20);
});

function interpolateProperty(target, k = 8) {
  const distances = dataPoints.map((p, i) => {
    const d2 = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 + (p[2] - target[2]) ** 2;
    return { i, d2 };
  });
  distances.sort((a, b) => a.d2 - b.d2);
  let result = 0;
  for (let j = 0; j < k; j++) result += propertyValues[distances[j].i];
  return result / k;
}

function colormap(value, min, max) {
  const t = (value - min) / (max - min);
  const color = new THREE.Color();
  color.setHSL((1 - t) * 0.7, 1.0, 0.5);
  return color;
}

function Viewer3D_old_7({ filename }) {
  const mountRef = useRef();
  const [sliceAxis, setSliceAxis] = useState("z");
  const [sliceValue, setSliceValue] = useState(0);
  const [showMesh, setShowMesh] = useState(true);

  const sceneRef = useRef();
  const cameraRef = useRef();
  const rendererRef = useRef();
  const controlsRef = useRef();
  const stlMeshRef = useRef();
  const slicePlaneRef = useRef();
  const textSpritesRef = useRef([]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!filename || !mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const loader = new STLLoader();
    loader.load(`http://localhost:8000/uploads/${filename}`, (geometry) => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      const radius = geometry.boundingSphere.radius;
      const scale = 50 / radius;

      const material = new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide,
        clippingPlanes: [],
        clipShadows: true,
        transparent: true,
        opacity: 0.7
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(scale, scale, scale);
      scene.add(mesh);
      stlMeshRef.current = mesh;

      createOrUpdateSlicePlane();
    });

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener("resize", () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
  }, [filename]);

  useEffect(() => {
    if (stlMeshRef.current) createOrUpdateSlicePlane();
  }, [sliceAxis, sliceValue, showMesh]);

  function createOrUpdateSlicePlane() {
    const scene = sceneRef.current;
    const mesh = stlMeshRef.current;
    const renderer = rendererRef.current;
    if (!scene || !mesh || !renderer) return;

    if (slicePlaneRef.current) {
      scene.remove(slicePlaneRef.current);
      slicePlaneRef.current.geometry.dispose();
      slicePlaneRef.current.material.dispose();
    }

    textSpritesRef.current.forEach(sprite => scene.remove(sprite));
    textSpritesRef.current = [];

    const size = 100;
    const resolution = 32;
    const data = new Uint8Array(resolution * resolution * 3);
    const minVal = -1.0, maxVal = 0;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = (i / resolution - 0.5) * size;
        const b = (j / resolution - 0.5) * size;
        let x = 0, y = 0, z = 0;
        if (sliceAxis === "z") [x, y, z] = [a, b, sliceValue];
        else if (sliceAxis === "x") [x, y, z] = [sliceValue, a, b];
        else [x, y, z] = [a, sliceValue, b];

        const val = interpolateProperty([x, y, z]);
        const color = colormap(val, minVal, maxVal);
        const idx = (j * resolution + i) * 3;
        data[idx] = color.r * 255;
        data[idx + 1] = color.g * 255;
        data[idx + 2] = color.b * 255;

        if (i % 8 === 0 && j % 8 === 0) {
          const label = makeTextSprite(val.toFixed(2));
          label.position.set(x, y, z);
          scene.add(label);
          textSpritesRef.current.push(label);
        }
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBFormat);
    texture.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });

    const geo = new THREE.PlaneGeometry(size, size);
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.set(0, 0, 0);
    if (sliceAxis === "z") plane.position.set(0, 0, sliceValue);
    else if (sliceAxis === "x") {
      plane.rotation.y = Math.PI / 2;
      plane.position.set(sliceValue, 0, 0);
    } else {
      plane.rotation.x = Math.PI / 2;
      plane.position.set(0, sliceValue, 0);
    }

    scene.add(plane);
    slicePlaneRef.current = plane;

    const normal = new THREE.Vector3(
      sliceAxis === "x" ? -1 : 0,
      sliceAxis === "y" ? -1 : 0,
      sliceAxis === "z" ? -1 : 0
    );
    const planeClip = new THREE.Plane(normal, sliceValue);
    mesh.material.clippingPlanes = showMesh ? [planeClip] : [];
    mesh.visible = showMesh;
  }

  function makeTextSprite(message) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "24px Arial";
    context.fillStyle = "rgba(0,0,0,1.0)";
    context.fillText(message, 2, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(10, 5, 1);
    return sprite;
  }

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", height: "500px" }} />
      <div style={{ marginTop: "10px" }}>
        <label>Plane: </label>
        <select value={sliceAxis} onChange={(e) => setSliceAxis(e.target.value)}>
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="z">Z</option>
        </select>
        <input
          type="range"
          min={-50}
          max={50}
          step={1}
          value={sliceValue}
          onChange={(e) => setSliceValue(Number(e.target.value))}
          style={{ width: "200px", marginLeft: "10px" }}
        />
        <label style={{ marginLeft: "20px" }}>
          <input type="checkbox" checked={showMesh} onChange={(e) => setShowMesh(e.target.checked)} /> Show Mesh
        </label>
      </div>
    </div>
  );
}

export default Viewer3D_old_7;
