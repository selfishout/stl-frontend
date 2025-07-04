import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// Hardcoded points and property values (converted from .ou)
const dataPoints = [
  [2.75, 3.0556, 0.36],
  [3.875, -0.2037, 6.12],
  [1.0625, 4.6852, 4.68],
  [3.3125, -3.4630, 3.24],
  [-1.1875, 0.2037, 5.04],
  [-1.5, -3.2, 2.5],
  [-2.0, 1.2, 4.0],
  [0.0, 0.0, 3.0],
  [1.0, -1.0, 4.0],
  [2.5, 2.0, 5.5]
];
const propertyValues = [-0.0713, -0.3984, -0.2138, -0.5433, -2.0277, -1.512, -0.75, -0.21, -1.05, -0.98];

// Interpolation function (JS version of C++ ave3D)
function interpolateProperty(target, k = 4) {
  const distances = dataPoints.map((p, i) => {
    const d2 = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 + (p[2] - target[2]) ** 2;
    return { i, d2 };
  });

  distances.sort((a, b) => a.d2 - b.d2);
  let result = 0;
  for (let j = 0; j < k; j++) result += propertyValues[distances[j].i];
  return result / k;
}

// Convert value to color
function colormap(value, min, max) {
  const t = (value - min) / (max - min);
  const color = new THREE.Color();
  color.setHSL((1 - t) * 0.7, 1.0, 0.5);
  return color;
}

function Viewer3D_old6_hardcoded({ filename }) {
  const mountRef = useRef();
  const [sliceAxis, setSliceAxis] = useState("z");
  const [sliceValue, setSliceValue] = useState(0);

  const sceneRef = useRef();
  const cameraRef = useRef();
  const rendererRef = useRef();
  const controlsRef = useRef();
  const stlMeshRef = useRef();
  const slicePlaneRef = useRef();
  const clippingPlanesRef = useRef([]);

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

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(ambientLight, directionalLight);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const loader = new STLLoader();

    // `http://localhost:8000/uploads/${filename}`
    // `https://stl-backend-ipt7.onrender.com/uploads/${filename}`
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

    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (renderer) renderer.dispose();
    };
  }, [filename]);

  useEffect(() => {
    if (stlMeshRef.current) {
      createOrUpdateSlicePlane();
    }
  }, [sliceAxis, sliceValue]);

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

    const size = 100;
    const resolution = 64;
    const data = new Uint8Array(resolution * resolution * 3);
    const minVal = -2.5, maxVal = 0;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = (i / resolution - 0.5) * size;
        const b = (j / resolution - 0.5) * size;
        let x = 0, y = 0, z = 0;
        if (sliceAxis === "z") {
          x = a; y = b; z = sliceValue;
        } else if (sliceAxis === "x") {
          x = sliceValue; y = a; z = b;
        } else {
          x = a; y = sliceValue; z = b;
        }

        const val = interpolateProperty([x, y, z]);
        const color = colormap(val, minVal, maxVal);
        const idx = (j * resolution + i) * 3;
        data[idx] = color.r * 255;
        data[idx + 1] = color.g * 255;
        data[idx + 2] = color.b * 255;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBFormat);
    texture.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
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

    // Set clipping to remove mesh beyond slice plane
    const normal = new THREE.Vector3(
      sliceAxis === "x" ? -1 : 0,
      sliceAxis === "y" ? -1 : 0,
      sliceAxis === "z" ? -1 : 0
    );
    const planeClip = new THREE.Plane(normal, sliceValue);
    clippingPlanesRef.current = [planeClip];
    mesh.material.clippingPlanes = clippingPlanesRef.current;
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
      </div>
    </div>
  );
}

export default Viewer3D_old6_hardcoded;
