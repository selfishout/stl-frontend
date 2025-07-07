import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {kdTree} from 'kd-tree-javascript';

function Viewer3D({ filename }) {
  const mountRef = useRef();
  const sceneRef = useRef();
  const cameraRef = useRef();
  const rendererRef = useRef();
  const controlsRef = useRef();
  const stlMeshRef = useRef();
  const clippingPlaneRef = useRef();
  const slicePlanesRef = useRef({ x: null, y: null, z: null });
  const ouDataRef = useRef([]);
  const [sliceValues, setSliceValues] = useState({ x: 0, y: 0, z: 0 });
  const [showSlices, setShowSlices] = useState({ x: true, y: true, z: true });
  const updateTimeoutRef = useRef(null);

  // Professor's interpolation function
  function ave3D(points, property, target_point, n) {
    const dist = [];
    for (let i = 0; i < points.length; ++i) {
      const point = points[i];
      const d2 = Math.pow(point[0] - target_point[0], 2) + 
                 Math.pow(point[1] - target_point[1], 2) + 
                 Math.pow(point[2] - target_point[2], 2);
      dist.push([d2, i]);
    }

    dist.sort((a, b) => a[0] - b[0]);

    let result = 0;
    for (let i = 0; i < n && i < dist.length; ++i) {
      const idx = dist[i][1];
      result += property[idx];
    }

    return result / Math.min(n, dist.length);
  }

  const createSlicePlane = useCallback((axis) => {
    if (!sceneRef.current || !ouDataRef.current.length) return;

    const scene = sceneRef.current;
    const sliceValue = sliceValues[axis];

    // Remove existing slice plane for this axis
    if (slicePlanesRef.current[axis]) {
      scene.remove(slicePlanesRef.current[axis]);
      slicePlanesRef.current[axis].geometry.dispose();
      slicePlanesRef.current[axis].material.dispose();
      slicePlanesRef.current[axis] = null;
    }

    if (!showSlices[axis]) return;

    // Reduce resolution for better performance
    const resolution = 64; // Reduced from 128
    const size = 100;
    const data = new Uint8Array(resolution * resolution * 3);
    
    // Convert OU data to format expected by ave3D
    const points = ouDataRef.current.map(p => [p[0], p[1], p[2]]);
    const properties = ouDataRef.current.map(p => p[3]);

    const values = properties;
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const a = (i / resolution - 0.5) * size;
        const b = (j / resolution - 0.5) * size;
        let x = 0, y = 0, z = 0;
        if (axis === "z") [x, y, z] = [a, b, sliceValue];
        else if (axis === "x") [x, y, z] = [sliceValue, a, b];
        else [x, y, z] = [a, sliceValue, b];
        
        // Use professor's ave3D function for interpolation
        const val = ave3D(points, properties, [x, y, z], 4);
        const t = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
        
        // Create red color scheme for physical properties (as requested by professor)
        const color = new THREE.Color();
        color.setRGB(t, 0, 0); // Red intensity based on property value
        
        const idx = (j * resolution + i) * 3;
        data[idx] = color.r * 255;
        data[idx + 1] = color.g * 255;
        data[idx + 2] = color.b * 255;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBFormat);
    texture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4, // Made more transparent (was 0.8)
      depthWrite: false,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    if (axis === "x") {
      plane.rotation.y = Math.PI / 2;
      plane.position.set(sliceValue, 0, 0);
    } else if (axis === "y") {
      plane.rotation.x = Math.PI / 2;
      plane.position.set(0, sliceValue, 0);
    } else {
      plane.position.set(0, 0, sliceValue);
    }

    scene.add(plane);
    slicePlanesRef.current[axis] = plane;
  }, [sliceValues, showSlices]);

  const updateAllSlicePlanes = useCallback(() => {
    createSlicePlane("x");
    createSlicePlane("y");
    createSlicePlane("z");
  }, [createSlicePlane]);

  // Debounced update function
  const debouncedUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      updateAllSlicePlanes();
    }, 100); // 100ms delay
  }, [updateAllSlicePlanes]);

  async function loadOUData() {
    try {
      const ouRes = await fetch("https://stl-backend-ipt7.onrender.com/uploads/ou/generated_points.ou");
      const text = await ouRes.text();
      const parsed = text.trim().split("\n").map(line => line.split(/\s+/).map(Number));
      ouDataRef.current = parsed;
    } catch (error) {
      console.error("Failed to load OU data:", error);
    }
  }

  // Initialize scene (only runs once or when filename changes)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !filename) return;
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

    // Create clipping planes for all three axes
    const clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -sliceValues.x),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -sliceValues.y),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -sliceValues.z)
    ];
    clippingPlaneRef.current = clippingPlanes;

    const loader = new STLLoader();
    loader.load(`https://stl-backend-ipt7.onrender.com${filename}`, geometry => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

      const scale = 50 / geometry.boundingSphere.radius;
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshNormalMaterial({ 
          side: THREE.DoubleSide, 
          clippingPlanes: clippingPlanes, 
          clipShadows: true 
        })
      );
      mesh.scale.set(scale, scale, scale);
      scene.add(mesh);
      stlMeshRef.current = mesh;

      loadOUData().then(() => {
        updateAllSlicePlanes();
      });
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
  }, [filename, updateAllSlicePlanes]);

  // Update clipping planes when slice values change
  useEffect(() => {
    if (!clippingPlaneRef.current || !stlMeshRef.current) return;
    
    const clippingPlanes = clippingPlaneRef.current;
    clippingPlanes[0].constant = -sliceValues.x;
    clippingPlanes[1].constant = -sliceValues.y;
    clippingPlanes[2].constant = -sliceValues.z;
    
    if (stlMeshRef.current.material) {
      stlMeshRef.current.material.clippingPlanes = clippingPlanes;
      stlMeshRef.current.material.needsUpdate = true;
    }
  }, [sliceValues.x, sliceValues.y, sliceValues.z]);

  // Update slice planes when slice values or visibility change (debounced)
  useEffect(() => {
    debouncedUpdate();
  }, [debouncedUpdate]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", height: "500px" }} />
      <div style={{ marginTop: "10px" }}>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ marginRight: "10px" }}>Show Cross-Sections:</label>
          {["x", "y", "z"].map(axis => (
            <label key={axis} style={{ marginRight: "15px" }}>
              <input
                type="checkbox"
                checked={showSlices[axis]}
                onChange={(e) => setShowSlices(prev => ({ ...prev, [axis]: e.target.checked }))}
                style={{ marginRight: "5px" }}
              />
              {axis.toUpperCase()}
            </label>
          ))}
        </div>
        <div>
          {["x", "y", "z"].map(axis => (
            <div key={axis} style={{ marginBottom: "5px" }}>
              <label style={{ display: "inline-block", width: "20px" }}>{axis.toUpperCase()}: </label>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={sliceValues[axis]}
                onChange={(e) => setSliceValues(prev => ({ ...prev, [axis]: Number(e.target.value) }))}
                style={{ width: "150px", marginLeft: "10px" }}
              />
              <span style={{ marginLeft: "10px", fontFamily: "monospace" }}>
                {sliceValues[axis]}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default Viewer3D;
