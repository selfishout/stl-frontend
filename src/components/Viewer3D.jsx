import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { getApiUrl } from "../config";

function Viewer3D({ filename }) {
  const mountRef = useRef();
  const [sliceAxis, setSliceAxis] = useState("z");
  const [sliceValue, setSliceValue] = useState(0);
  const [showSlice, setShowSlice] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [ouData, setOuData] = useState([]); // [[x, y, z, property], ...]
  const [isGeneratingHeatmap, setIsGeneratingHeatmap] = useState(false);
  const cachedMinMaxRef = useRef(null); // Cache for min/max values

  // Load .ou data when filename changes
  useEffect(() => {
    if (!filename) return;
    
    // Clear cache when loading new data
    cachedMinMaxRef.current = null;
    
    // Extract just the filename without path and extension
    const baseName = filename.split('/').pop().replace(/\.[^.]+$/, "");
    const ouName = `${baseName}.ou`;
    
    // Try to match .ou file to STL filename
    fetch(getApiUrl(`/uploads/ou/${ouName}`))
      .then(res => {
        if (!res.ok) throw new Error("No matching .ou file");
        return res.text();
      })
      .then(text => {
        // Parse .ou file
        const lines = text.split("\n").filter(l => l && !l.startsWith("#"));
        const data = lines.map(line => {
          const [x, y, z, property] = line.trim().split(/\s+/).map(Number);
          return [x, y, z, property];
        });
        setOuData(data);
      })
      .catch((error) => {
        // fallback: try generated_points.ou
        fetch(getApiUrl("/uploads/ou/generated_points.ou"))
          .then(res => res.text())
          .then(text => {
            const lines = text.split("\n").filter(l => l && !l.startsWith("#"));
            const data = lines.map(line => {
              const [x, y, z, property] = line.trim().split(/\s+/).map(Number);
              return [x, y, z, property];
            });
            setOuData(data);
          })
          .catch(fallbackError => {
            setOuData([]);
          });
      });
  }, [filename]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!filename || !mount) return;

    while (mount.firstChild) {
      mount.removeChild(mount.firstChild);
    }

    let renderer;
    let slicePlane = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true;
    mountRef.current.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(ambientLight, directionalLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableZoom = true;

    const clippingPlane = new THREE.Plane();
    scene.add(clippingPlane);

    const loader = new STLLoader();
    loader.load(getApiUrl(filename), (geometry) => {
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere.radius;
      const scale = 50 / radius;

      const material = new THREE.MeshNormalMaterial({ 
        wireframe: false,
        side: THREE.DoubleSide,
        clippingPlanes: showSlice ? [clippingPlane] : [],
        clipShadows: true,
        transparent: true,
        opacity: 0.9
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(scale, scale, scale);

      const existing = scene.getObjectByName("uploaded-stl");
      if (existing) scene.remove(existing);

      mesh.name = "uploaded-stl";
      scene.add(mesh);

      // Store the transformation info for heatmap coordinate mapping
      window.stlTransform = { center, scale };

      createSlicePlane();
    });

    // Optimized k-nearest neighbor interpolation with spatial indexing
    function createSpatialIndex() {
      if (!ouData.length) return null;
      
      // Create a simple spatial grid for faster lookups
      const gridSize = 50; // Adjust based on data density
      const grid = new Map();
      
      // Find bounding box of data
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      
      for (const [x, y, z] of ouData) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      
      const cellSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / gridSize;
      
      // Assign points to grid cells
      for (let i = 0; i < ouData.length; i++) {
        const [x, y, z] = ouData[i];
        const cellX = Math.floor((x - minX) / cellSize);
        const cellY = Math.floor((y - minY) / cellSize);
        const cellZ = Math.floor((z - minZ) / cellSize);
        const key = `${cellX},${cellY},${cellZ}`;
        
        if (!grid.has(key)) {
          grid.set(key, []);
        }
        grid.get(key).push(i);
      }
      
      return { grid, cellSize, minX, minY, minZ, maxX, maxY, maxZ };
    }

    // Fast nearest neighbor search using spatial index
    function fastInterpolateProperty(x, y, z, spatialIndex, k = 6) {
      if (!ouData.length || !spatialIndex) return 0;
      
      // Transform coordinates to match the STL's coordinate system
      const transform = window.stlTransform;
      if (transform) {
        x = (x / transform.scale) + transform.center.x;
        y = (y / transform.scale) + transform.center.y;
        z = (z / transform.scale) + transform.center.z;
      }
      
      const { grid, cellSize, minX, minY, minZ } = spatialIndex;
      
      // Find nearby grid cells
      const cellX = Math.floor((x - minX) / cellSize);
      const cellY = Math.floor((y - minY) / cellSize);
      const cellZ = Math.floor((z - minZ) / cellSize);
      
      const candidates = [];
      const searchRadius = 2; // Search nearby cells
      
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
          for (let dz = -searchRadius; dz <= searchRadius; dz++) {
            const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
            const cell = grid.get(key);
            if (cell) {
              candidates.push(...cell);
            }
          }
        }
      }
      
      if (candidates.length === 0) return 0;
      
      // Find k nearest from candidates
      const dists = candidates.map(idx => {
        const [px, py, pz] = ouData[idx];
        const dx = px - x, dy = py - y, dz = pz - z;
        return { idx, dist2: dx*dx + dy*dy + dz*dz };
      });
      
      dists.sort((a, b) => a.dist2 - b.dist2);
      
      let sum = 0, wsum = 0;
      for (let i = 0; i < Math.min(k, dists.length); ++i) {
        const { idx, dist2 } = dists[i];
        const w = 1 / (dist2 + 1e-6);
        sum += ouData[idx][3] * w;
        wsum += w;
      }
      return wsum > 0 ? sum / wsum : 0;
    }

    // Cached min/max values
    function getMinMaxValues() {
      if (cachedMinMaxRef.current) return cachedMinMaxRef.current;
      
      let minProp = Infinity, maxProp = -Infinity;
      for (const [, , , prop] of ouData) {
        if (prop < minProp) minProp = prop;
        if (prop > maxProp) maxProp = prop;
      }
      
      cachedMinMaxRef.current = { minProp, maxProp };
      return cachedMinMaxRef.current;
    }

    // Optimized heatmap generation with smaller texture and async processing
    function createHeatmapTexture(size = 64) { // Reduced from 256 to 64
      if (!ouData.length || isGeneratingHeatmap) return null;
      
      setIsGeneratingHeatmap(true);
      
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      
      // Get cached min/max values
      const { minProp, maxProp } = getMinMaxValues();
      
      // Create spatial index once
      const spatialIndex = createSpatialIndex();
      
      // Get STL bounding box for proper plane sizing
      const stlMesh = scene.getObjectByName("uploaded-stl");
      let planeSize = 100; // default
      if (stlMesh) {
        const bbox = new THREE.Box3().setFromObject(stlMesh);
        const size = bbox.getSize(new THREE.Vector3());
        planeSize = Math.max(size.x, size.y, size.z) * 1.2;
      }
      
      // Draw heatmap synchronously (simpler and more reliable)
      const imageData = ctx.createImageData(size, size);
      
      for (let i = 0; i < size; ++i) {
        for (let j = 0; j < size; ++j) {
          // Map (i, j) to plane coordinates
          const u = (i / (size - 1) - 0.5) * planeSize;
          const v = (j / (size - 1) - 0.5) * planeSize;
          let x = 0, y = 0, z = 0;
          
          if (sliceAxis === "x") {
            x = sliceValue;
            y = u;
            z = v;
          } else if (sliceAxis === "y") {
            x = u;
            y = sliceValue;
            z = v;
          } else {
            x = u;
            y = v;
            z = sliceValue;
          }
          
          // Fast interpolation
          const prop = fastInterpolateProperty(x, y, z, spatialIndex);
          
          // Normalize
          const t = (prop - minProp) / (maxProp - minProp + 1e-6);
          
          // Colormap: blue (low) -> yellow (mid) -> red (high)
          let r, g, b;
          if (t < 0.5) {
            r = 0;
            g = Math.floor(255 * (2 * t));
            b = Math.floor(255 * (1 - 2 * t));
          } else {
            r = Math.floor(255 * (2 * (t - 0.5)));
            g = Math.floor(255 * (1 - 2 * (t - 0.5)));
            b = 0;
          }
          
          const idx = (j * size + i) * 4;
          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          
          // Simplified masking - just check if we have any nearby data
          const hasNearbyData = prop > 0;
          imageData.data[idx + 3] = hasNearbyData ? 200 : 0;
        }
      }
      
      // Apply the image data and create texture
      ctx.putImageData(imageData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      
      setIsGeneratingHeatmap(false);
      return texture;
    }

    function createSlicePlane() {
      if (slicePlane) {
        scene.remove(slicePlane);
        slicePlane.geometry.dispose();
        slicePlane.material.dispose();
      }
      if (!showSlice) return;

      // Get STL bounding box for proper plane sizing
      const stlMesh = scene.getObjectByName("uploaded-stl");
      let planeSize = 100; // default
      if (stlMesh) {
        const bbox = new THREE.Box3().setFromObject(stlMesh);
        const size = bbox.getSize(new THREE.Vector3());
        planeSize = Math.max(size.x, size.y, size.z) * 1.2; // 20% larger than STL
      }
      
      const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
      // Always create the base plane (cyan, semi-transparent)
      const baseMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const basePlane = new THREE.Mesh(planeGeometry, baseMaterial);
      // Position and orient the plane based on slice axis
      if (sliceAxis === "x") {
        basePlane.rotation.y = Math.PI / 2;
        basePlane.position.set(sliceValue, 0, 0);
        clippingPlane.normal.set(1, 0, 0);
        clippingPlane.constant = -sliceValue;
      } else if (sliceAxis === "y") {
        basePlane.rotation.x = Math.PI / 2;
        basePlane.position.set(0, sliceValue, 0);
        clippingPlane.normal.set(0, 1, 0);
        clippingPlane.constant = -sliceValue;
      } else {
        basePlane.position.set(0, 0, sliceValue);
        clippingPlane.normal.set(0, 0, 1);
        clippingPlane.constant = -sliceValue;
      }
      scene.add(basePlane);
      
      // Handle heatmap if enabled
      if (showHeatmap && ouData.length > 0) {
        // Remove existing heatmap plane first
        const existingHeatmap = scene.getObjectByName("heatmap-plane");
        if (existingHeatmap) {
          scene.remove(existingHeatmap);
          existingHeatmap.geometry.dispose();
          existingHeatmap.material.dispose();
        }
        
        // Create new heatmap plane
        const heatmapTexture = createHeatmapTexture();
        if (heatmapTexture) {
          const heatmapMaterial = new THREE.MeshBasicMaterial({
            map: heatmapTexture,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          const heatmapPlane = new THREE.Mesh(planeGeometry, heatmapMaterial);
          heatmapPlane.position.copy(basePlane.position);
          heatmapPlane.rotation.copy(basePlane.rotation);
          heatmapPlane.renderOrder = 1; // ensure it's drawn above
          heatmapPlane.name = "heatmap-plane";
          scene.add(heatmapPlane);
        }
      } else {
        // Remove heatmap plane if disabled
        const existingHeatmap = scene.getObjectByName("heatmap-plane");
        if (existingHeatmap) {
          scene.remove(existingHeatmap);
          existingHeatmap.geometry.dispose();
          existingHeatmap.material.dispose();
        }
      }
      
      // Save reference for cleanup
      slicePlane = basePlane;
    }

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (renderer) {
        renderer.dispose();
      }
      if (mount && mount.hasChildNodes()) {
        const children = Array.from(mount.childNodes);
        for (let child of children) {
          if (child instanceof Node && mount.contains(child)) {
            mount.removeChild(child);
          }
        }
      }
      // Clean up heatmap plane
      const heatmapPlane = scene.getObjectByName("heatmap-plane");
      if (heatmapPlane) {
        scene.remove(heatmapPlane);
        heatmapPlane.geometry.dispose();
        heatmapPlane.material.dispose();
      }
    };
  }, [filename, sliceAxis, sliceValue, showSlice, showHeatmap, ouData]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div
        ref={mountRef}
        style={{ width: "100%", height: "500px", backgroundColor: "#f0f0f0" }}
      />
      <div style={{ marginTop: "10px" }}>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ marginRight: "10px" }}>
            <input
              type="checkbox"
              checked={showSlice}
              onChange={(e) => setShowSlice(e.target.checked)}
              style={{ marginRight: "5px" }}
            />
            Show Cross-Section
          </label>
          <label style={{ marginLeft: "20px" }}>
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              style={{ marginRight: "5px" }}
              disabled={!showSlice}
            />
            Show Heatmap
            {isGeneratingHeatmap && (
              <span style={{ marginLeft: "10px", color: "orange", fontSize: "12px" }}>
                ⏳ Generating...
              </span>
            )}
          </label>
        </div>
        {showSlice && (
          <>
            <div style={{ marginBottom: "10px" }}>
              <label style={{ marginRight: "10px" }}>Slice Axis:</label>
              {["x", "y", "z"].map(axis => (
                <label key={axis} style={{ marginRight: "15px" }}>
                  <input
                    type="radio"
                    name="sliceAxis"
                    checked={sliceAxis === axis}
                    onChange={() => setSliceAxis(axis)}
                    style={{ marginRight: "5px" }}
                  />
                  {axis.toUpperCase()}
                </label>
              ))}
            </div>
            <div>
              <label style={{ display: "inline-block", width: "20px" }}>
                {sliceAxis.toUpperCase()}: 
              </label>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={sliceValue}
                onChange={(e) => setSliceValue(Number(e.target.value))}
                style={{ width: "150px", marginLeft: "10px" }}
              />
              <span style={{ marginLeft: "10px", fontFamily: "monospace" }}>
                {sliceValue.toFixed(1)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Viewer3D;

