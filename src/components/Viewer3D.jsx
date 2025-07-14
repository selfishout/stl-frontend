import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { getApiUrl } from "../config";

function Viewer3D({ filename }) {
  const mountRef = useRef();
  const [sliceAxis, setSliceAxis] = useState("z");
  const [sliceValue, setSliceValue] = useState(0);
  const [showSlice, setShowSlice] = useState(false);
  const [showSlicePlane, setShowSlicePlane] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [ouData, setOuData] = useState([]); // [[x, y, z, property], ...]
  const [isGeneratingHeatmap, setIsGeneratingHeatmap] = useState(false);
  const cachedMinMaxRef = useRef(null); // Cache for min/max values

  // Cache for boundary mask and spatial index
  const boundaryCache = useRef(new Map());
  const spatialIndexCache = useRef(new Map());
  
  // Debounced heatmap update
  const heatmapUpdateTimeout = useRef(null);
  
  const clearCaches = useCallback(() => {
    boundaryCache.current.clear();
    spatialIndexCache.current.clear();
  }, []);

  const clippingPlane = useRef(new THREE.Plane()).current;

  // Function to get properly oriented STL mesh for the current slice axis
  const getOrientedSTLMesh = useCallback(() => {
    const stlMesh = window.existingScene?.getObjectByName("uploaded-stl");
    if (!stlMesh) return null;
    
    // Create a clone for orientation analysis
    const clonedMesh = stlMesh.clone();
    
    // Apply the same transformations as the original mesh
    clonedMesh.position.copy(stlMesh.position);
    clonedMesh.rotation.copy(stlMesh.rotation);
    clonedMesh.scale.copy(stlMesh.scale);
    
    return clonedMesh;
  }, [sliceAxis]);

  const getBoundaryMask = useCallback((size = 64) => {
    const cacheKey = `${sliceAxis}_${sliceValue}_${size}`;
    if (boundaryCache.current.has(cacheKey)) {
      return boundaryCache.current.get(cacheKey);
    }
    
    // Get STL mesh for boundary detection
    const stlMesh = getOrientedSTLMesh();
    if (!stlMesh) return null;
    
    // Check if slice plane actually intersects the object
    const intersectionBbox = new THREE.Box3().setFromObject(stlMesh);
    const objectMin = intersectionBbox.min;
    const objectMax = intersectionBbox.max;
    
    let hasIntersection = false;
    if (sliceAxis === "x") {
      hasIntersection = sliceValue >= objectMin.x && sliceValue <= objectMax.x;
    } else if (sliceAxis === "y") {
      hasIntersection = sliceValue >= objectMin.y && sliceValue <= objectMax.y;
    } else {
      hasIntersection = sliceValue >= objectMin.z && sliceValue <= objectMax.z;
    }
    
    // If no intersection, return empty mask
    if (!hasIntersection) {
      const emptyMask = new Array(size * size).fill(false);
      const result = { boundaryMask: emptyMask, planeBounds: { minU: -50, maxU: 50, minV: -50, maxV: 50 }, hasIntersection: false };
      boundaryCache.current.set(cacheKey, result);
      return result;
    }
    
    // Get object bounds for precise plane sizing
    const bbox = new THREE.Box3().setFromObject(stlMesh);
    const objectSize = bbox.getSize(new THREE.Vector3());
    
    // Calculate exact plane bounds based on actual object intersection
    let planeBounds = { 
      minU: -50, maxU: 50, minV: -50, maxV: 50,
      minX: objectMin.x, maxX: objectMax.x,
      minY: objectMin.y, maxY: objectMax.y,
      minZ: objectMin.z, maxZ: objectMax.z
    };
    
    if (sliceAxis === "x") {
      planeBounds.minU = objectMin.y;
      planeBounds.maxU = objectMax.y;
      planeBounds.minV = objectMin.z;
      planeBounds.maxV = objectMax.z;
    } else if (sliceAxis === "y") {
      planeBounds.minU = objectMin.x;
      planeBounds.maxU = objectMax.x;
      planeBounds.minV = objectMin.z;
      planeBounds.maxV = objectMax.z;
    } else {
      planeBounds.minU = objectMin.x;
      planeBounds.maxU = objectMax.x;
      planeBounds.minV = objectMin.y;
      planeBounds.maxV = objectMax.y;
    }
    
    // Create raycaster for boundary detection
    const raycaster = new THREE.Raycaster();
    const rayDirection = new THREE.Vector3();
    
    // Set ray direction based on slice axis
    if (sliceAxis === "x") {
      rayDirection.set(1, 0, 0);
    } else if (sliceAxis === "y") {
      rayDirection.set(0, 1, 0);
        } else {
      rayDirection.set(0, 0, 1);
    }
    
    // Create boundary mask with exact object boundary detection
    const boundaryMask = new Array(size * size);
    
    for (let i = 0; i < size; ++i) {
      for (let j = 0; j < size; ++j) {
        // Use standard coordinate mapping for all axes
        const u = planeBounds.minU + (i / (size - 1)) * (planeBounds.maxU - planeBounds.minU);
        const v = planeBounds.minV + (j / (size - 1)) * (planeBounds.maxV - planeBounds.minV);
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
        
        // Cast ray from this point to detect if it's inside the object
        const rayOrigin = new THREE.Vector3(x, y, z);
        raycaster.set(rayOrigin, rayDirection);
        const intersects = raycaster.intersectObject(stlMesh, true);
        
        // If we have intersections, check if we're inside
        let isInsideObject = false;
        if (intersects.length > 0) {
          // Count intersections in both directions to determine if inside
          const reverseDirection = rayDirection.clone().negate();
          raycaster.set(rayOrigin, reverseDirection);
          const reverseIntersects = raycaster.intersectObject(stlMesh, true);
          
          // If we have intersections in both directions, we're likely inside
          isInsideObject = reverseIntersects.length > 0;
        }
        
                // Use standard indexing - let the coordinate transformation handle orientation
        const maskIndex = j * size + i;
        boundaryMask[maskIndex] = isInsideObject;
        

      }
    }
    
    const result = { boundaryMask, planeBounds, hasIntersection: true };
    boundaryCache.current.set(cacheKey, result);
    return result;
  }, [sliceAxis, sliceValue]);

  const getCachedSpatialIndex = useCallback(() => {
    if (!spatialIndexCache.current.has('spatialIndex')) {
      // Create spatial index function needs to be defined here
      const createSpatialIndex = () => {
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
      };
      
      spatialIndexCache.current.set('spatialIndex', createSpatialIndex());
    }
    return spatialIndexCache.current.get('spatialIndex');
  }, [ouData]);

  const updateHeatmapDebounced = useCallback(() => {
    if (heatmapUpdateTimeout.current) {
      clearTimeout(heatmapUpdateTimeout.current);
    }
    
    heatmapUpdateTimeout.current = setTimeout(() => {
      if (showHeatmap && ouData.length > 0 && window.existingScene) {
        const existingHeatmap = window.existingScene.getObjectByName("heatmap-plane");
        if (existingHeatmap) {
          window.existingScene.remove(existingHeatmap);
          existingHeatmap.geometry.dispose();
          existingHeatmap.material.dispose();
        }
        
        // Create heatmap texture inline to avoid circular dependency
        const createHeatmapTextureInline = (size = 64) => {
          if (!ouData.length || isGeneratingHeatmap) return null;
          
          setIsGeneratingHeatmap(true);
          
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          
          // Get cached min/max values
          const getMinMaxValues = () => {
            if (cachedMinMaxRef.current) {
              return cachedMinMaxRef.current;
            }
            
            let minProp = Infinity, maxProp = -Infinity;
            for (const [x, y, z, property] of ouData) {
              minProp = Math.min(minProp, property);
              maxProp = Math.max(maxProp, property);
            }
            
            cachedMinMaxRef.current = { minProp, maxProp };
            return cachedMinMaxRef.current;
          };
          
          const { minProp, maxProp } = getMinMaxValues();
          
          // Get cached spatial index
          const spatialIndex = getCachedSpatialIndex();
          
          // Get cached boundary mask and plane bounds
          const boundaryResult = getBoundaryMask(size) || { boundaryMask: [], planeBounds: { minU: -50, maxU: 50, minV: -50, maxV: 50 }, hasIntersection: false };
          const { boundaryMask, planeBounds, hasIntersection } = boundaryResult;
          
          // If no intersection, don't generate heatmap
          if (!hasIntersection) {
            setIsGeneratingHeatmap(false);
            return null;
          }
          
          // Fast interpolation function
          const fastInterpolateProperty = (x, y, z, spatialIndex, k = 6) => {
            if (!ouData.length || !spatialIndex) return 0;
            
            // Transform coordinates to match the STL's coordinate system
            const transform = window.stlTransform;
            if (transform) {
              x = (x / transform.scale) + transform.center.x;
              y = (y / transform.scale) + transform.center.y;
              z = (z / transform.scale) + transform.center.z;
            }
            
            // Find the grid cell for this point
            const cellX = Math.floor((x - spatialIndex.minX) / spatialIndex.cellSize);
            const cellY = Math.floor((y - spatialIndex.minY) / spatialIndex.cellSize);
            const cellZ = Math.floor((z - spatialIndex.minZ) / spatialIndex.cellSize);
            
            // Search in current cell and neighboring cells
            const candidates = [];
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                  const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
                  const cellPoints = spatialIndex.grid.get(key);
                  if (cellPoints) {
                    candidates.push(...cellPoints);
                  }
                }
              }
            }
            
            if (candidates.length === 0) return 0;
            
            // Calculate distances and find k nearest neighbors
            const distances = candidates.map(i => {
              const [px, py, pz] = ouData[i];
              const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2);
              return { index: i, distance: dist };
            });
            
            distances.sort((a, b) => a.distance - b.distance);
            const nearest = distances.slice(0, Math.min(k, distances.length));
            
            // Weighted average based on inverse distance
            let totalWeight = 0;
            let weightedSum = 0;
            
            for (const { index, distance } of nearest) {
              const weight = distance === 0 ? 1 : 1 / distance;
              totalWeight += weight;
              weightedSum += weight * ouData[index][3]; // property value
            }
            
            return totalWeight === 0 ? 0 : weightedSum / totalWeight;
          };
          
          // Draw heatmap with cached boundary detection
          const imageData = ctx.createImageData(size, size);
          

          
          for (let i = 0; i < size; ++i) {
            for (let j = 0; j < size; ++j) {
              // Use standard coordinate mapping for all axes
              const u = planeBounds.minU + (i / (size - 1)) * (planeBounds.maxU - planeBounds.minU);
              const v = planeBounds.minV + (j / (size - 1)) * (planeBounds.maxV - planeBounds.minV);
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
              
              // Fast interpolation for property value
              const prop = fastInterpolateProperty(x, y, z, spatialIndex);
              
              // Use standard indexing - let the coordinate transformation handle orientation
              const maskIndex = j * size + i;
              const isInsideObject = boundaryMask[maskIndex];
              

              
              // Normalize
              const t = (prop - minProp) / (maxProp - minProp + 1e-6);
              
              // Colormap: blue (low) -> yellow (mid) -> red (high)
              let r, g, b, a;
              if (isInsideObject && prop > 0) {
                if (t < 0.5) {
                  r = 0;
                  g = Math.floor(255 * (2 * t));
                  b = Math.floor(255 * (1 - 2 * t));
                } else {
                  r = Math.floor(255 * (2 * (t - 0.5)));
                  g = Math.floor(255 * (1 - 2 * (t - 0.5)));
                  b = 0;
                }
                a = 200; // Semi-transparent
              } else {
                r = g = b = 0;
                a = 0; // Transparent
              }
              
              const idx = (j * size + i) * 4;
              imageData.data[idx] = r;
              imageData.data[idx + 1] = g;
              imageData.data[idx + 2] = b;
              imageData.data[idx + 3] = a;
            }
          }
          
          // Apply the image data and create texture
          ctx.putImageData(imageData, 0, 0);
          
          // Fix orientation by flipping the canvas if needed
          let finalTexture;
          if (sliceAxis === "x" || sliceAxis === "y") {
            const flippedCanvas = document.createElement("canvas");
            flippedCanvas.width = size;
            flippedCanvas.height = size;
            const flippedCtx = flippedCanvas.getContext("2d");
            
            // Fix orientation based on slice axis
            if (sliceAxis === "x") {
              // Rotate 90 degrees clockwise for X-axis
              flippedCtx.translate(size / 2, size / 2);
              flippedCtx.rotate(Math.PI / 2);
              flippedCtx.drawImage(canvas, -size / 2, -size / 2);
            } else if (sliceAxis === "y") {
              // Flip vertically for Y-axis
              flippedCtx.scale(1, -1);
              flippedCtx.translate(0, -size);
              flippedCtx.drawImage(canvas, 0, 0);
            }
            
            finalTexture = new THREE.CanvasTexture(flippedCanvas);
          } else {
            finalTexture = new THREE.CanvasTexture(canvas);
          }
          
          finalTexture.needsUpdate = true;
          setIsGeneratingHeatmap(false);
          return finalTexture;
        };
        
        const heatmapTexture = createHeatmapTextureInline();
        if (heatmapTexture) {
          const stlMesh = window.existingScene.getObjectByName("uploaded-stl");
          if (stlMesh) {
            const bbox = new THREE.Box3().setFromObject(stlMesh);
            const objectMin = bbox.min;
            const objectMax = bbox.max;
            const objectSize = bbox.getSize(new THREE.Vector3());
            
            // Calculate heatmap plane size based on exact object bounds with small margin
            let heatmapWidth, heatmapHeight;
            if (sliceAxis === "x") {
              heatmapWidth = (objectMax.z - objectMin.z) * 1.05; // width = Z
              heatmapHeight = (objectMax.y - objectMin.y) * 1.05; // height = Y
            } else if (sliceAxis === "y") {
              heatmapWidth = (objectMax.x - objectMin.x) * 1.05;
              heatmapHeight = (objectMax.z - objectMin.z) * 1.05;
            } else {
              heatmapWidth = (objectMax.x - objectMin.x) * 1.05;
              heatmapHeight = (objectMax.y - objectMin.y) * 1.05;
            }
            
            const heatmapGeometry = new THREE.PlaneGeometry(heatmapWidth, heatmapHeight);
            const heatmapMaterial = new THREE.MeshBasicMaterial({
              map: heatmapTexture,
      transparent: true,
              opacity: 0.8,
      side: THREE.DoubleSide,
              depthWrite: false
            });
            const heatmapPlane = new THREE.Mesh(heatmapGeometry, heatmapMaterial);
            
            // Position the heatmap plane at the current slice position
            const basePlane = window.existingScene.getObjectByName("slice-plane");
            if (basePlane) {
              heatmapPlane.position.copy(basePlane.position);
              heatmapPlane.rotation.copy(basePlane.rotation);
            }
            
            heatmapPlane.renderOrder = 1;
            heatmapPlane.name = "heatmap-plane";
            
            // Ensure heatmap plane doesn't interfere with object rotation
            heatmapPlane.userData.isHeatmap = true;
            heatmapPlane.visible = true;
            heatmapPlane.userData.pickable = false; // Prevent interference with controls
            
            window.existingScene.add(heatmapPlane);
          }
        }
      }
    }, 50); // 50ms debounce for smooth interaction
  }, [showHeatmap, ouData, sliceAxis, sliceValue, getBoundaryMask, getCachedSpatialIndex]);



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

    // Only recreate the entire scene if filename changes
    // For slice parameter changes, we'll just update the slice plane
    if (filename !== mount.dataset.currentFile) {
      while (mount.firstChild) {
        mount.removeChild(mount.firstChild);
      }
      mount.dataset.currentFile = filename;
    }

    let renderer;
    let scene, camera, controls;

    // Check if we need to recreate the scene or just update slice
    const existingRenderer = mount.querySelector('canvas');
    if (existingRenderer) {
      // Reuse existing scene, camera, controls
      scene = window.existingScene;
      camera = window.existingCamera;
      controls = window.existingControls;
      renderer = window.existingRenderer;
    } else {
      // Create new scene
      scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;

      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

          renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.localClippingEnabled = true; // Enable clipping
    mountRef.current.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(ambientLight, directionalLight);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.enableRotate = true;
      
      // Configure controls to prevent interference with planes
      controls.addEventListener('start', () => {
        // Temporarily hide planes during interaction for better performance
        const heatmapPlane = scene.getObjectByName("heatmap-plane");
        const slicePlane = scene.getObjectByName("slice-plane");
        if (heatmapPlane) heatmapPlane.visible = false;
        if (slicePlane) slicePlane.visible = false;
      });
      
      controls.addEventListener('end', () => {
        // Show planes after interaction
        const heatmapPlane = scene.getObjectByName("heatmap-plane");
        const slicePlane = scene.getObjectByName("slice-plane");
        if (heatmapPlane) heatmapPlane.visible = true;
        if (slicePlane) slicePlane.visible = true;
      });

      // Store references for reuse
      window.existingScene = scene;
      window.existingCamera = camera;
      window.existingControls = controls;
      window.existingRenderer = renderer;
    }

    // Function to update clipping plane configuration
    function updateClippingPlane() {
      if (showSlice) {
        if (sliceAxis === "x") {
          clippingPlane.normal.set(1, 0, 0);
          clippingPlane.constant = -sliceValue; // Negative to cut properly
        } else if (sliceAxis === "y") {
          clippingPlane.normal.set(0, 1, 0);
          clippingPlane.constant = -sliceValue; // Negative to cut properly
        } else {
          clippingPlane.normal.set(0, 0, 1);
          clippingPlane.constant = -sliceValue; // Negative to cut properly
        }
      }
    }

    // Always load STL on upload
    {
      // Clear heatmap when switching STL files
      const existingHeatmap = scene.getObjectByName("heatmap-plane");
      if (existingHeatmap) {
        scene.remove(existingHeatmap);
        existingHeatmap.geometry.dispose();
        existingHeatmap.material.dispose();
      }
      
      // Clear caches when switching files
      clearCaches();

      const loader = new STLLoader();
      loader.load(getApiUrl(`/uploads/stl/${filename}`), (geometry) => {
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
      const center = new THREE.Vector3();
        bbox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

        geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere.radius;
        const scale = 50 / radius;

        // Configure clipping plane before creating material
        updateClippingPlane();

        const material = new THREE.MeshNormalMaterial({ 
          wireframe: false,
          side: THREE.DoubleSide,
          clippingPlanes: showSlice ? [clippingPlane] : [],
          clipShadows: true,
          transparent: true,
          opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(scale, scale, scale);

        const currentSTL = scene.getObjectByName("uploaded-stl");
        if (currentSTL) scene.remove(currentSTL);

        mesh.name = "uploaded-stl";
        scene.add(mesh);
        // Immediately force clipping plane update and debug
        mesh.material.clippingPlanes = showSlice ? [clippingPlane] : [];
        mesh.material.needsUpdate = true;
        console.log('Mesh added:', {
          showSlice,
          clippingPlanes: mesh.material.clippingPlanes,
          needsUpdate: mesh.material.needsUpdate
        });

        // Store the transformation info for heatmap coordinate mapping
        window.stlTransform = { center, scale };

        createSlicePlane();
      });
    }
    
    // Always update the existing STL mesh material with new clipping plane
    // This ensures it works even when showSlice changes after STL is loaded
    const existingSTL = scene.getObjectByName("uploaded-stl");
    if (existingSTL && existingSTL.material) {
      // Ensure clipping plane is properly configured before applying
      updateClippingPlane();
      if (showSlice) {
        existingSTL.material.clippingPlanes = [clippingPlane];
      } else {
        existingSTL.material.clippingPlanes = [];
      }
      existingSTL.material.needsUpdate = true;
    }

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

    // Optimized heatmap generation with efficient object boundary detection


    function createSlicePlane() {
      // Remove existing slice planes
      const existingSlicePlane = scene.getObjectByName("slice-plane");
      if (existingSlicePlane) {
        scene.remove(existingSlicePlane);
        existingSlicePlane.geometry.dispose();
        existingSlicePlane.material.dispose();
      }
      if (!showSlice) return;

      // Get STL bounding box for proper plane sizing
      const stlMesh = scene.getObjectByName("uploaded-stl");
      let planeSize = 100; // default
      if (stlMesh) {
        const bbox = new THREE.Box3().setFromObject(stlMesh);
        const objectMin = bbox.min;
        const objectMax = bbox.max;
        const size = bbox.getSize(new THREE.Vector3());
        
        // Calculate exact plane size based on slice axis with small margin
        if (sliceAxis === "x") {
          planeSize = Math.max(objectMax.z - objectMin.z, objectMax.y - objectMin.y) * 1.05;
        } else if (sliceAxis === "y") {
          planeSize = Math.max(objectMax.x - objectMin.x, objectMax.z - objectMin.z) * 1.05;
        } else {
          planeSize = Math.max(objectMax.x - objectMin.x, objectMax.y - objectMin.y) * 1.05;
        }
      }
      
      const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
      // Always create the base plane (cyan, semi-transparent)
      const baseMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.8,
          side: THREE.DoubleSide, 
        depthWrite: false
      });
      const basePlane = new THREE.Mesh(planeGeometry, baseMaterial);
      // Position and orient the plane based on slice axis
      if (sliceAxis === "x") {
        basePlane.rotation.y = Math.PI / 2;
        basePlane.position.set(sliceValue, 0, 0);
      } else if (sliceAxis === "y") {
        basePlane.rotation.x = Math.PI / 2;
        basePlane.position.set(0, sliceValue, 0);
      } else {
        basePlane.position.set(0, 0, sliceValue);
      }
      
      // Update clipping plane configuration
      updateClippingPlane();
      basePlane.name = "slice-plane";
      
      // Only add the slice plane to scene if showSlicePlane is true
      if (showSlicePlane) {
        basePlane.userData.pickable = false; // Prevent interference with controls
        scene.add(basePlane);
      }
      
      // Handle heatmap if enabled - use debounced update for smooth interaction
      if (showHeatmap && ouData.length > 0) {
        // Check if slice plane intersects the object before showing heatmap
        const stlMesh = scene.getObjectByName("uploaded-stl");
        if (stlMesh) {
          const bbox = new THREE.Box3().setFromObject(stlMesh);
          const objectMin = bbox.min;
          const objectMax = bbox.max;
          
          let hasIntersection = false;
          if (sliceAxis === "x") {
            hasIntersection = sliceValue >= objectMin.x && sliceValue <= objectMax.x;
          } else if (sliceAxis === "y") {
            hasIntersection = sliceValue >= objectMin.y && sliceValue <= objectMax.y;
          } else {
            hasIntersection = sliceValue >= objectMin.z && sliceValue <= objectMax.z;
          }
          
          if (hasIntersection) {
            updateHeatmapDebounced();
          } else {
            // Remove heatmap plane if no intersection
            const existingHeatmap = scene.getObjectByName("heatmap-plane");
            if (existingHeatmap) {
              scene.remove(existingHeatmap);
              existingHeatmap.geometry.dispose();
              existingHeatmap.material.dispose();
            }
          }
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
      
      // Only dispose everything if the component is unmounting (filename changed)
      if (filename !== mount.dataset.currentFile) {
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
        // Clean up global references
        delete window.existingScene;
        delete window.existingCamera;
        delete window.existingControls;
        delete window.existingRenderer;
      } else {
        // Just clean up slice planes for parameter changes
        const heatmapPlane = scene.getObjectByName("heatmap-plane");
        if (heatmapPlane) {
          scene.remove(heatmapPlane);
          heatmapPlane.geometry.dispose();
          heatmapPlane.material.dispose();
        }
        const slicePlane = scene.getObjectByName("slice-plane");
        if (slicePlane) {
          scene.remove(slicePlane);
          slicePlane.geometry.dispose();
          slicePlane.material.dispose();
        }
      }
    };
  }, [filename, sliceAxis, showSlice, showSlicePlane, showHeatmap, ouData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Separate effect for slice value changes (debounced heatmap updates)
  useEffect(() => {
    if (showSlice) {
      // Update slice plane position when sliceValue changes
      if (window.existingScene) {
        const slicePlane = window.existingScene.getObjectByName("slice-plane");
        if (slicePlane) {
          // Update position based on slice axis
          if (sliceAxis === "x") {
            slicePlane.position.set(sliceValue, 0, 0);
          } else if (sliceAxis === "y") {
            slicePlane.position.set(0, sliceValue, 0);
          } else {
            slicePlane.position.set(0, 0, sliceValue);
          }
        }
        
        // Update clipping plane
        const stlMesh = window.existingScene.getObjectByName("uploaded-stl");
        if (stlMesh && stlMesh.material) {
          const clippingPlane = stlMesh.material.clippingPlanes?.[0];
          if (clippingPlane) {
            if (sliceAxis === "x") {
      clippingPlane.normal.set(1, 0, 0);
      clippingPlane.constant = -sliceValue;
            } else if (sliceAxis === "y") {
      clippingPlane.normal.set(0, 1, 0);
      clippingPlane.constant = -sliceValue;
            } else {
      clippingPlane.normal.set(0, 0, 1);
      clippingPlane.constant = -sliceValue;
    }
          }
        }
      }
      
      // Update heatmap if enabled and intersection exists
      if (showHeatmap && ouData.length > 0) {
        const stlMesh = window.existingScene.getObjectByName("uploaded-stl");
        if (stlMesh) {
          const bbox = new THREE.Box3().setFromObject(stlMesh);
          const objectMin = bbox.min;
          const objectMax = bbox.max;
          
          let hasIntersection = false;
          if (sliceAxis === "x") {
            hasIntersection = sliceValue >= objectMin.x && sliceValue <= objectMax.x;
          } else if (sliceAxis === "y") {
            hasIntersection = sliceValue >= objectMin.y && sliceValue <= objectMax.y;
          } else {
            hasIntersection = sliceValue >= objectMin.z && sliceValue <= objectMax.z;
          }
          
          if (hasIntersection) {
            updateHeatmapDebounced();
          } else {
            // Remove heatmap plane if no intersection
            const existingHeatmap = window.existingScene.getObjectByName("heatmap-plane");
            if (existingHeatmap) {
              window.existingScene.remove(existingHeatmap);
              existingHeatmap.geometry.dispose();
              existingHeatmap.material.dispose();
            }
          }
        }
      }
    }
  }, [sliceValue, sliceAxis, showSlice, showHeatmap, ouData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear caches when slice axis changes
  useEffect(() => {
    clearCaches();
  }, [sliceAxis, clearCaches]);

  // Update mesh material clippingPlanes when showSlice changes
  useEffect(() => {
    const stlMesh = window.existingScene?.getObjectByName("uploaded-stl");
    if (stlMesh && stlMesh.material) {
      // Ensure clipping plane is properly configured before applying
      if (showSlice) {
        stlMesh.material.clippingPlanes = [clippingPlane];
      } else {
        stlMesh.material.clippingPlanes = [];
      }
      stlMesh.material.needsUpdate = true;
    }
  }, [showSlice, sliceAxis, sliceValue]);

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
          {showSlice && (
            <label style={{ marginLeft: "20px" }}>
              <input
                type="checkbox"
                checked={showSlicePlane}
                onChange={(e) => setShowSlicePlane(e.target.checked)}
                style={{ marginRight: "5px" }}
              />
              Show Slice Plane
            </label>
          )}
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

