import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

function colormap(value, min, max) {
  const t = (value - min) / (max - min);
  const color = new THREE.Color();
  color.setHSL(0.7 * (1 - t), 1.0, 0.5); // blue to red
  return color;
}

function Viewer3D_old1({ filename }) {
  const mountRef = useRef();
  const [renderer, setRenderer] = useState(null);
  const [scene, setScene] = useState(null);
  const [mesh, setMesh] = useState(null);
  const [camera, setCamera] = useState(null);

  const [showSlices, setShowSlices] = useState(false);
  const [sliceX, setSliceX] = useState(100);
  const [sliceY, setSliceY] = useState(100);
  const [sliceZ, setSliceZ] = useState(100);

  const [sliceColor, setSliceColor] = useState(() => localStorage.getItem("sliceColor") || "#999999");
  const [useColormap, setUseColormap] = useState(() => localStorage.getItem("useColormap") === "true");

  const planes = useRef([
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 100),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 100),
  ]);

  useEffect(() => {
    if (!filename || !mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0xf0f0f0);

    const newCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    newCamera.position.set(0, 0, 100);
    setCamera(newCamera);

    const newRenderer = new THREE.WebGLRenderer({ antialias: true });
    newRenderer.setSize(width, height);
    newRenderer.localClippingEnabled = true;
    setRenderer(newRenderer);
    setScene(newScene);
    mountRef.current.appendChild(newRenderer.domElement);

    const controls = new OrbitControls(newCamera, newRenderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    newScene.add(ambientLight, directionalLight);

    const loader = new STLLoader();
    loader.load(
      `http://localhost:8000/uploads/${filename}`,
      (geometry) => {
        try {
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();

          const center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);

          const radius = geometry.boundingSphere.radius;
          const scale = 50 / radius;

          const values = Array(geometry.attributes.position.count).fill(0).map((_, i) => Math.sin(i * 0.1));
          const min = Math.min(...values);
          const max = Math.max(...values);
          const colorArray = [];
          for (let i = 0; i < values.length; i++) {
            const color = colormap(values[i], min, max);
            colorArray.push(color.r, color.g, color.b);
          }
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorArray, 3));

          const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            shininess: 50,
            side: THREE.DoubleSide,
            clippingPlanes: showSlices ? planes.current : [],
            clipShadows: true,
          });

          const newMesh = new THREE.Mesh(geometry, material);
          newMesh.scale.set(scale, scale, scale);
          newMesh.name = "stl-mesh";

          const existing = newScene.getObjectByName("stl-mesh");
          if (existing) newScene.remove(existing);

          newScene.add(newMesh);
          setMesh(newMesh);
        } catch (e) {
          throw new Error("Invalid STL geometry: no position attribute");
        }
      },
      undefined
    );

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      newRenderer.render(newScene, newCamera);
    };
    animate();

    const handleResize = () => {
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      newRenderer.setSize(width, height);
      newCamera.aspect = width / height;
      newCamera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    const currentMount = mountRef.current;

    return () => {
      if (currentMount) {
        while (currentMount.firstChild) {
          currentMount.removeChild(currentMount.firstChild);
        }
      }
      newRenderer.dispose();
    };
  }, [filename, useColormap, showSlices]);

  useEffect(() => {
    if (!mesh) return;
    const mat = new THREE.MeshPhongMaterial({
      shininess: 50,
      side: THREE.DoubleSide,
      clippingPlanes: showSlices ? planes.current : [],
      vertexColors: useColormap,
      color: useColormap ? undefined : new THREE.Color(sliceColor),
    });
    mesh.material = mat;
  }, [showSlices, sliceColor, useColormap, mesh]);

  useEffect(() => {
    planes.current[0].constant = sliceX;
    planes.current[1].constant = sliceY;
    planes.current[2].constant = sliceZ;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }, [sliceX, sliceY, sliceZ, renderer, scene, camera]);

  const toggleSlices = () => {
    setShowSlices((prev) => !prev);
    setSliceX(100);
    setSliceY(100);
    setSliceZ(100);
  };

  useEffect(() => {
    localStorage.setItem("sliceColor", sliceColor);
    localStorage.setItem("useColormap", useColormap);
  }, [sliceColor, useColormap]);

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", height: "500px" }} />
      <div style={{ marginTop: "10px" }}>
        <button onClick={toggleSlices}>
          {showSlices ? "Hide Cross-Section" : "Show Cross-Section"}
        </button>
        <label style={{ marginLeft: "10px" }}>
          Use Colormap
          <input
            type="checkbox"
            checked={useColormap}
            onChange={(e) => setUseColormap(e.target.checked)}
            style={{ marginLeft: "5px" }}
          />
        </label>
      </div>
      {showSlices && (
        <div style={{ marginTop: "10px" }}>
          <label>X Slice</label>
          <input type="range" min={-50} max={150} value={sliceX} onChange={(e) => setSliceX(Number(e.target.value))} />
          <br />
          <label>Y Slice</label>
          <input type="range" min={-50} max={150} value={sliceY} onChange={(e) => setSliceY(Number(e.target.value))} />
          <br />
          <label>Z Slice</label>
          <input type="range" min={-50} max={150} value={sliceZ} onChange={(e) => setSliceZ(Number(e.target.value))} />
          <br />
          <label>Slice Color:</label>
          <input
            type="color"
            value={sliceColor}
            onChange={(e) => setSliceColor(e.target.value)}
            style={{ marginLeft: "10px" }}
          />
        </div>
      )}
    </div>
  );
}

export default Viewer3D_old1;
