import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { getApiUrl, API_ENDPOINTS } from "../config";

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
  const [activeSlice, setActiveSlice] = useState("x"); // Only one slice active at a time
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

  // Create colormap texture from interpolated values with object mask
  function createColormapTexture(values, width, height, objectMask) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    
    for (let i = 0; i < values.length; i++) {
      const pixelIndex = i * 4;
      const normalizedValue = range > 0 ? (values[i] - minVal) / range : 0;
      
      // Check if this pixel is inside the object mask
      const isInside = objectMask[i];
      
      if (isInside) {
        // Create heatmap colormap: Blue -> Cyan -> Green -> Yellow -> Red
        let red, green, blue;
        if (normalizedValue < 0.25) {
          // Blue to Cyan
          const t = normalizedValue / 0.25;
          red = 0;
          green = Math.floor(t * 255);
          blue = 255;
        } else if (normalizedValue < 0.5) {
          // Cyan to Green
          const t = (normalizedValue - 0.25) / 0.25;
          red = 0;
          green = 255;
          blue = Math.floor((1 - t) * 255);
        } else if (normalizedValue < 0.75) {
          // Green to Yellow
          const t = (normalizedValue - 0.5) / 0.25;
          red = Math.floor(t * 255);
          green = 255;
          blue = 0;
        } else {
          // Yellow to Red
          const t = (normalizedValue - 0.75) / 0.25;
          red = 255;
          green = Math.floor((1 - t) * 255);
          blue = 0;
        }
        
        imageData.data[pixelIndex] = red;     // R
        imageData.data[pixelIndex + 1] = green; // G
        imageData.data[pixelIndex + 2] = blue;  // B
        imageData.data[pixelIndex + 3] = 255;   // A (opaque)
      } else {
        // Outside the object - make transparent
        imageData.data[pixelIndex] = 0;     // R
        imageData.data[pixelIndex + 1] = 0; // G
        imageData.data[pixelIndex + 2] = 0; // B
        imageData.data[pixelIndex + 3] = 0;   // A (transparent)
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Create object mask for the slice plane
  function createObjectMask(axis, value, stlGeometry, gridSize, halfSize, center) {
    const mask = new Array(gridSize * gridSize).fill(false);
    
    // Create a temporary mesh for intersection testing
    const tempMesh = new THREE.Mesh(stlGeometry);
    
    // Create a plane geometry for intersection
    const planeGeometry = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2);
    if (axis === 'x') {
      planeGeometry.rotateY(Math.PI / 2);
    } else if (axis === 'y') {
      planeGeometry.rotateX(Math.PI / 2);
    }
    
    const planeMesh = new THREE.Mesh(planeGeometry);
    if (axis === 'x') {
      planeMesh.position.set(value, center.y, center.z);
    } else if (axis === 'y') {
      planeMesh.position.set(center.x, value, center.z);
    } else { // z
      planeMesh.position.set(center.x, center.y, value);
    }
    
    // Use a more efficient approach: sample points and check if they're inside
    // We'll use a sparse sampling approach to create the mask
    const sampleStep = Math.max(1, Math.floor(gridSize / 32)); // Sample every few pixels
    
    for (let i = 0; i < gridSize; i += sampleStep) {
      for (let j = 0; j < gridSize; j += sampleStep) {
        const u = (i / (gridSize - 1) - 0.5) * halfSize * 2;
        const v = (j / (gridSize - 1) - 0.5) * halfSize * 2;
        
        let x, y, z;
        if (axis === 'x') {
          x = value;
          y = center.y + u;
          z = center.z + v;
        } else if (axis === 'y') {
          x = center.x + u;
          y = value;
          z = center.z + v;
        } else { // z
          x = center.x + u;
          y = center.y + v;
          z = value;
        }
        
        // Simple distance-based check (much faster than raycasting)
        const point = new THREE.Vector3(x, y, z);
        const distance = tempMesh.geometry.boundingSphere.distanceToPoint(point);
        const isInside = distance <= tempMesh.geometry.boundingSphere.radius * 0.8; // Conservative estimate
        
        // Fill the mask for this region
        const startI = Math.max(0, i - sampleStep);
        const endI = Math.min(gridSize, i + sampleStep);
        const startJ = Math.max(0, j - sampleStep);
        const endJ = Math.min(gridSize, j + sampleStep);
        
        for (let ii = startI; ii < endI; ii++) {
          for (let jj = startJ; jj < endJ; jj++) {
            const index = ii * gridSize + jj;
            mask[index] = isInside;
          }
        }
      }
    }
    
    return mask;
  }

  // Create slice plane with heatmap (optimized version)
  function createSlicePlane(axis, value, stlGeometry) {
    if (!ouDataRef.current.length) return null;
    
    const points = ouDataRef.current.map(row => [row[0], row[1], row[2]]);
    const properties = ouDataRef.current.map(row => row[3]);
    
    // Calculate plane bounds based on STL geometry - restore original large size
    const stlBounds = new THREE.Box3().setFromObject(new THREE.Mesh(stlGeometry));
    const size = stlBounds.getSize(new THREE.Vector3());
    const center = stlBounds.getCenter(new THREE.Vector3());
    
    // Use much larger size for the plane (original large size)
    const halfSize = Math.max(size.x, size.y, size.z) * 2.0;
    
    // Use higher resolution for better heatmap quality with larger plane
    const gridSize = 150;
    const gridValues = [];
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const u = (i / (gridSize - 1) - 0.5) * halfSize * 2;
        const v = (j / (gridSize - 1) - 0.5) * halfSize * 2;
        
        let x, y, z;
        if (axis === 'x') {
          x = value;
          y = center.y + u;
          z = center.z + v;
        } else if (axis === 'y') {
          x = center.x + u;
          y = value;
          z = center.z + v;
        } else { // z
          x = center.x + u;
          y = center.y + v;
          z = value;
        }
        
        // Interpolate property value at this grid point
        const interpolatedValue = ave3D(points, properties, [x, y, z], 5);
        gridValues.push(interpolatedValue);
      }
    }
    
    // Create object mask
    const objectMask = createObjectMask(axis, value, stlGeometry, gridSize, halfSize, center);
    
    // Create heatmap texture with mask
    const texture = createColormapTexture(gridValues, gridSize, gridSize, objectMask);
    
    // Create plane geometry (same size as before)
    const planeGeometry = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2);
    
    // Adjust plane orientation based on axis
    if (axis === 'x') {
      planeGeometry.rotateY(Math.PI / 2);
    } else if (axis === 'y') {
      planeGeometry.rotateX(Math.PI / 2);
    }
    
    // Create material with the heatmap texture and proper opacity
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    
    const plane = new THREE.Mesh(planeGeometry, material);
    
    // Position the plane
    if (axis === 'x') {
      plane.position.set(value, center.y, center.z);
    } else if (axis === 'y') {
      plane.position.set(center.x, value, center.z);
    } else { // z
      plane.position.set(center.x, center.y, value);
    }
    
    return plane;
  }

  const createSlicePlaneCallback = useCallback((axis) => {
    const scene = sceneRef.current;
    const sliceValue = sliceValues[axis];
    
    if (!scene || !ouDataRef.current.length || !stlMeshRef.current) return;

    // Only create slice plane for the active axis
    if (axis !== activeSlice) return;

    // Remove existing slice plane
    if (slicePlanesRef.current[axis]) {
      scene.remove(slicePlanesRef.current[axis]);
      slicePlanesRef.current[axis].geometry.dispose();
      slicePlanesRef.current[axis].material.dispose();
      if (slicePlanesRef.current[axis].material.map) {
        slicePlanesRef.current[axis].material.map.dispose();
      }
      slicePlanesRef.current[axis] = null;
    }

    // Create the slice plane using the new function
    const plane = createSlicePlane(axis, sliceValue, stlMeshRef.current.geometry);
    
    if (plane) {
      scene.add(plane);
      slicePlanesRef.current[axis] = plane;
    }
  }, [sliceValues, activeSlice]);

  const updateAllSlicePlanes = useCallback(() => {
    // Only update the active slice plane
    createSlicePlaneCallback(activeSlice);
  }, [createSlicePlaneCallback, activeSlice]);

  // Debounced update function
  const debouncedUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      updateAllSlicePlanes();
    }, 50); // Reduced delay for better responsiveness
  }, [updateAllSlicePlanes]);

  async function loadOUData() {
    try {
      const ouRes = await fetch(getApiUrl("/uploads/ou/generated_points.ou"));
      const text = await ouRes.text();
      const parsed = text.trim().split("\n").map(line => line.split(/\s+/).map(Number));
      ouDataRef.current = parsed;
    } catch (error) {
      // eslint-disable-next-line no-console
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

    // Create clipping plane for the active slice only
    const clippingPlane = new THREE.Plane();
    clippingPlaneRef.current = clippingPlane;

    const loader = new STLLoader();
    loader.load(getApiUrl(filename), geometry => {
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
          clippingPlanes: [clippingPlane], 
          clipShadows: true,
          transparent: true,
          opacity: 0.8
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

  // Update clipping plane when slice values or active slice change
  useEffect(() => {
    if (!clippingPlaneRef.current || !stlMeshRef.current) return;
    
    const clippingPlane = clippingPlaneRef.current;
    const sliceValue = sliceValues[activeSlice];
    
    // Set clipping plane based on active slice
    if (activeSlice === "x") {
      clippingPlane.normal.set(1, 0, 0);
      clippingPlane.constant = -sliceValue;
    } else if (activeSlice === "y") {
      clippingPlane.normal.set(0, 1, 0);
      clippingPlane.constant = -sliceValue;
    } else { // z
      clippingPlane.normal.set(0, 0, 1);
      clippingPlane.constant = -sliceValue;
    }
    
    if (stlMeshRef.current.material) {
      stlMeshRef.current.material.clippingPlanes = [clippingPlane];
      stlMeshRef.current.material.needsUpdate = true;
    }
  }, [sliceValues, activeSlice]);

  // Update slice planes when slice values or active slice change (debounced)
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
          <label style={{ marginRight: "10px" }}>Cross-Section Plane:</label>
          {["x", "y", "z"].map(axis => (
            <label key={axis} style={{ marginRight: "15px" }}>
              <input
                type="radio"
                name="sliceAxis"
                checked={activeSlice === axis}
                onChange={() => setActiveSlice(axis)}
                style={{ marginRight: "5px" }}
              />
              {axis.toUpperCase()}
            </label>
          ))}
        </div>
        <div>
          <label style={{ display: "inline-block", width: "20px" }}>{activeSlice.toUpperCase()}: </label>
          <input
            type="range"
            min={-50}
            max={50}
            step={1}
            value={sliceValues[activeSlice]}
            onChange={(e) => setSliceValues(prev => ({ ...prev, [activeSlice]: Number(e.target.value) }))}
            style={{ width: "150px", marginLeft: "10px" }}
          />
          <span style={{ marginLeft: "10px", fontFamily: "monospace" }}>
            {sliceValues[activeSlice]}
          </span>
        </div>

      </div>
    </div>
  );
}

export default Viewer3D;

