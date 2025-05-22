import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
// import { MeshPhongMaterial } from 'three';

function Viewer3D({ filename }) {
  const mountRef = useRef();

  useEffect(() => {
    if (!filename || !mountRef.current) return;

    // Declare global renderer to clean it up later
    let renderer;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(ambientLight, directionalLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableZoom = true;

    // Load STL model
    const loader = new STLLoader();
    loader.load(`http://localhost:8000/uploads/${filename}`, (geometry) => {
      console.log("✅ STL geometry loaded", geometry);

      const material = new THREE.MeshNormalMaterial({ wireframe: false });



      const mesh = new THREE.Mesh(geometry, material);

      // Center mesh
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      mesh.geometry.translate(-center.x, -center.y, -center.z);

      // Scale mesh
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere.radius;
      const scale = 50 / radius;
      mesh.scale.set(scale, scale, scale);

      // Remove old STL mesh if exists
      const existing = scene.getObjectByName("uploaded-stl");
      if (existing) scene.remove(existing);

      mesh.name = "uploaded-stl";
      scene.add(mesh);

      console.log("Bounding box:", bbox);
      console.log("Bounding sphere radius:", radius);
      console.log("Applied scale:", scale);
    });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resizing
    const handleResize = () => {
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);

      if (renderer) {
        renderer.dispose();
      }

      if (mountRef.current) {
        while (mountRef.current.firstChild) {
          mountRef.current.removeChild(mountRef.current.firstChild);
        }
      }
    };
  }, [filename]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "500px", backgroundColor: "#f0f0f0" }}
    />
  );
}

export default Viewer3D;
