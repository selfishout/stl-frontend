import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

function Viewer3D_old2({ filename }) {
  const mountRef = useRef();
  const [sliceX, setSliceX] = useState(0);
  const [sliceY, setSliceY] = useState(0);
  const [sliceZ, setSliceZ] = useState(0);
  const [planeX, setPlaneX] = useState(null);
  const [planeY, setPlaneY] = useState(null);
  const [planeZ, setPlaneZ] = useState(null);

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
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(ambientLight, directionalLight);

    const loader = new STLLoader();
    loader.load(`https://stl-backend-ipt7.onrender.com/uploads/${filename}`, (geometry) => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);

      const radius = geometry.boundingSphere.radius;
      const scale = 50 / radius;
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
      );
      mesh.scale.set(scale, scale, scale);
      scene.add(mesh);

      const size = 100;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0.25,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const planeGeom = new THREE.PlaneGeometry(size, size);

      const xPlane = new THREE.Mesh(planeGeom, mat.clone());
      xPlane.rotation.y = Math.PI / 2;
      scene.add(xPlane);
      setPlaneX(xPlane);

      const yPlane = new THREE.Mesh(planeGeom, mat.clone());
      yPlane.rotation.x = Math.PI / 2;
      scene.add(yPlane);
      setPlaneY(yPlane);

      const zPlane = new THREE.Mesh(planeGeom, mat.clone());
      scene.add(zPlane);
      setPlaneZ(zPlane);
    });

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      renderer.dispose();
    };
  }, [filename]);

  useEffect(() => {
    if (planeX) planeX.position.x = sliceX;
  }, [sliceX, planeX]);

  useEffect(() => {
    if (planeY) planeY.position.y = sliceY;
  }, [sliceY, planeY]);

  useEffect(() => {
    if (planeZ) planeZ.position.z = sliceZ;
  }, [sliceZ, planeZ]);

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", height: "500px" }} />
      <div>
        <label>X Slice</label>
        <input type="range" min={-50} max={50} value={sliceX} onChange={(e) => setSliceX(Number(e.target.value))} />
        <label>Y Slice</label>
        <input type="range" min={-50} max={50} value={sliceY} onChange={(e) => setSliceY(Number(e.target.value))} />
        <label>Z Slice</label>
        <input type="range" min={-50} max={50} value={sliceZ} onChange={(e) => setSliceZ(Number(e.target.value))} />
      </div>
    </div>
  );
}

export default Viewer3D_old2;
