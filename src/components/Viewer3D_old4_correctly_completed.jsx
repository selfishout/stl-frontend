import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

function generateMockScalarField(x, y, z) {
  return Math.sin(x * 0.1) + Math.cos(y * 0.1) + Math.sin(z * 0.1);
}

function colormap(value, min, max) {
  const t = (value - min) / (max - min);
  const color = new THREE.Color();
  color.setHSL((1 - t) * 0.7, 1.0, 0.5);
  return color;
}

function Viewer3D_old4_correctly_completed({ filename }) {
  const mountRef = useRef();
  const [sliceValue, setSliceValue] = useState(0);
  const [sliceAxis, setSliceAxis] = useState("z");
  const [planeMesh, setPlaneMesh] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!filename || !mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    let renderer;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(ambientLight, directionalLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const loader = new STLLoader();
    loader.load(`https://stl-backend-ipt7.onrender.com/uploads/${filename}`, (geometry) => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

      const radius = geometry.boundingSphere.radius;
      const scale = 50 / radius;

      const material = new THREE.MeshNormalMaterial({ wireframe: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(scale, scale, scale);
      scene.add(mesh);

      createSlicePlane(sliceAxis, sliceValue, scene, setPlaneMesh);
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
      while (mount.firstChild) mount.removeChild(mount.firstChild);
    };
  }, [filename]);

  useEffect(() => {
    if (planeMesh) {
      if (sliceAxis === "x") {
        planeMesh.rotation.set(0, Math.PI / 2, 0);
        planeMesh.position.set(sliceValue, 0, 0);
      } else if (sliceAxis === "y") {
        planeMesh.rotation.set(Math.PI / 2, 0, 0);
        planeMesh.position.set(0, sliceValue, 0);
      } else {
        planeMesh.rotation.set(0, 0, 0);
        planeMesh.position.set(0, 0, sliceValue);
      }
    }
  }, [sliceValue, sliceAxis, planeMesh]);

  const createSlicePlane = (axis, value, scene, setPlane) => {
    const planeSize = 100;
    const resolution = 64;
    const data = new Uint8Array(resolution * resolution * 3);
    const minVal = -3, maxVal = 3;

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const u = (i / resolution - 0.5) * planeSize;
        const v = (j / resolution - 0.5) * planeSize;
        let x = 0, y = 0, z = 0;
        if (axis === "x") {
          x = value; y = u; z = v;
        } else if (axis === "y") {
          x = u; y = value; z = v;
        } else {
          x = u; y = v; z = value;
        }
        const val = generateMockScalarField(x, y, z);
        const color = colormap(val, minVal, maxVal);
        const index = (j * resolution + i) * 3;
        data[index] = color.r * 255;
        data[index + 1] = color.g * 255;
        data[index + 2] = color.b * 255;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBFormat);
    texture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    const plane = new THREE.Mesh(geometry, material);

    scene.add(plane);
    setPlane(plane);
  };

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", height: "500px" }} />
      <div style={{ marginTop: "10px" }}>
        <label>Slice Axis:</label>
        <select value={sliceAxis} onChange={(e) => setSliceAxis(e.target.value)}>
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="z">Z</option>
        </select>
        <br />
        <label>Slice Position:</label>
        <input
          type="range"
          min={-50}
          max={50}
          value={sliceValue}
          onChange={(e) => setSliceValue(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export default Viewer3D_old4_correctly_completed;
