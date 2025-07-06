import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

function Viewer3D() {
  const mountRef = useRef();
  const [sliceAxis, setSliceAxis] = useState("z");
  const [sliceValue, setSliceValue] = useState(0);
  const [stlFile, setStlFile] = useState(null);
  const [stlUrl, setStlUrl] = useState(null);

  const sceneRef = useRef();
  const cameraRef = useRef();
  const rendererRef = useRef();
  const controlsRef = useRef();
  const stlMeshRef = useRef();
  const slicePlaneRef = useRef();

  const ouDataRef = useRef([]);

  function interpolate(target, points, values, k = 4) {
    const dists = points.map((p, i) => ({
      i,
      d2: p.reduce((s, v, j) => s + (v - target[j]) ** 2, 0),
    }));
    dists.sort((a, b) => a.d2 - b.d2);
    return (
      dists.slice(0, k).reduce((acc, { i }) => acc + values[i], 0) / k
    );
  }

  function colormap(value, min, max) {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const color = new THREE.Color();
    color.setHSL((1 - t) * 0.7, 1.0, 0.5);
    return color;
  }

  function createSlicePlane() {
    const scene = sceneRef.current;
    const mesh = stlMeshRef.current;
    if (!scene || !mesh || ouDataRef.current.length === 0) return;

    const resolution = 128;
    const size = 100;
    const data = new Uint8Array(resolution * resolution * 3);
    const points = ouDataRef.current.map((p) => p.slice(0, 3));
    const values = ouDataRef.current.map((p) => p[3]);

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = (i / resolution - 0.5) * size;
        const b = (j / resolution - 0.5) * size;
        let x = 0,
          y = 0,
          z = 0;
        if (sliceAxis === "z") [x, y, z] = [a, b, sliceValue];
        else if (sliceAxis === "x") [x, y, z] = [sliceValue, a, b];
        else [x, y, z] = [a, sliceValue, b];

        const val = interpolate([x, y, z], points, values);
        const color = colormap(val, minVal, maxVal);
        const idx = (j * resolution + i) * 3;
        data[idx] = color.r * 255;
        data[idx + 1] = color.g * 255;
        data[idx + 2] = color.b * 255;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBFormat);
    texture.needsUpdate = true;

    if (slicePlaneRef.current) {
      scene.remove(slicePlaneRef.current);
      slicePlaneRef.current.geometry.dispose();
      slicePlaneRef.current.material.dispose();
    }

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    if (sliceAxis === "x") {
      plane.rotation.y = Math.PI / 2;
      plane.position.set(sliceValue, 0, 0);
    } else if (sliceAxis === "y") {
      plane.rotation.x = Math.PI / 2;
      plane.position.set(0, sliceValue, 0);
    } else {
      plane.position.set(0, 0, sliceValue);
    }

    scene.add(plane);
    slicePlaneRef.current = plane;
  }

  async function uploadAndGenerateOU(file) {
    const formData = new FormData();
    formData.append("stl", file);

    const res = await fetch("https://stl-backend-ipt7.onrender.com/generate-ou", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "OU generation failed");

    setStlUrl(`https://stl-backend-ipt7.onrender.com${data.stl_url}`);

    const ouRes = await fetch(`https://stl-backend-ipt7.onrender.com${data.ou_url}`);
    const text = await ouRes.text();
    const parsed = text.trim().split("\n").map((line) => line.split(/\s+/).map(Number));
    ouDataRef.current = parsed;
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !stlUrl) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
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
    loader.load(stlUrl, (geometry) => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

      const scale = 50 / geometry.boundingSphere.radius;
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
      );
      mesh.scale.set(scale, scale, scale);
      scene.add(mesh);
      stlMeshRef.current = mesh;

      createSlicePlane();
    });

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [stlUrl]);

  useEffect(() => {
    if (stlMeshRef.current && ouDataRef.current.length > 0) {
      createSlicePlane();
    }
  }, [sliceAxis, sliceValue]);

  return (
    <div>
      <input
        type="file"
        accept=".stl"
        onChange={async (e) => {
          const file = e.target.files[0];
          if (file) {
            setStlFile(file);
            await uploadAndGenerateOU(file);
          }
        }}
      />
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

export default Viewer3D;
